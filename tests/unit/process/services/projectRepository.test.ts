import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const dataPath = mkdtempSync(path.join(tmpdir(), 'boloui-projects-'));

vi.mock('@process/utils', () => ({ getDataPath: () => dataPath }));

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
