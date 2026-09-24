import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { locateBoloUiSource } from '@process/services/projects/bolouiSourceLocator';

const roots: string[] = [];

async function createSourceTree(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'boloui-source-'));
  roots.push(root);
  await mkdir(path.join(root, 'packages', 'desktop', 'src'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{}');
  await writeFile(path.join(root, 'AGENTS.md'), '# Rules');
  await writeFile(path.join(root, 'packages', 'desktop', 'package.json'), '{}');
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('locateBoloUiSource', () => {
  it('prefers a validated environment path', async () => {
    const source = await createSourceTree();

    expect(
      locateBoloUiSource({
        environmentPath: source,
        cwd: tmpdir(),
        executablePath: path.join(tmpdir(), 'BoloUi.exe'),
        homeDirectory: tmpdir(),
      })
    ).toBe(source);
  });

  it('finds the source from a nested working directory', async () => {
    const source = await createSourceTree();
    const nested = path.join(source, 'packages', 'desktop', 'src');

    expect(
      locateBoloUiSource({
        cwd: nested,
        executablePath: path.join(tmpdir(), 'BoloUi.exe'),
        homeDirectory: tmpdir(),
      })
    ).toBe(source);
  });

  it('rejects a directory that only resembles a repository', async () => {
    const invalid = await mkdtemp(path.join(tmpdir(), 'boloui-invalid-'));
    roots.push(invalid);
    await writeFile(path.join(invalid, 'package.json'), '{}');

    expect(
      locateBoloUiSource({
        environmentPath: invalid,
        cwd: invalid,
        executablePath: path.join(invalid, 'BoloUi.exe'),
        homeDirectory: invalid,
      })
    ).toBeNull();
  });
});
