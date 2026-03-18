import { v4 as uuidv4 } from 'uuid';
import type { Asset } from '../../types';
import { getMediaType } from '../../utils/mediaType';
import { registerAssetFile } from '../asset/write';
import {
  type VaultVerifyEntryLike,
  type VaultVerifyResultLike,
  verifyVaultAssetsBridge,
} from '../platform/electronGateway';

const RESERVED_FILENAMES = new Set([
  '.index.json',
  '.metadata.json',
  '.trash.json',
  'thumbs.db',
  'desktop.ini',
]);

const TEMP_SUFFIXES = [
  '~',
  '.tmp',
  '.temp',
  '.part',
  '.partial',
  '.crdownload',
  '.download',
  '.swp',
  '.swo',
  '.bak',
];

const SIDECAR_EXTENSIONS = new Set([
  'json',
  'jsonl',
  'txt',
  'md',
  'xml',
  'csv',
  'yaml',
  'yml',
  'xmp',
  'srt',
  'vtt',
  'lrc',
]);

export interface UnregisteredAssetFile {
  filename: string;
  absolutePath: string;
  relativePath: string;
  mediaType: Asset['type'];
  reason: 'unregistered-media';
}

export interface ProjectUnregisteredAssetSyncResult {
  detectedCount: number;
  registeredCount: number;
  failedCount: number;
  skippedCount: number;
  confirmed: boolean;
  failedFiles: string[];
  files: UnregisteredAssetFile[];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function getBasename(filePath: string): string {
  const normalized = normalizePath(filePath);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function getExtension(filename: string): string {
  const basename = getBasename(filename).toLowerCase();
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex >= 0 ? basename.slice(dotIndex + 1) : '';
}

function isHiddenPath(relativePath: string, filename: string): boolean {
  if (filename.startsWith('.')) return true;
  return normalizePath(relativePath)
    .split('/')
    .filter(Boolean)
    .some((segment, index) => index > 0 && segment.startsWith('.'));
}

function isTemporaryFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (lower.startsWith('~') || lower.startsWith('~$')) return true;
  return TEMP_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function isSidecarFilename(filename: string): boolean {
  return SIDECAR_EXTENSIONS.has(getExtension(filename));
}

function coerceVerifyEntries(
  verifyResult: VaultVerifyResultLike,
  vaultPath: string,
): VaultVerifyEntryLike[] {
  if (Array.isArray(verifyResult.orphanedEntries) && verifyResult.orphanedEntries.length > 0) {
    return verifyResult.orphanedEntries;
  }

  return (verifyResult.orphaned || []).map((name) => ({
    name,
    absolutePath: `${normalizePath(vaultPath)}/assets/${name}`,
    relativePath: `assets/${name}`,
    kind: 'file' as const,
    mediaType: getMediaType(name),
  }));
}

function toUnregisteredAssetFile(entry: VaultVerifyEntryLike): UnregisteredAssetFile | null {
  const filename = getBasename(entry.name || entry.relativePath || entry.absolutePath);
  const lower = filename.toLowerCase();
  const mediaType = entry.mediaType || getMediaType(filename);

  if (entry.kind !== 'file') return null;
  if (!filename || !entry.absolutePath || !entry.relativePath) return null;
  if (RESERVED_FILENAMES.has(lower)) return null;
  if (isHiddenPath(entry.relativePath, filename)) return null;
  if (isTemporaryFilename(filename)) return null;
  if (isSidecarFilename(filename)) return null;
  if (!mediaType) return null;

  return {
    filename,
    absolutePath: entry.absolutePath,
    relativePath: normalizePath(entry.relativePath),
    mediaType,
    reason: 'unregistered-media',
  };
}

export function normalizeUnregisteredAssetFiles(
  verifyResult: VaultVerifyResultLike,
  vaultPath: string,
): UnregisteredAssetFile[] {
  const deduped = new Map<string, UnregisteredAssetFile>();

  for (const entry of coerceVerifyEntries(verifyResult, vaultPath)) {
    const normalized = toUnregisteredAssetFile(entry);
    if (!normalized) continue;
    deduped.set(normalized.absolutePath, normalized);
  }

  return [...deduped.values()].sort((left, right) => left.filename.localeCompare(right.filename));
}

export function buildUnregisteredAssetsConfirmDialog(
  files: UnregisteredAssetFile[],
): {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'info';
} {
  const preview = files.slice(0, 3).map((file) => file.filename);
  const previewText = preview.length > 0
    ? `\n\nExamples: ${preview.join(', ')}${files.length > preview.length ? `, and ${files.length - preview.length} more.` : '.'}`
    : '';

  return {
    title: 'Add Unregistered Assets?',
    message: `There ${files.length === 1 ? 'is' : 'are'} ${files.length} unregistered media ${files.length === 1 ? 'file' : 'files'} in assets/. Add ${files.length === 1 ? 'it' : 'them'} as ${files.length === 1 ? 'an asset' : 'assets'}?`
      + '\n\nAdded files will be renamed to managed hash filenames using the standard vault rule.'
      + previewText,
    confirmLabel: 'Add Assets',
    cancelLabel: 'Skip',
    variant: 'info',
  };
}

function createEmptySyncResult(): ProjectUnregisteredAssetSyncResult {
  return {
    detectedCount: 0,
    registeredCount: 0,
    failedCount: 0,
    skippedCount: 0,
    confirmed: false,
    failedFiles: [],
    files: [],
  };
}

export async function syncUnregisteredAssetsInVault(input: {
  vaultPath: string;
  confirm: (files: UnregisteredAssetFile[]) => Promise<boolean>;
}): Promise<ProjectUnregisteredAssetSyncResult> {
  const verifyResult = await verifyVaultAssetsBridge(input.vaultPath).catch((error) => ({
    valid: false,
    missing: [],
    orphaned: [],
    orphanedEntries: [],
    error: error instanceof Error ? error.message : String(error),
  }));
  const files = normalizeUnregisteredAssetFiles(verifyResult, input.vaultPath);

  if (files.length === 0) {
    return createEmptySyncResult();
  }

  const confirmed = await input.confirm(files);
  if (!confirmed) {
    console.info('[ProjectLoad] Skipped unregistered asset sync.', {
      vaultPath: input.vaultPath,
      detectedCount: files.length,
      skippedCount: files.length,
    });
    return {
      detectedCount: files.length,
      registeredCount: 0,
      failedCount: 0,
      skippedCount: files.length,
      confirmed: false,
      failedFiles: [],
      files,
    };
  }

  let registeredCount = 0;
  const failedFiles: string[] = [];

  for (const file of files) {
    try {
      const registered = await registerAssetFile({
        sourcePath: file.absolutePath,
        vaultPath: input.vaultPath,
        assetId: uuidv4(),
        existingAsset: {
          name: file.filename,
          type: file.mediaType,
        },
      });
      if (registered?.asset) {
        registeredCount += 1;
      } else {
        failedFiles.push(file.absolutePath);
      }
    } catch (error) {
      console.warn('[ProjectLoad] Failed to register unregistered asset.', {
        vaultPath: input.vaultPath,
        file: file.absolutePath,
        error,
      });
      failedFiles.push(file.absolutePath);
    }
  }

  const summary = {
    vaultPath: input.vaultPath,
    detectedCount: files.length,
    succeededCount: registeredCount,
    failedCount: failedFiles.length,
    skippedCount: 0,
  };
  if (failedFiles.length > 0) {
    console.warn('[ProjectLoad] Unregistered asset sync completed with failures.', {
      ...summary,
      failedFiles,
    });
  } else {
    console.info('[ProjectLoad] Unregistered asset sync completed.', summary);
  }

  return {
    detectedCount: files.length,
    registeredCount,
    failedCount: failedFiles.length,
    skippedCount: 0,
    confirmed: true,
    failedFiles,
    files,
  };
}

export const syncUnregisteredAssetsForProjectLoad = syncUnregisteredAssetsInVault;

export function formatUnregisteredAssetSyncSummary(
  result: ProjectUnregisteredAssetSyncResult,
): string {
  if (!result.confirmed && result.skippedCount > 0) {
    return `${result.skippedCount} unregistered media file${result.skippedCount === 1 ? ' was' : 's were'} skipped.`;
  }
  if (result.failedCount > 0 && result.registeredCount > 0) {
    return `${result.registeredCount} unregistered media file${result.registeredCount === 1 ? '' : 's'} added, ${result.failedCount} failed.`;
  }
  if (result.failedCount > 0) {
    return `${result.failedCount} unregistered media file${result.failedCount === 1 ? '' : 's'} failed to add.`;
  }
  if (result.registeredCount > 0) {
    return `${result.registeredCount} unregistered media file${result.registeredCount === 1 ? '' : 's'} added.`;
  }
  return 'No unregistered media files were added.';
}
