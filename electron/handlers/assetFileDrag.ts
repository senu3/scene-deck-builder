import * as fs from 'fs';
import * as path from 'path';

export interface StartAssetDragOutPayload {
  assetId: string;
  vaultPath: string;
  iconDataUrl?: string;
}

export type StartAssetDragOutFailureReason =
  | 'asset-id-missing'
  | 'vault-path-missing'
  | 'index-missing'
  | 'index-invalid'
  | 'asset-not-found'
  | 'asset-filename-missing'
  | 'file-missing'
  | 'not-file'
  | 'outside-assets';

export interface StartAssetDragOutResult {
  ok: boolean;
  filePath?: string;
  reason?: StartAssetDragOutFailureReason;
}

interface AssetIndexEntryLike {
  id: string;
  filename: string;
}

function normalizePathForComparison(input: string, platform: NodeJS.Platform): string {
  const normalized = path.normalize(input);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isAssetIndexEntryLike(value: unknown): value is AssetIndexEntryLike {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && typeof entry.filename === 'string';
}

function resolveIndexedAssetFilename(
  assetsRootInput: string,
  assetId: string
): { ok: true; filename: string } | { ok: false; reason: StartAssetDragOutFailureReason } {
  const indexPath = path.join(assetsRootInput, '.index.json');
  if (!fs.existsSync(indexPath)) {
    return { ok: false, reason: 'index-missing' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    return { ok: false, reason: 'index-invalid' };
  }

  const assets = Array.isArray((parsed as { assets?: unknown[] })?.assets)
    ? (parsed as { assets: unknown[] }).assets
    : null;
  if (!assets) {
    return { ok: false, reason: 'index-invalid' };
  }

  const entry = assets.find((candidate) => isAssetIndexEntryLike(candidate) && candidate.id === assetId);
  if (!entry || !isAssetIndexEntryLike(entry)) {
    return { ok: false, reason: 'asset-not-found' };
  }

  const filename = entry.filename.trim();
  if (!filename) {
    return { ok: false, reason: 'asset-filename-missing' };
  }

  return { ok: true, filename };
}

export function validateStartAssetDragOutPayload(
  payload: StartAssetDragOutPayload,
  platform: NodeJS.Platform = process.platform
): StartAssetDragOutResult {
  const assetId = typeof payload.assetId === 'string' ? payload.assetId.trim() : '';
  const vaultPath = typeof payload.vaultPath === 'string' ? payload.vaultPath.trim() : '';
  if (!assetId) return { ok: false, reason: 'asset-id-missing' };
  if (!vaultPath) return { ok: false, reason: 'vault-path-missing' };

  const assetsRootInput = path.resolve(vaultPath, 'assets');
  const indexed = resolveIndexedAssetFilename(assetsRootInput, assetId);
  if (!indexed.ok) {
    return indexed;
  }

  const targetInput = path.resolve(assetsRootInput, indexed.filename);

  try {
    if (!fs.existsSync(targetInput)) return { ok: false, reason: 'file-missing' };
    const stat = fs.statSync(targetInput);
    if (!stat.isFile()) return { ok: false, reason: 'not-file' };

    const assetsRootReal = fs.realpathSync.native(assetsRootInput);
    const targetReal = fs.realpathSync.native(targetInput);
    if (!assetsRootReal || !targetReal) return { ok: false, reason: 'file-missing' };

    const normalizedAssetsRoot = normalizePathForComparison(assetsRootReal, platform);
    const normalizedTarget = normalizePathForComparison(targetReal, platform);

    const relative = path.relative(normalizedAssetsRoot, normalizedTarget);
    if (!relative || relative === '.') return { ok: false, reason: 'outside-assets' };
    if (relative.startsWith('..') || path.isAbsolute(relative)) return { ok: false, reason: 'outside-assets' };

    return { ok: true, filePath: targetReal };
  } catch {
    return { ok: false, reason: 'file-missing' };
  }
}
