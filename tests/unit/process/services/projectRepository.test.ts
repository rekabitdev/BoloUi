import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dataPath = mkdtempSync(path.join(tmpdir(), 'boloui-projects-'));

vi.mock('@process/utils', () => ({ getDataPath: () => dataPath }));
vi.mock('@/process/services/database/projectEmbeddingService', () => ({
  PROJECT_EMBEDDING_MODEL: 'test-embedding-model',
  PROJECT_EMBEDDING_DIMENSIONS: 3,
  embedProjectMemory: async (text: string) =>
    text.toLocaleLowerCase().includes('authentication') ? Float32Array.from([1, 0, 0]) : Float32Array.from([0, 1, 0]),
  serializeEmbedding: (embedding: Float32Array) => new Uint8Array(embedding.buffer),
  deserializeEmbedding: (value: Uint8Array) => new Float32Array(Uint8Array.from(value).buffer),
  cosineSimilarity: (left: Float32Array, right: Float32Array) =>
    left.reduce((sum, value, index) => sum + value * right[index], 0),
}));

const repository = await import('@/process/services/database/projectRepository');

const entry = {
  id: 'project-1',
  name: 'Example Project',
  workspace: 'C:\\workspace\\example',
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
};

const profile = {
  instructions: 'Use the project rules.',
  skills: ['review'],
  context: 'Project context',
  memory: 'Decision: keep the implementation lightweight.',
  model: { providerId: 'provider-1', modelId: 'model-1' },
  coworkWorkspace: 'C:\\workspace\\cowork',
  documents: [{ name: 'SOUL.md', content: '# Soul' }],
};

describe('projectRepository', () => {
  afterAll(() => {
    repository.closeDesktopProjectDatabase();
    rmSync(dataPath, { recursive: true, force: true });
  });

  it('persists and reads a complete project profile from SQLite', () => {
    const saved = repository.upsertDesktopProject(entry, profile);

    expect(saved).toMatchObject({
      id: entry.id,
      name: entry.name,
      workspace: entry.workspace,
      createdAt: entry.createdAt,
      ...profile,
    });
    expect(repository.getDesktopProject(entry.workspace)).toMatchObject({
      id: entry.id,
      name: entry.name,
      workspace: entry.workspace,
      createdAt: entry.createdAt,
      ...profile,
    });
    expect(repository.listDesktopProjects()).toEqual([
      expect.objectContaining({ id: entry.id, name: entry.name, workspace: entry.workspace }),
    ]);
  });

  it('recalls memory only from the matching Project', async () => {
    await repository.rememberProjectTurn({
      workspace: entry.workspace,
      conversationId: 'conversation-1',
      source: 'turn',
      content: 'The authentication decision uses SQLite sessions and encrypted cookies.',
    });
    await repository.rememberProjectTurn({
      workspace: entry.workspace,
      conversationId: 'conversation-1',
      source: 'turn',
      content: 'The authentication decision uses SQLite sessions and encrypted cookies.',
    });

    await expect(
      repository.recallProjectMemory({ workspace: entry.workspace, query: 'authentication SQLite' })
    ).resolves.toEqual([
      expect.objectContaining({
        projectId: entry.id,
        conversationId: 'conversation-1',
        source: 'turn',
        content: expect.stringContaining('SQLite sessions'),
      }),
    ]);
    await expect(
      repository.recallProjectMemory({ workspace: 'C:\\workspace\\other', query: 'authentication' })
    ).resolves.toEqual([]);
  });

  it('backfills embeddings for legacy memory rows', async () => {
    const databasePath = path.join(dataPath, 'boloui-desktop.db');
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(databasePath);
    db.prepare('UPDATE project_memory_chunks SET embedding = NULL, embedding_model = NULL').run();
    db.close();

    await expect(repository.backfillProjectMemoryEmbeddings()).resolves.toBe(1);
    await expect(
      repository.recallProjectMemory({ workspace: entry.workspace, query: 'authentication' })
    ).resolves.toHaveLength(1);
  });

  it('updates a project by workspace without duplicating it', () => {
    repository.upsertDesktopProject({ ...entry, name: 'Renamed Project' }, { ...profile, context: 'Updated' });

    expect(repository.listDesktopProjects()).toHaveLength(1);
    expect(repository.getDesktopProject(entry.workspace)).toMatchObject({
      id: entry.id,
      name: 'Renamed Project',
      context: 'Updated',
    });
  });

  it('deletes project metadata without touching the workspace', () => {
    expect(repository.deleteDesktopProject(entry.workspace)).toBe(true);
    expect(repository.getDesktopProject(entry.workspace)).toBeNull();
    expect(repository.deleteDesktopProject(entry.workspace)).toBe(false);
  });
});
