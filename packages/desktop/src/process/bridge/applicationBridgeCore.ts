/**
 * @license
 * Copyright 2025 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform-agnostic application bridge handlers.
 * Safe to use in both Electron and WebUI server mode.
 * Electron-only handlers (restart, devtools, zoom, CDP) remain in applicationBridge.ts.
 */
import os from 'os';
import path from 'path';
import { ipcBridge } from '@/common';
import {
  backfillProjectMemoryEmbeddings,
  deleteDesktopProject,
  getDesktopProject,
  initializeDesktopProjectDatabase,
  listDesktopProjects,
  recallProjectMemory,
  rememberProjectTurn,
  upsertDesktopProject,
} from '@process/services/database/projectRepository';
import { createSkillFileService } from '@process/services/skills';
import { installPluginArchive } from '@process/services/plugins/pluginInstaller';
import { locateBoloUiSource } from '@process/services/projects/bolouiSourceLocator';
import { getSystemDir, ProcessEnv } from '@process/utils/initStorage';
import { copyDirectoryRecursively, getConfigPath, getDataPath, resolveCliSafePath } from '@process/utils';

export function initApplicationBridgeCore(): void {
  initializeDesktopProjectDatabase();
  void backfillProjectMemoryEmbeddings().catch((error: unknown) => {
    console.error('[ProjectMemory] Failed to backfill local embeddings:', error);
  });
  const skillFiles = createSkillFileService();

  ipcBridge.plugins.installArchive.provider(({ zipPath }) => installPluginArchive(zipPath));

  ipcBridge.desktopProjects.list.provider(() => listDesktopProjects());
  ipcBridge.desktopProjects.get.provider(({ workspace }) => getDesktopProject(workspace));
  ipcBridge.desktopProjects.upsert.provider(({ entry, profile }) => upsertDesktopProject(entry, profile));
  ipcBridge.desktopProjects.delete.provider(({ workspace }) => deleteDesktopProject(workspace));
  ipcBridge.desktopProjects.remember.provider((input) => rememberProjectTurn(input));
  ipcBridge.desktopProjects.recall.provider((input) => recallProjectMemory(input));
  ipcBridge.desktopProjects.locateBoloUiSource.provider(() => locateBoloUiSource());

  ipcBridge.fs.listSkillFiles.provider(({ skill_location }) => skillFiles.list(skill_location));
  ipcBridge.fs.readSkillFile.provider(({ skill_location, relative_path }) =>
    skillFiles.read(skill_location, relative_path)
  );

  // application.systemInfo is served by the backend via HTTP; updateSystemInfo
  // and getPath below remain buildProvider (true IPC) because they need
  // main-process-only APIs (copyDirectoryRecursively, os.homedir()).
  ipcBridge.application.updateSystemInfo.provider(async ({ cacheDir, workDir, logDir }) => {
    const oldDir = getSystemDir();
    const safeCacheDir = resolveCliSafePath(cacheDir, getConfigPath());
    const safeWorkDir = resolveCliSafePath(workDir, getDataPath());
    const safeLogDir = logDir ? resolveCliSafePath(logDir, oldDir.logDir) : oldDir.logDir;

    if (oldDir.cacheDir !== safeCacheDir) {
      await copyDirectoryRecursively(oldDir.cacheDir, safeCacheDir);
    }
    await ProcessEnv.set('boloui.dir', { cacheDir: safeCacheDir, workDir: safeWorkDir, logDir: safeLogDir });
  });

  ipcBridge.application.getPath.provider(({ name }) => {
    // Resolve common paths without Electron
    const home = os.homedir();
    const map: Record<string, string> = {
      home,
      desktop: path.join(home, 'Desktop'),
      downloads: path.join(home, 'Downloads'),
    };
    return Promise.resolve(map[name] ?? home);
  });
}
