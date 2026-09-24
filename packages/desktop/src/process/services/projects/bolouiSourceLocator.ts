import { existsSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_PATHS = [
  'package.json',
  'AGENTS.md',
  path.join('packages', 'desktop', 'package.json'),
  path.join('packages', 'desktop', 'src'),
];

function isBoloUiSource(directory: string): boolean {
  return REQUIRED_PATHS.every((relativePath) => existsSync(path.join(directory, relativePath)));
}

function ancestors(directory: string): string[] {
  const result: string[] = [];
  let current = path.resolve(directory);
  while (true) {
    result.push(current);
    const parent = path.dirname(current);
    if (parent === current) return result;
    current = parent;
  }
}

/** Locates a validated BoloUi source tree without modifying it. */
export function locateBoloUiSource(options?: {
  environmentPath?: string;
  cwd?: string;
  executablePath?: string;
  homeDirectory?: string;
}): string | null {
  const candidates = [
    options?.environmentPath ?? process.env.BOLOUI_SOURCE_PATH,
    ...ancestors(options?.cwd ?? process.cwd()),
    ...ancestors(path.dirname(options?.executablePath ?? process.execPath)),
    path.join(options?.homeDirectory ?? process.env.USERPROFILE ?? '', 'BoloUi'),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    const key = process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isBoloUiSource(resolved)) return resolved;
  }
  return null;
}
