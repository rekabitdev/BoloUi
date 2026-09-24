import { createWriteStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZipFile } from 'yazl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const roots: string[] = [];
let skillsRoot = '';

vi.mock('@process/utils/initStorage', () => ({
  getSkillsDir: () => skillsRoot,
}));

const createArchive = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), 'boloui-plugin-test-'));
  roots.push(root);
  const zipPath = path.join(root, 'plugins.zip');
  const zip = new ZipFile();
  for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), name);
  await new Promise<void>((resolve, reject) => {
    zip.outputStream.pipe(createWriteStream(zipPath)).on('close', resolve).on('error', reject);
    zip.end();
  });
  return zipPath;
};

const manifest = (overrides = '') => `
name: safe-plugin
version: 1.0.0
description: Safe declarative plugin
author: Test
requires_env: []
hooks:
  - pre_llm_call
provides_tools: []
${overrides}`;

describe('pluginInstaller', () => {
  beforeEach(async () => {
    skillsRoot = await mkdtemp(path.join(tmpdir(), 'boloui-skills-test-'));
    roots.push(skillsRoot);
  });

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('installs a ZIPku-style declarative plugin as a global skill', async () => {
    const zipPath = await createArchive({
      'bundle/safe-plugin/plugin.yaml': manifest(),
      'bundle/safe-plugin/README.md': '# Safe plugin\nUse evidence before changes.',
    });
    const { installPluginArchive } = await import('@process/services/plugins/pluginInstaller');

    const result = await installPluginArchive(zipPath);

    expect(result.rejected).toEqual([]);
    expect(result.installed).toEqual([{ name: 'safe-plugin', version: '1.0.0', hooks: ['pre_llm_call'] }]);
    expect(existsSync(path.join(skillsRoot, 'safe-plugin', 'SKILL.md'))).toBe(true);
    const metadata = JSON.parse(await readFile(path.join(skillsRoot, 'safe-plugin', 'plugin.json'), 'utf8')) as {
      hooks: string[];
    };
    expect(metadata.hooks).toEqual(['pre_llm_call']);
  });

  it('normalizes hooks and provides_hooks without duplicates', async () => {
    const zipPath = await createArchive({
      'safe-plugin/plugin.yaml': manifest('provides_hooks:\n  - pre_llm_call\n  - post_tool_call'),
      'safe-plugin/README.md': '# Safe plugin',
    });
    const { installPluginArchive } = await import('@process/services/plugins/pluginInstaller');

    const result = await installPluginArchive(zipPath);

    expect(result.installed[0]?.hooks).toEqual(['pre_llm_call', 'post_tool_call']);
  });

  it.each([
    ['invalid slug', 'name: Unsafe_Plugin'],
    ['invalid semantic version', 'version: latest'],
    ['unknown hook', 'hooks:\n  - unknown_hook'],
    ['environment requirement', 'requires_env:\n  - SECRET_TOKEN'],
    ['executable tool', 'provides_tools:\n  - unsafe_tool'],
    ['unknown manifest field', 'capabilities: []'],
  ])('rejects an invalid manifest with %s', async (_caseName, override) => {
    const zipPath = await createArchive({
      'safe-plugin/plugin.yaml': manifest(override),
      'safe-plugin/README.md': '# Invalid plugin',
    });
    const { installPluginArchive } = await import('@process/services/plugins/pluginInstaller');

    await expect(installPluginArchive(zipPath)).rejects.toThrow();
    expect(existsSync(path.join(skillsRoot, 'safe-plugin'))).toBe(false);
  });

  it('ignores backup and cache files instead of installing them', async () => {
    const zipPath = await createArchive({
      'safe-plugin/plugin.yaml': manifest(),
      'safe-plugin/README.md': '# Safe plugin',
      'safe-plugin/README.md.backup-2026': 'old',
      'safe-plugin/.pytest_cache/state.json': '{}',
      'safe-plugin/.gitignore': '*.tmp',
    });
    const { installPluginArchive } = await import('@process/services/plugins/pluginInstaller');

    const result = await installPluginArchive(zipPath);

    expect(result.installed).toHaveLength(1);
    expect(existsSync(path.join(skillsRoot, 'safe-plugin', 'README.md.backup-2026'))).toBe(false);
    expect(existsSync(path.join(skillsRoot, 'safe-plugin', '.pytest_cache'))).toBe(false);
  });

  it('installs valid siblings while rejecting an invalid plugin independently', async () => {
    const zipPath = await createArchive({
      'bundle/safe-plugin/plugin.yaml': manifest(),
      'bundle/safe-plugin/README.md': '# Safe plugin',
      'bundle/unsafe-plugin/plugin.yaml': manifest('name: unsafe-plugin\nprovides_tools:\n  - shell'),
      'bundle/unsafe-plugin/README.md': '# Unsafe plugin',
    });
    const { installPluginArchive } = await import('@process/services/plugins/pluginInstaller');

    const result = await installPluginArchive(zipPath);

    expect(result.installed.map((item) => item.name)).toEqual(['safe-plugin']);
    expect(result.rejected).toEqual([
      expect.objectContaining({ plugin: 'unsafe-plugin', reason: expect.stringContaining('tools') }),
    ]);
  });
});
