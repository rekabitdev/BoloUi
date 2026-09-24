/**
 * @license
 * Copyright 2026 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => {
      const handlerMap = new Map<string, Function>();
      return {
        provider: vi.fn((handler: Function) => {
          handlerMap.set('handler', handler);
          return vi.fn();
        }),
        invoke: vi.fn(),
        _getHandler: () => handlerMap.get('handler'),
      };
    }),
    buildEmitter: vi.fn(() => ({ emit: vi.fn(), on: vi.fn() })),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '2.1.40'),
    getPath: vi.fn(() => '/test/path'),
    exit: vi.fn(),
    isPackaged: true,
  },
  autoUpdater: { on: vi.fn(), removeListener: vi.fn() },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    setFeedURL: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    transports: { file: { level: 'info' } },
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));

const realPlatform = process.platform;
const realArch = process.arch;

beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
});

afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  Object.defineProperty(process, 'arch', { value: realArch, configurable: true });
});

const githubRelease = {
  tag_name: 'v2.1.45',
  name: 'v2.1.45',
  body: 'changelog body',
  html_url: 'https://github.com/rekabitdev/BoloUi/releases/tag/v2.1.45',
  published_at: '2026-07-31T14:45:19.381Z',
  prerelease: false,
  draft: false,
  assets: [
    {
      name: 'BoloUi-2.1.45-mac-arm64.dmg',
      browser_download_url:
        'https://github.com/rekabitdev/BoloUi/releases/download/v2.1.45/BoloUi-2.1.45-mac-arm64.dmg',
      size: 200,
      content_type: 'application/x-apple-diskimage',
    },
  ],
};

const getCheckHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');
  initUpdateBridge();
  const provider = vi.mocked(ipcBridge.update.check.provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error('update.check handler not registered');
  return lastCall[0];
};

const stubFetch = (response: Response | Error) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toContain('https://api.github.com/repos/rekabitdev/BoloUi/releases');
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('update.check GitHub Releases', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('reports an update and recommends the matching GitHub asset', async () => {
    stubFetch(jsonResponse([githubRelease]));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(true);
    expect(res.data?.latest?.version).toBe('2.1.45');
    expect(res.data?.latest?.body).toBe('changelog body');
    expect(res.data?.latest?.recommendedAsset?.url).toContain('/rekabitdev/BoloUi/releases/download/');
  });

  it('reports up-to-date when the newest release equals the current version', async () => {
    stubFetch(jsonResponse([{ ...githubRelease, tag_name: 'v2.1.40' }]));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(false);
  });

  it('ignores prereleases unless they are requested', async () => {
    stubFetch(jsonResponse([{ ...githubRelease, tag_name: 'v2.2.0-beta.1', prerelease: true }]));
    const handler = await getCheckHandler();
    const res = await handler({ includePrerelease: false });

    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(false);
  });

  it('returns a failed check when GitHub is unavailable', async () => {
    stubFetch(new Error('github unreachable'));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(false);
  });

  it('returns a failed check for an unsuccessful GitHub response', async () => {
    stubFetch(jsonResponse({ message: 'rate limited' }, 403));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(false);
  });
});
