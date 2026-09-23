/**
 * @license
 * Copyright 2025 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformServices } from '@/common/platform';

/**
 * Returns baseName unchanged in release builds, or baseName + '-dev' in dev builds.
 * When BOLOUI_MULTI_INSTANCE=1, appends '-2' to isolate the second dev instance.
 * Used to isolate symlink and directory names between environments.
 *
 * @example
 * getEnvAwareName('.boloui')        // release → '.boloui',        dev → '.boloui-dev'
 * getEnvAwareName('.boloui-config') // release → '.boloui-config', dev → '.boloui-config-dev'
 * // with BOLOUI_MULTI_INSTANCE=1:  dev → '.boloui-dev-2'
 */
export function getEnvAwareName(baseName: string): string {
  if (getPlatformServices().paths.isPackaged() === true) return baseName;
  const suffix = process.env.BOLOUI_MULTI_INSTANCE === '1' ? '-dev-2' : '-dev';
  return `${baseName}${suffix}`;
}
