import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import type { IpcMain } from 'electron';

export interface TrashOriginRef {
  sceneId?: string;
  cutId?: string;
  note?: string;
}

export interface TrashMeta {
  assetId?: string;
  assetIds?: string[];
  originRefs?: TrashOriginRef[];
  reason?: string;
}

export interface AssetIndexEntry {
  id: string;
  hash: string;
  filename: string;
  originalName: string;
  originalPath: string;
  usageRefs?: Array<{
    sceneId: string;
    sceneName: string;
    sceneOrder: number;
    cutId: string;
    cutOrder: number;
    cutIndex: number;
  }>;
  type: 'image' | 'video' | 'audio';
  fileSize: number;
  importedAt: string;
}

export interface AssetIndex {
  version: number;
  assets: AssetIndexEntry[];
}

export interface VaultImportResult {
  success: boolean;
  vaultPath?: string;
  relativePath?: string;
  hash?: string;
  isDuplicate?: boolean;
  error?: string;
}

export interface FinalizeVaultAssetOptions {
  originalName?: string;
  originalPath?: string;
}

export interface MoveToTrashResult {
  success: boolean;
  trashedPath?: string;
  indexUpdated: boolean;
  reason?: 'trash-move-failed' | 'index-update-failed';
}

interface TrashEntry {
  id: string;
  deletedAt: string;
  assetId?: string;
  assetIds?: string[];
  originalPath?: string;
  trashRelativePath: string;
  filename: string;
  reason?: string;
  originRefs?: TrashOriginRef[];
  indexEntry?: AssetIndexEntry;
  indexEntries?: AssetIndexEntry[];
}

interface TrashIndex {
  version: number;
  retentionDays: number;
  items: TrashEntry[];
}

const TRASH_INDEX_NAME = '.trash.json';
const DEFAULT_TRASH_RETENTION_DAYS = 30;
const VAULT_STAGING_DIR_NAME = '.staging';

export async function calculateFileHashStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function getMediaType(filename: string): 'image' | 'video' | 'audio' | null {
  const ext = path.extname(filename).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
  const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  return null;
}

function toVaultRelativePath(vaultPath: string, targetPath?: string | null): string {
  if (!targetPath) return '';
  if (!path.isAbsolute(targetPath)) {
    return targetPath.replace(/\\/g, '/');
  }
  return path.relative(vaultPath, targetPath).replace(/\\/g, '/');
}

function readTrashIndex(trashPath: string): TrashIndex {
  const indexPath = path.join(trashPath, TRASH_INDEX_NAME);
  if (!fs.existsSync(indexPath)) {
    return { version: 1, retentionDays: DEFAULT_TRASH_RETENTION_DAYS, items: [] };
  }

  try {
    const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as TrashIndex;
    return {
      version: data.version ?? 1,
      retentionDays: data.retentionDays ?? DEFAULT_TRASH_RETENTION_DAYS,
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch {
    return { version: 1, retentionDays: DEFAULT_TRASH_RETENTION_DAYS, items: [] };
  }
}

function writeTrashIndex(trashPath: string, index: TrashIndex) {
  const indexPath = path.join(trashPath, TRASH_INDEX_NAME);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

function ensureAssetsPath(vaultPath: string): string {
  const assetsPath = path.join(vaultPath, 'assets');
  if (!fs.existsSync(assetsPath)) {
    fs.mkdirSync(assetsPath, { recursive: true });
  }
  return assetsPath;
}

export function ensureVaultStagingPath(vaultPath: string): string {
  const stagingPath = path.join(vaultPath, VAULT_STAGING_DIR_NAME);
  if (!fs.existsSync(stagingPath)) {
    fs.mkdirSync(stagingPath, { recursive: true });
  }
  return stagingPath;
}

function getAssetIndexPath(vaultPath: string): string {
  return path.join(ensureAssetsPath(vaultPath), '.index.json');
}

function loadAssetIndexForVault(vaultPath: string): AssetIndex {
  const indexPath = getAssetIndexPath(vaultPath);
  if (!fs.existsSync(indexPath)) {
    return { version: 1, assets: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as AssetIndex;
  } catch {
    return { version: 1, assets: [] };
  }
}

function upsertAssetIndexEntry(index: AssetIndex, entry: AssetIndexEntry) {
  const existingIndex = index.assets.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    index.assets[existingIndex] = entry;
  } else {
    index.assets.push(entry);
  }
}

function writeTextFileAtomically(targetPath: string, contents: string) {
  const tempPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, contents, 'utf-8');
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
}

function writeAssetIndexForVault(vaultPath: string, index: AssetIndex) {
  const indexPath = getAssetIndexPath(vaultPath);
  writeTextFileAtomically(indexPath, JSON.stringify(index, null, 2));
}

function isPathInsideAssets(vaultPath: string, filePath: string): boolean {
  const assetsPath = path.resolve(ensureAssetsPath(vaultPath));
  const targetPath = path.resolve(filePath);
  const relative = path.relative(assetsPath, targetPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isPathInsideStaging(vaultPath: string, filePath: string): boolean {
  const stagingPath = path.resolve(ensureVaultStagingPath(vaultPath));
  const targetPath = path.resolve(filePath);
  const relative = path.relative(stagingPath, targetPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function buildManagedFilename(
  filePath: string,
  mediaType: 'image' | 'video' | 'audio',
  hash: string,
): string {
  const ext = path.extname(filePath).toLowerCase();
  const shortHash = hash.substring(0, 12);
  const prefix = mediaType === 'image' ? 'img' : mediaType === 'video' ? 'vid' : 'aud';
  return `${prefix}_${shortHash}${ext}`;
}

function resolveUniqueManagedPath(
  assetsPath: string,
  desiredFilename: string,
): { filename: string; absolutePath: string } {
  const desiredPath = path.join(assetsPath, desiredFilename);
  if (!fs.existsSync(desiredPath)) {
    return {
      filename: desiredFilename,
      absolutePath: desiredPath,
    };
  }

  const ext = path.extname(desiredFilename);
  const baseName = path.basename(desiredFilename, ext);
  let counter = 1;
  let nextFilename = `${baseName}_${counter}${ext}`;
  let nextPath = path.join(assetsPath, nextFilename);
  while (fs.existsSync(nextPath)) {
    counter += 1;
    nextFilename = `${baseName}_${counter}${ext}`;
    nextPath = path.join(assetsPath, nextFilename);
  }
  return {
    filename: nextFilename,
    absolutePath: nextPath,
  };
}

function purgeExpiredTrash(trashPath: string, index: TrashIndex): TrashIndex {
  const now = Date.now();
  const ttlMs = (index.retentionDays ?? DEFAULT_TRASH_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const keepItems: TrashEntry[] = [];

  for (const item of index.items) {
    const deletedAtMs = Date.parse(item.deletedAt);
    if (Number.isNaN(deletedAtMs)) {
      keepItems.push(item);
      continue;
    }
    if (now - deletedAtMs <= ttlMs) {
      keepItems.push(item);
      continue;
    }

    const targetPath = path.join(trashPath, item.filename);
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (error) {
        console.error('Failed to purge trash file:', error);
        keepItems.push(item);
      }
    }
  }

  return { ...index, items: keepItems };
}

function normalizeTrashAssetIds(meta: TrashMeta | null): string[] {
  const ids = new Set<string>();
  if (typeof meta?.assetId === 'string' && meta.assetId) {
    ids.add(meta.assetId);
  }
  if (Array.isArray(meta?.assetIds)) {
    for (const assetId of meta.assetIds) {
      if (typeof assetId === 'string' && assetId) {
        ids.add(assetId);
      }
    }
  }
  return [...ids];
}

export function saveAssetIndexInternal(vaultPath: string, index: AssetIndex): boolean {
  try {
    const indexPath = getAssetIndexPath(vaultPath);
    const normalizedAssets = index.assets.map((entry) => ({
      ...entry,
      originalPath: toVaultRelativePath(vaultPath, entry.originalPath),
    }));
    writeTextFileAtomically(indexPath, JSON.stringify({ ...index, assets: normalizedAssets }, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save asset index:', error);
    return false;
  }
}

export async function finalizeAssetIntoVaultInternal(
  sourcePath: string,
  vaultPath: string,
  assetId: string,
  options: FinalizeVaultAssetOptions = {},
): Promise<VaultImportResult> {
  try {
    const stats = fs.statSync(sourcePath);
    if (!stats.isFile()) {
      return { success: false, error: 'Asset path must point to a file' };
    }

    const mediaType = getMediaType(path.basename(sourcePath));
    if (!mediaType) {
      return { success: false, error: 'Unsupported file type' };
    }

    const assetsPath = ensureAssetsPath(vaultPath);
    const hash = await calculateFileHashStream(sourcePath);
    const desiredFilename = buildManagedFilename(sourcePath, mediaType, hash);
    let finalFilename = desiredFilename;
    let finalPath = path.join(assetsPath, desiredFilename);
    let isDuplicate = false;
    const sourceResolvedPath = path.resolve(sourcePath);
    const desiredResolvedPath = path.resolve(finalPath);

    if (sourceResolvedPath !== desiredResolvedPath && fs.existsSync(finalPath)) {
      const existingHash = await calculateFileHashStream(finalPath);
      if (existingHash === hash) {
        isDuplicate = true;
      } else {
        const uniqueTarget = resolveUniqueManagedPath(assetsPath, desiredFilename);
        finalFilename = uniqueTarget.filename;
        finalPath = uniqueTarget.absolutePath;
      }
    }

    const finalResolvedPath = path.resolve(finalPath);
    const samePhysicalPath = sourceResolvedPath === finalResolvedPath;
    const sourceInsideAssets = isPathInsideAssets(vaultPath, sourcePath);
    const sourceInsideStaging = isPathInsideStaging(vaultPath, sourcePath);
    const shouldRemoveSource = (sourceInsideAssets || sourceInsideStaging) && !samePhysicalPath;

    const index = loadAssetIndexForVault(vaultPath);
    const entry: AssetIndexEntry = {
      id: assetId,
      hash,
      filename: finalFilename,
      originalName: options.originalName || path.basename(sourcePath),
      originalPath: toVaultRelativePath(vaultPath, options.originalPath ?? sourcePath),
      type: mediaType,
      fileSize: stats.size,
      importedAt: new Date().toISOString(),
    };
    upsertAssetIndexEntry(index, entry);

    let createdFinalFile = false;
    let removedSource = false;
    try {
      if (!samePhysicalPath && !isDuplicate) {
        fs.copyFileSync(sourcePath, finalPath);
        createdFinalFile = true;
      }

      if (shouldRemoveSource) {
        fs.unlinkSync(sourcePath);
        removedSource = true;
      }

      writeAssetIndexForVault(vaultPath, index);

      return {
        success: true,
        vaultPath: finalPath,
        relativePath: `assets/${finalFilename}`,
        hash,
        isDuplicate,
      };
    } catch (error) {
      if (removedSource) {
        try {
          fs.copyFileSync(finalPath, sourcePath);
        } catch (restoreError) {
          console.error('Failed to restore source asset after finalize rollback:', restoreError);
        }
      }
      if (createdFinalFile) {
        try {
          fs.unlinkSync(finalPath);
        } catch (cleanupError) {
          console.error('Failed to cleanup finalized asset after rollback:', cleanupError);
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Failed to finalize asset into vault:', error);
    return { success: false, error: String(error) };
  }
}

export async function importAssetToVaultInternal(
  sourcePath: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult> {
  return finalizeAssetIntoVaultInternal(sourcePath, vaultPath, assetId);
}

export async function registerVaultAssetInternal(
  filePath: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult> {
  return finalizeAssetIntoVaultInternal(filePath, vaultPath, assetId);
}

export async function importDataUrlToVaultInternal(
  dataUrl: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult> {
  try {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return { success: false, error: 'Invalid data URL' };
    }

    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];
    let ext = '.png';
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      ext = '.jpg';
    } else if (mimeType === 'image/png') {
      ext = '.png';
    } else if (mimeType === 'image/webp') {
      ext = '.webp';
    } else {
      return { success: false, error: `Unsupported image type: ${mimeType}` };
    }

    const tempDir = path.join(os.tmpdir(), 'ai-scene-deck');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `import_${assetId}${ext}`);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(tempPath, buffer);

    try {
      return await importAssetToVaultInternal(tempPath, vaultPath, assetId);
    } finally {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Failed to import data URL asset to vault:', error);
    return { success: false, error: String(error) };
  }
}

export async function moveToTrashInternal(filePath: string, trashPath: string, meta: TrashMeta | null): Promise<MoveToTrashResult> {
  try {
    if (!fs.existsSync(trashPath)) {
      fs.mkdirSync(trashPath, { recursive: true });
    }

    const fileName = path.basename(filePath);
    let destPath = path.join(trashPath, fileName);

    // Handle duplicate names
    let counter = 1;
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    while (fs.existsSync(destPath)) {
      destPath = path.join(trashPath, `${baseName}_${counter}${ext}`);
      counter++;
    }

    try {
      fs.renameSync(filePath, destPath);
    } catch (error) {
      try {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
      } catch (copyError) {
        console.error('Failed to move to trash (rename/copy):', error, copyError);
        return {
          success: false,
          indexUpdated: false,
          reason: 'trash-move-failed',
        };
      }
    }

    const trashRelativePath = path.posix.join('.trash', path.basename(destPath));
    const vaultPath = path.dirname(trashPath);
    const normalizedAssetIds = normalizeTrashAssetIds(meta);

    let indexEntries: AssetIndexEntry[] = [];
    let indexUpdated = true;
    if (normalizedAssetIds.length > 0) {
      const indexPath = path.join(vaultPath, 'assets', '.index.json');
      if (fs.existsSync(indexPath)) {
        try {
          const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as AssetIndex;
          const deletedIds = new Set(normalizedAssetIds);
          indexEntries = index.assets.filter((entry) => deletedIds.has(entry.id));
          if (indexEntries.length > 0) {
            const filtered = index.assets.filter((entry) => !deletedIds.has(entry.id));
            fs.writeFileSync(indexPath, JSON.stringify({ ...index, assets: filtered }, null, 2), 'utf-8');
          }
        } catch (error) {
          indexUpdated = false;
          console.error('Failed to update asset index on trash:', error);
        }
      }
    }

    let trashIndex = readTrashIndex(trashPath);
    trashIndex = purgeExpiredTrash(trashPath, trashIndex);

    const entry: TrashEntry = {
      id: crypto.randomUUID(),
      deletedAt: new Date().toISOString(),
      assetId: normalizedAssetIds[0],
      assetIds: normalizedAssetIds.length > 0 ? normalizedAssetIds : undefined,
      originalPath: toVaultRelativePath(vaultPath, filePath),
      trashRelativePath,
      filename: path.basename(destPath),
      reason: meta?.reason,
      originRefs: meta?.originRefs,
      indexEntry: indexEntries[0]
        ? { ...indexEntries[0], originalPath: toVaultRelativePath(vaultPath, indexEntries[0].originalPath) }
        : undefined,
      indexEntries: indexEntries.length > 0
        ? indexEntries.map((indexEntry) => ({
            ...indexEntry,
            originalPath: toVaultRelativePath(vaultPath, indexEntry.originalPath),
          }))
        : undefined,
    };

    trashIndex.items.push(entry);
    writeTrashIndex(trashPath, trashIndex);

    return {
      success: indexUpdated,
      trashedPath: destPath,
      indexUpdated,
      reason: indexUpdated ? undefined : 'index-update-failed',
    };
  } catch (error) {
    console.error('Failed to move to trash:', error);
    return {
      success: false,
      indexUpdated: false,
      reason: 'trash-move-failed',
    };
  }
}

export function registerVaultGatewayHandlers(ipcMain: IpcMain) {
  ipcMain.handle(
    'vault-gateway-finalize-asset',
    async (
      _,
      sourcePath: string,
      vaultPath: string,
      assetId: string,
      options?: FinalizeVaultAssetOptions,
    ) => {
      return finalizeAssetIntoVaultInternal(sourcePath, vaultPath, assetId, options);
    },
  );

  ipcMain.handle('vault-gateway-import-asset', async (_, sourcePath: string, vaultPath: string, assetId: string) => {
    return importAssetToVaultInternal(sourcePath, vaultPath, assetId);
  });

  ipcMain.handle('vault-gateway-register-vault-asset', async (_, filePath: string, vaultPath: string, assetId: string) => {
    return registerVaultAssetInternal(filePath, vaultPath, assetId);
  });

  ipcMain.handle('vault-gateway-import-data-url', async (_, dataUrl: string, vaultPath: string, assetId: string) => {
    return importDataUrlToVaultInternal(dataUrl, vaultPath, assetId);
  });

  ipcMain.handle('vault-gateway-save-asset-index', async (_, vaultPath: string, index: AssetIndex) => {
    return saveAssetIndexInternal(vaultPath, index);
  });

  ipcMain.handle('vault-gateway-move-to-trash', async (_, filePath: string, trashPath: string, meta: TrashMeta) => {
    return moveToTrashInternal(filePath, trashPath, meta || null);
  });
}
