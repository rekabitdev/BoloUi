/**
 * @license
 * Copyright 2025 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyDirectoryRecursively } from '@process/utils/utils';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'boloui-bundled-skill-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('bundled skill installation', () => {
  it('copies the complete skill package recursively', async () => {
    const root = await createTemporaryDirectory();
    const source = path.join(root, 'source', 'example-skill');
    const destination = path.join(root, 'installed', 'example-skill');

    await mkdir(path.join(source, 'scripts'), { recursive: true });
    await mkdir(path.join(source, 'references', 'nested'), { recursive: true });
    await mkdir(path.join(source, 'assets'), { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), '# Example skill');
    await writeFile(path.join(source, 'scripts', 'run.py'), 'print("ready")');
    await writeFile(path.join(source, 'references', 'nested', 'guide.md'), '# Guide');
    await writeFile(path.join(source, 'assets', 'template.json'), '{"enabled":true}');

    await copyDirectoryRecursively(source, destination);

    await expect(readFile(path.join(destination, 'SKILL.md'), 'utf8')).resolves.toBe('# Example skill');
    await expect(readFile(path.join(destination, 'scripts', 'run.py'), 'utf8')).resolves.toBe('print("ready")');
    await expect(readFile(path.join(destination, 'references', 'nested', 'guide.md'), 'utf8')).resolves.toBe('# Guide');
    await expect(readFile(path.join(destination, 'assets', 'template.json'), 'utf8')).resolves.toBe('{"enabled":true}');
  });
});
