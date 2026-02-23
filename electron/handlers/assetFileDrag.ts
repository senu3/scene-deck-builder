import * as fs from 'fs';
import * as path from 'path';

export interface StartAssetFileDragPayload {
  filePath: string;
  vaultPath: string;
  iconDataUrl?: string;
}

interface AssetFileDragValidationResult {
  ok: boolean;
  filePath?: string;
}

function normalizePathForComparison(input: string, platform: NodeJS.Platform): string {
  const normalized = path.normalize(input);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function validateStartAssetFileDragPayload(
  payload: StartAssetFileDragPayload,
  platform: NodeJS.Platform = process.platform
): AssetFileDragValidationResult {
  const filePath = typeof payload.filePath === 'string' ? payload.filePath.trim() : '';
  const vaultPath = typeof payload.vaultPath === 'string' ? payload.vaultPath.trim() : '';
  if (!filePath || !vaultPath) return { ok: false };

  const assetsRootInput = path.resolve(vaultPath, 'assets');
  const targetInput = path.resolve(filePath);

  try {
    if (!fs.existsSync(targetInput)) return { ok: false };
    const stat = fs.statSync(targetInput);
    if (!stat.isFile()) return { ok: false };

    const assetsRootReal = fs.realpathSync.native(assetsRootInput);
    const targetReal = fs.realpathSync.native(targetInput);
    if (!assetsRootReal || !targetReal) return { ok: false };

    const normalizedAssetsRoot = normalizePathForComparison(assetsRootReal, platform);
    const normalizedTarget = normalizePathForComparison(targetReal, platform);

    const relative = path.relative(normalizedAssetsRoot, normalizedTarget);
    if (!relative || relative === '.') return { ok: false };
    if (relative.startsWith('..') || path.isAbsolute(relative)) return { ok: false };

    return { ok: true, filePath: targetReal };
  } catch {
    return { ok: false };
  }
}

