import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DesktopProject, DesktopProjectEntry, DesktopProjectProfile } from '@/common/types/project';
import { getDataPath } from '@process/utils';

const DATABASE_FILE_NAME = 'boloui-desktop.db';

type ProjectRow = {
  id: string;
  name: string;
  workspace: string;
  model_json: string | null;
  cowork_workspace: string | null;
  instructions: string;
  skills_json: string;
  context: string;
  memory: string;
  documents_json: string;
  created_at: string;
  updated_at: string;
};

let database: DatabaseSync | null = null;

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getDatabase(): DatabaseSync {
  if (database) return database;

  const directory = getDataPath();
  mkdirSync(directory, { recursive: true });
  database = new DatabaseSync(path.join(directory, DATABASE_FILE_NAME));
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS desktop_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace TEXT NOT NULL UNIQUE,
      model_json TEXT,
      cowork_workspace TEXT,
      instructions TEXT NOT NULL DEFAULT '',
      skills_json TEXT NOT NULL DEFAULT '[]',
      context TEXT NOT NULL DEFAULT '',
      memory TEXT NOT NULL DEFAULT '',
      documents_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_desktop_projects_updated_at
      ON desktop_projects(updated_at DESC);
  `);
  const columns = database.prepare('PRAGMA table_info(desktop_projects)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'memory')) {
    database.exec("ALTER TABLE desktop_projects ADD COLUMN memory TEXT NOT NULL DEFAULT '';");
  }
  return database;
}

function rowToProject(row: ProjectRow): DesktopProject {
  return {
    id: row.id,
    name: row.name,
    workspace: row.workspace,
    model: parseJson<DesktopProjectProfile['model']>(row.model_json, undefined),
    coworkWorkspace: row.cowork_workspace ?? undefined,
    instructions: row.instructions,
    skills: parseJson<string[]>(row.skills_json, []),
    context: row.context,
    memory: row.memory,
    documents: parseJson<DesktopProjectProfile['documents']>(row.documents_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Ensures the Project database and its schema migrations are ready. */
export function initializeDesktopProjectDatabase(): void {
  getDatabase();
}

export function listDesktopProjects(): DesktopProjectEntry[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM desktop_projects ORDER BY updated_at DESC')
    .all() as unknown as ProjectRow[];
  return rows.map((row) => {
    const project = rowToProject(row);
    const { id, name, workspace, createdAt, updatedAt } = project;
    return { id, name, workspace, createdAt, updatedAt };
  });
}

export function getDesktopProject(workspace: string): DesktopProject | null {
  const row = getDatabase().prepare('SELECT * FROM desktop_projects WHERE workspace = ?').get(workspace) as
    | ProjectRow
    | undefined;
  return row ? rowToProject(row) : null;
}

export function upsertDesktopProject(
  entry: DesktopProjectEntry,
  profile?: DesktopProjectProfile,
): DesktopProject {
  const existing = getDesktopProject(entry.workspace);
  const now = new Date().toISOString();
  const project: DesktopProject = {
    id: existing?.id ?? entry.id,
    name: entry.name,
    workspace: entry.workspace,
    model: profile?.model ?? existing?.model,
    coworkWorkspace: profile?.coworkWorkspace ?? existing?.coworkWorkspace,
    instructions: profile?.instructions ?? existing?.instructions ?? '',
    skills: profile?.skills ?? existing?.skills ?? [],
    context: profile?.context ?? existing?.context ?? '',
    memory: profile?.memory ?? existing?.memory ?? '',
    documents: profile?.documents ?? existing?.documents ?? [],
    createdAt: existing?.createdAt ?? entry.createdAt,
    updatedAt: now,
  };

  getDatabase()
    .prepare(`
      INSERT INTO desktop_projects (
        id, name, workspace, model_json, cowork_workspace, instructions,
        skills_json, context, memory, documents_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace) DO UPDATE SET
        name = excluded.name,
        model_json = excluded.model_json,
        cowork_workspace = excluded.cowork_workspace,
        instructions = excluded.instructions,
        skills_json = excluded.skills_json,
        context = excluded.context,
        memory = excluded.memory,
        documents_json = excluded.documents_json,
        updated_at = excluded.updated_at
    `)
    .run(
      project.id,
      project.name,
      project.workspace,
      project.model ? JSON.stringify(project.model) : null,
      project.coworkWorkspace ?? null,
      project.instructions,
      JSON.stringify(project.skills),
      project.context,
      project.memory,
      JSON.stringify(project.documents),
      project.createdAt,
      project.updatedAt,
    );

  return getDesktopProject(entry.workspace) ?? project;
}

export function deleteDesktopProject(workspace: string): boolean {
  return getDatabase().prepare('DELETE FROM desktop_projects WHERE workspace = ?').run(workspace).changes > 0;
}

/** Closes the Project database connection. Intended for orderly shutdown and tests. */
export function closeDesktopProjectDatabase(): void {
  database?.close();
  database = null;
}
