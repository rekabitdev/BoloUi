import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { parse } from 'yaml';
import { getSkillsDir } from '@process/utils/initStorage';

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_COUNT = 2_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const SAFE_FILE_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.txt', '.py']);
const ALLOWED_HOOKS = new Set([
  'transform_llm_output',
  'pre_llm_call',
  'pre_tool_call',
  'post_tool_call',
  'on_session_reset',
  'pre_verify',
]);

type PluginManifest = {
  name: string;
  version: string;
  description: string;
  author: string;
  license?: string;
  homepage?: string;
  requires_env?: string[];
  hooks?: string[];
  provides_hooks?: string[];
  provides_tools?: string[];
};

type ValidatedPluginManifest = PluginManifest & {
  normalizedHooks: string[];
};

const MANIFEST_FIELDS = new Set([
  'name',
  'version',
  'description',
  'author',
  'license',
  'homepage',
  'requires_env',
  'hooks',
  'provides_hooks',
  'provides_tools',
]);

export type PluginInstallResult = {
  installed: Array<{ name: string; version: string; hooks: string[] }>;
  rejected: Array<{ plugin: string; reason: string }>;
};

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Unable to open plugin archive'));
      else resolve(zip);
    });
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error(`Unable to read ${entry.fileName}`));
      else resolve(stream);
    });
  });
}

function safeArchivePath(fileName: string): string {
  const normalized = fileName.replaceAll('\\', '/').replace(/\/$/, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`Unsafe archive path: ${fileName}`);
  }
  return normalized;
}

function readStringArray(manifest: Record<string, unknown>, field: keyof PluginManifest): string[] {
  const value = manifest[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Manifest field "${field}" must be an array of non-empty strings`);
  }
  return value.map((item) => String(item).trim());
}

function validateManifest(value: unknown): ValidatedPluginManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Manifest must be an object');
  const manifest = value as Record<string, unknown>;
  const unknownFields = Object.keys(manifest).filter((field) => !MANIFEST_FIELDS.has(field));
  if (unknownFields.length > 0) throw new Error(`Unknown manifest fields: ${unknownFields.join(', ')}`);

  const requiredStrings = ['name', 'version', 'description', 'author'] as const;
  for (const field of requiredStrings) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim())
      throw new Error(`Manifest ${field} is required`);
  }
  for (const field of ['license', 'homepage'] as const) {
    if (manifest[field] !== undefined && (typeof manifest[field] !== 'string' || !manifest[field].trim())) {
      throw new Error(`Manifest ${field} must be a non-empty string`);
    }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name as string)) {
    throw new Error('Manifest name must be a lowercase slug');
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version as string)) {
    throw new Error('Manifest version must be semantic versioning');
  }

  const requiresEnv = readStringArray(manifest, 'requires_env');
  if (requiresEnv.length > 0) throw new Error('Environment-dependent plugins are not supported');
  const providedTools = readStringArray(manifest, 'provides_tools');
  if (providedTools.length > 0) throw new Error('Executable plugin tools are not supported');
  const normalizedHooks = [
    ...new Set([...readStringArray(manifest, 'hooks'), ...readStringArray(manifest, 'provides_hooks')]),
  ];
  const unsupportedHooks = normalizedHooks.filter((hook) => !ALLOWED_HOOKS.has(hook));
  if (unsupportedHooks.length > 0) throw new Error(`Unsupported hooks: ${unsupportedHooks.join(', ')}`);

  return { ...(manifest as PluginManifest), normalizedHooks };
}

function isIgnoredArchiveFile(relativePath: string): boolean {
  return (
    relativePath.split('/').some((segment) => segment === '.pytest_cache' || segment === '__pycache__') ||
    /(^|\/)(?:\.gitignore|[^/]+\.(?:bak|backup)(?:[-.][^/]*)?)$/i.test(relativePath)
  );
}

async function extractValidatedArchive(zipPath: string, destination: string): Promise<Map<string, string[]>> {
  const zip = await openZip(zipPath);
  const rejectedFiles = new Map<string, string[]>();
  let entries = 0;
  let totalBytes = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('entry', (entry) => {
        void (async () => {
          entries += 1;
          totalBytes += entry.uncompressedSize;
          if (entries > MAX_ENTRY_COUNT) throw new Error('Plugin archive contains too many files');
          if (entry.uncompressedSize > MAX_FILE_BYTES) throw new Error(`Plugin file is too large: ${entry.fileName}`);
          if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Plugin archive expands beyond the allowed size');
          const relative = safeArchivePath(entry.fileName);
          const outputPath = path.join(destination, ...relative.split('/'));
          if (entry.fileName.endsWith('/')) {
            await mkdir(outputPath, { recursive: true });
          } else {
            if (isIgnoredArchiveFile(relative)) {
              zip.readEntry();
              return;
            }
            const extension = path.extname(relative).toLocaleLowerCase();
            if (!SAFE_FILE_EXTENSIONS.has(extension)) {
              const segments = relative.split('/');
              const pluginRoot = segments.length >= 2 ? segments.slice(0, 2).join('/') : segments[0];
              rejectedFiles.set(pluginRoot, [...(rejectedFiles.get(pluginRoot) ?? []), relative]);
              zip.readEntry();
              return;
            }
            await mkdir(path.dirname(outputPath), { recursive: true });
            await pipeline(await openEntry(zip, entry), createWriteStream(outputPath, { flags: 'wx' }));
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.once('end', resolve);
      zip.once('error', reject);
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return rejectedFiles;
}

function buildSkill(manifest: ValidatedPluginManifest, readme: string): string {
  return `---\nname: ${manifest.name}\ndescription: ${JSON.stringify(manifest.description)}\n---\n\n# ${manifest.name}\n\n${readme.trim()}\n\n## Plugin metadata\n\n- Version: ${manifest.version}\n- Author: ${manifest.author}\n- Hooks: ${manifest.normalizedHooks.join(', ') || 'none'}\n`;
}

/** Validates and installs declarative ZIP plugins as global BoloUi skills. */
export async function installPluginArchive(zipPath: string): Promise<PluginInstallResult> {
  if (!zipPath.toLocaleLowerCase().endsWith('.zip')) throw new Error('Plugin package must be a ZIP archive');
  const archiveSize = (await stat(zipPath)).size;
  if (archiveSize > MAX_ARCHIVE_BYTES) throw new Error('Plugin archive exceeds 100 MB');

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'boloui-plugin-'));
  const result: PluginInstallResult = { installed: [], rejected: [] };
  try {
    const rejectedFiles = await extractValidatedArchive(zipPath, temporaryRoot);
    const manifests: string[] = [];
    async function walk(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          const target = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(target);
          else if (entry.name === 'plugin.yaml' || entry.name === 'plugin.yml') manifests.push(target);
        })
      );
    }
    await walk(temporaryRoot);
    if (manifests.length === 0) throw new Error('No plugin.yaml manifest found');

    for (const manifestPath of manifests) {
      const pluginFolder = path.dirname(manifestPath);
      try {
        const relativePluginRoot = path.relative(temporaryRoot, pluginFolder).replaceAll('\\', '/');
        const unsafeFiles = rejectedFiles.get(relativePluginRoot);
        if (unsafeFiles?.length) throw new Error(`Unsupported files: ${unsafeFiles.join(', ')}`);
        const manifest = validateManifest(parse(await readFile(manifestPath, 'utf8')));
        const readmePath = path.join(pluginFolder, 'README.md');
        if (!existsSync(readmePath)) throw new Error('README.md entrypoint is required');
        const target = path.join(getSkillsDir(), manifest.name);
        const staging = `${target}.installing-${crypto.randomUUID()}`;
        await mkdir(staging, { recursive: true });
        await writeFile(
          path.join(staging, 'SKILL.md'),
          buildSkill(manifest, await readFile(readmePath, 'utf8')),
          'utf8'
        );
        await writeFile(
          path.join(staging, 'plugin.json'),
          JSON.stringify(
            {
              name: manifest.name,
              version: manifest.version,
              description: manifest.description,
              author: manifest.author,
              license: manifest.license,
              homepage: manifest.homepage,
              hooks: manifest.normalizedHooks,
              requires_env: [],
              provides_tools: [],
            },
            null,
            2
          ),
          'utf8'
        );
        await rm(target, { recursive: true, force: true });
        await rename(staging, target);
        result.installed.push({ name: manifest.name, version: manifest.version, hooks: manifest.normalizedHooks });
      } catch (error) {
        result.rejected.push({
          plugin: path.basename(pluginFolder),
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (result.installed.length === 0)
      throw new Error(result.rejected.map((item) => `${item.plugin}: ${item.reason}`).join('; '));
    return result;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
