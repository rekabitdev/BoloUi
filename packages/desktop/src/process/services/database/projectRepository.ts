import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  DesktopProject,
  DesktopProjectEntry,
  DesktopProjectProfile,
  ProjectMemorySearchResult,
} from '@/common/types/project';
import { getDataPath } from '@process/utils';
import {
  cosineSimilarity,
  deserializeEmbedding,
  embedProjectMemory,
  PROJECT_EMBEDDING_DIMENSIONS,
  PROJECT_EMBEDDING_MODEL,
  serializeEmbedding,
} from './projectEmbeddingService';

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
    CREATE TABLE IF NOT EXISTS project_memory_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding BLOB,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES desktop_projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, content_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_project_memory_chunks_project_created
      ON project_memory_chunks(project_id, created_at DESC);
  `);
  const projectColumns = database.prepare('PRAGMA table_info(desktop_projects)').all() as Array<{ name: string }>;
  if (!projectColumns.some((column) => column.name === 'memory')) {
    database.exec("ALTER TABLE desktop_projects ADD COLUMN memory TEXT NOT NULL DEFAULT '';");
  }
  const memoryColumns = database.prepare('PRAGMA table_info(project_memory_chunks)').all() as Array<{ name: string }>;
  if (!memoryColumns.some((column) => column.name === 'embedding')) {
    database.exec('ALTER TABLE project_memory_chunks ADD COLUMN embedding BLOB;');
  }
  if (!memoryColumns.some((column) => column.name === 'embedding_model')) {
    database.exec('ALTER TABLE project_memory_chunks ADD COLUMN embedding_model TEXT;');
  }
  if (!memoryColumns.some((column) => column.name === 'embedding_dimensions')) {
    database.exec('ALTER TABLE project_memory_chunks ADD COLUMN embedding_dimensions INTEGER;');
  }
  database.exec('DROP TABLE IF EXISTS project_memory_fts;');
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

export function upsertDesktopProject(entry: DesktopProjectEntry, profile?: DesktopProjectProfile): DesktopProject {
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
      project.updatedAt
    );

  return getDesktopProject(entry.workspace) ?? project;
}

function normalizeMemoryContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 12_000);
}

function memoryHash(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

type MemoryVectorRow = {
  id: string;
  project_id: string;
  conversation_id: string | null;
  source: ProjectMemorySearchResult['source'];
  content: string;
  embedding: Uint8Array;
  created_at: string;
};

/** Stores a deduplicated memory chunk with its local Hugging Face embedding. */
export async function rememberProjectTurn(input: {
  workspace: string;
  conversationId?: string;
  source: 'turn' | 'handoff' | 'manual';
  content: string;
}): Promise<void> {
  const project = getDesktopProject(input.workspace);
  const content = normalizeMemoryContent(input.content);
  if (!project || content.length < 20) return;

  const db = getDatabase();
  const hash = memoryHash(content);
  const existing = db
    .prepare('SELECT id, embedding_model FROM project_memory_chunks WHERE project_id = ? AND content_hash = ?')
    .get(project.id, hash) as { id: string; embedding_model: string | null } | undefined;
  if (existing?.embedding_model === PROJECT_EMBEDDING_MODEL) return;

  const embedding = await embedProjectMemory(content, 'passage');
  if (existing) {
    db.prepare(`
      UPDATE project_memory_chunks
      SET embedding = ?, embedding_model = ?, embedding_dimensions = ?
      WHERE id = ?
    `).run(serializeEmbedding(embedding), PROJECT_EMBEDDING_MODEL, PROJECT_EMBEDDING_DIMENSIONS, existing.id);
    return;
  }

  db.prepare(`
    INSERT INTO project_memory_chunks (
      id, project_id, conversation_id, source, content, content_hash,
      embedding, embedding_model, embedding_dimensions, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    project.id,
    input.conversationId ?? null,
    input.source,
    content,
    hash,
    serializeEmbedding(embedding),
    PROJECT_EMBEDDING_MODEL,
    PROJECT_EMBEDDING_DIMENSIONS,
    new Date().toISOString()
  );
}

/** Backfills embeddings for memory captured before the local model was installed. */
export async function backfillProjectMemoryEmbeddings(): Promise<number> {
  const db = getDatabase();
  const rows = db
    .prepare(`
      SELECT id, content
      FROM project_memory_chunks
      WHERE embedding IS NULL OR embedding_model IS NULL OR embedding_model != ?
      ORDER BY created_at ASC
    `)
    .all(PROJECT_EMBEDDING_MODEL) as unknown as Array<{ id: string; content: string }>;

  let updated = 0;
  for (const row of rows) {
    const embedding = await embedProjectMemory(row.content, 'passage');
    db.prepare(`
      UPDATE project_memory_chunks
      SET embedding = ?, embedding_model = ?, embedding_dimensions = ?
      WHERE id = ?
    `).run(serializeEmbedding(embedding), PROJECT_EMBEDDING_MODEL, PROJECT_EMBEDDING_DIMENSIONS, row.id);
    updated += 1;
  }
  return updated;
}

/** Recalls semantically similar chunks from only the requested Project. */
export async function recallProjectMemory(input: {
  workspace: string;
  query: string;
  limit?: number;
}): Promise<ProjectMemorySearchResult[]> {
  const project = getDesktopProject(input.workspace);
  const query = normalizeMemoryContent(input.query);
  if (!project || !query) return [];

  const limit = Math.max(1, Math.min(input.limit ?? 6, 10));
  const queryEmbedding = await embedProjectMemory(query, 'query');
  const rows = getDatabase()
    .prepare(`
      SELECT id, project_id, conversation_id, source, content, embedding, created_at
      FROM project_memory_chunks
      WHERE project_id = ?
        AND embedding IS NOT NULL
        AND embedding_model = ?
        AND embedding_dimensions = ?
    `)
    .all(project.id, PROJECT_EMBEDDING_MODEL, PROJECT_EMBEDDING_DIMENSIONS) as unknown as MemoryVectorRow[];

  return rows
    .map((row) => ({
      id: row.id,
      projectId: row.project_id,
      conversationId: row.conversation_id ?? undefined,
      source: row.source,
      content: row.content,
      createdAt: row.created_at,
      rank: cosineSimilarity(queryEmbedding, deserializeEmbedding(row.embedding)),
    }))
    .filter((row) => Number.isFinite(row.rank))
    .sort((left, right) => right.rank - left.rank)
    .slice(0, limit);
}

export function deleteDesktopProject(workspace: string): boolean {
  const project = getDesktopProject(workspace);
  if (!project) return false;
  return getDatabase().prepare('DELETE FROM desktop_projects WHERE id = ?').run(project.id).changes > 0;
}

/** Closes the Project database connection. Intended for orderly shutdown and tests. */
export function closeDesktopProjectDatabase(): void {
  database?.close();
  database = null;
}
