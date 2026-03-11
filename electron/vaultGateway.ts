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

interface TrashEntry {
  id: string;
  deletedAt: string;
  assetId?: string;
  originalPath?: string;
  trashRelativePath: string;
  filename: string;
  reason?: string;
  originRefs?: TrashOriginRef[];
  indexEntry?: AssetIndexEntry;
}

interface TrashIndex {
  version: number;
  retentionDays: number;
  items: TrashEntry[];
}

const TRASH_INDEX_NAME = '.trash.json';
const DEFAULT_TRASH_RETENTION_DAYS = 30;

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

function writeAssetIndexForVault(vaultPath: string, index: AssetIndex) {
  const indexPath = getAssetIndexPath(vaultPath);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

function isPathInsideAssets(vaultPath: string, filePath: string): boolean {
  const assetsPath = path.resolve(ensureAssetsPath(vaultPath));
  const targetPath = path.resolve(filePath);
  const relative = path.relative(assetsPath, targetPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
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

export function saveAssetIndexInternal(vaultPath: string, index: AssetIndex): boolean {
  try {
    const indexPath = getAssetIndexPath(vaultPath);
    const normalizedAssets = index.assets.map((entry) => ({
      ...entry,
      originalPath: toVaultRelativePath(vaultPath, entry.originalPath),
    }));
    fs.writeFileSync(indexPath, JSON.stringify({ ...index, assets: normalizedAssets }, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save asset index:', error);
    return false;
  }
}

export async function importAssetToVaultInternal(
  sourcePath: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult> {
  try {
    const assetsPath = ensureAssetsPath(vaultPath);

    const sourceStats = fs.statSync(sourcePath);
    // Calculate hash without loading the full file into memory.
    const hash = await calculateFileHashStream(sourcePath);
    const shortHash = hash.substring(0, 12);

    // Determine file type and extension
    const ext = path.extname(sourcePath).toLowerCase();
    const mediaType = getMediaType(path.basename(sourcePath));
    if (!mediaType) {
      return { success: false, error: 'Unsupported file type' };
    }

    // Create hash-based filename: img_abc123.png, vid_abc123.mp4, or aud_abc123.mp3
    const prefix = mediaType === 'image' ? 'img' : mediaType === 'video' ? 'vid' : 'aud';
    const newFilename = `${prefix}_${shortHash}${ext}`;

    const destPath = path.join(assetsPath, newFilename);
    const relativePath = `assets/${newFilename}`;

    const index = loadAssetIndexForVault(vaultPath);
    const baseEntry: AssetIndexEntry = {
      id: assetId,
      hash,
      filename: newFilename,
      originalName: path.basename(sourcePath),
      originalPath: toVaultRelativePath(vaultPath, sourcePath),
      type: mediaType,
      fileSize: sourceStats.size,
      importedAt: new Date().toISOString(),
    };

    // Check if file with same hash already exists
    if (fs.existsSync(destPath)) {
      // Verify it's the same file by comparing hashes
      const existingHash = await calculateFileHashStream(destPath);

      if (existingHash === hash) {
        upsertAssetIndexEntry(index, baseEntry);
        writeAssetIndexForVault(vaultPath, index);
        // Exact duplicate - return existing path
        return {
          success: true,
          vaultPath: destPath,
          relativePath,
          hash,
          isDuplicate: true,
        };
      }

      // Hash collision (very rare) - add suffix
      let counter = 1;
      let uniqueFilename = `${prefix}_${shortHash}_${counter}${ext}`;
      let uniquePath = path.join(assetsPath, uniqueFilename);
      while (fs.existsSync(uniquePath)) {
        counter++;
        uniqueFilename = `${prefix}_${shortHash}_${counter}${ext}`;
        uniquePath = path.join(assetsPath, uniqueFilename);
      }

      fs.copyFileSync(sourcePath, uniquePath);
      const collisionEntry: AssetIndexEntry = {
        ...baseEntry,
        filename: uniqueFilename,
      };
      upsertAssetIndexEntry(index, collisionEntry);
      writeAssetIndexForVault(vaultPath, index);
      return {
        success: true,
        vaultPath: uniquePath,
        relativePath: `assets/${uniqueFilename}`,
        hash,
        isDuplicate: false,
      };
    }

    // Copy file to vault
    fs.copyFileSync(sourcePath, destPath);

    upsertAssetIndexEntry(index, baseEntry);
    writeAssetIndexForVault(vaultPath, index);

    return {
      success: true,
      vaultPath: destPath,
      relativePath,
      hash,
      isDuplicate: false,
    };
  } catch (error) {
    console.error('Failed to import asset to vault:', error);
    return { success: false, error: String(error) };
  }
}

export async function registerVaultAssetInternal(
  filePath: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult> {
  try {
    if (!isPathInsideAssets(vaultPath, filePath)) {
      return { success: false, error: 'Asset must already exist inside vault/assets' };
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return { success: false, error: 'Asset path must point to a file' };
    }

    const filename = path.basename(filePath);
    const mediaType = getMediaType(filename);
    if (!mediaType) {
      return { success: false, error: 'Unsupported file type' };
    }

    const hash = await calculateFileHashStream(filePath);
    const index = loadAssetIndexForVault(vaultPath);
    const relativePath = `assets/${filename}`;
    const entry: AssetIndexEntry = {
      id: assetId,
      hash,
      filename,
      originalName: filename,
      originalPath: toVaultRelativePath(vaultPath, filePath),
      type: mediaType,
      fileSize: stats.size,
      importedAt: new Date().toISOString(),
    };

    upsertAssetIndexEntry(index, entry);
    writeAssetIndexForVault(vaultPath, index);

    return {
      success: true,
      vaultPath: filePath,
      relativePath,
      hash,
      isDuplicate: false,
    };
  } catch (error) {
    console.error('Failed to register existing vault asset:', error);
    return { success: false, error: String(error) };
  }
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
    const tempPath = path.join(tempDir, `lipsync_${assetId}${ext}`);
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

export async function moveToTrashInternal(filePath: string, trashPath: string, meta: TrashMeta | null) {
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
        return null;
      }
    }

    const trashRelativePath = path.posix.join('.trash', path.basename(destPath));
    const vaultPath = path.dirname(trashPath);

    let indexEntry: AssetIndexEntry | undefined;
    if (meta?.assetId) {
      const indexPath = path.join(vaultPath, 'assets', '.index.json');
      if (fs.existsSync(indexPath)) {
        try {
          const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as AssetIndex;
          indexEntry = index.assets.find((entry) => entry.id === meta.assetId);
          if (indexEntry) {
            const isSameFile = indexEntry.filename === fileName;
            if (isSameFile) {
              const filtered = index.assets.filter((entry) => entry.id !== meta.assetId);
              fs.writeFileSync(indexPath, JSON.stringify({ ...index, assets: filtered }, null, 2), 'utf-8');
            }
          }
        } catch (error) {
          console.error('Failed to update asset index on trash:', error);
        }
      }
    }

    let trashIndex = readTrashIndex(trashPath);
    trashIndex = purgeExpiredTrash(trashPath, trashIndex);

    const entry: TrashEntry = {
      id: crypto.randomUUID(),
      deletedAt: new Date().toISOString(),
      assetId: meta?.assetId,
      originalPath: toVaultRelativePath(vaultPath, filePath),
      trashRelativePath,
      filename: path.basename(destPath),
      reason: meta?.reason,
      originRefs: meta?.originRefs,
      indexEntry: indexEntry ? { ...indexEntry, originalPath: toVaultRelativePath(vaultPath, indexEntry.originalPath) } : undefined,
    };

    trashIndex.items.push(entry);
    writeTrashIndex(trashPath, trashIndex);

    return destPath;
  } catch (error) {
    console.error('Failed to move to trash:', error);
    return null;
  }
}

export function registerVaultGatewayHandlers(ipcMain: IpcMain) {
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
