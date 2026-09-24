import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { removeDirectorySafe } = require('../../../packages/shared-scripts/src/prepare-aioncore');

describe('prepare-aioncore resource cleanup', () => {
  it('removes an existing backend resource tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'boloui-backend-cleanup-'));
    const target = join(root, 'resources', 'bundled-aioncore', 'win32-x64');
    mkdirSync(join(target, 'managed-resources'), { recursive: true });
    writeFileSync(join(target, 'bolouicore.exe'), 'test');
    writeFileSync(join(target, 'managed-resources', 'manifest.json'), '{}');

    try {
      removeDirectorySafe(target);
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does nothing when the target does not exist', () => {
    const target = join(tmpdir(), `boloui-missing-${crypto.randomUUID()}`);
    expect(() => removeDirectorySafe(target)).not.toThrow();
  });
});
