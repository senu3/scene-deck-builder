import type { FileItem } from '../../types';

type BridgeElectronAPI = NonNullable<Window['electronAPI']>;

type AudioPcmResult = {
  success: boolean;
  pcm?: Uint8Array;
  sampleRate?: number;
  channels?: number;
  error?: string;
};

type PathResolveResult = {
  absolutePath: string | null;
  exists: boolean;
  error?: string;
};

type AssetIndexLike = {
  version: number;
  assets: unknown[];
};

type VaultImportResult = {
  success: boolean;
  vaultPath?: string;
  relativePath?: string;
  hash?: string;
  isDuplicate?: boolean;
  error?: string;
};

type VideoMetadataLike = {
  duration?: number;
  width?: number;
  height?: number;
};

type ImageMetadataLike = {
  width?: number;
  height?: number;
  format?: string;
  prompt?: string;
  negativePrompt?: string;
  model?: string;
  seed?: number;
  steps?: number;
  sampler?: string;
  cfg?: number;
  software?: string;
  fileSize?: number;
};

type TrashMetaLike = {
  assetId?: string;
  reason?: string;
  originRefs?: Array<{
    sceneId?: string;
    cutId?: string;
    note?: string;
  }>;
};

function getElectronAPI(): BridgeElectronAPI | null {
  if (typeof window === 'undefined' || !window.electronAPI) return null;
  return window.electronAPI;
}

let assetIndexMutationQueue: Promise<void> = Promise.resolve();

export function getPathForFileBridge(file: File): string | undefined {
  return getElectronAPI()?.getPathForFile?.(file);
}

export async function readAudioPcmBridge(filePath: string): Promise<AudioPcmResult | null> {
  return getElectronAPI()?.readAudioPcm?.(filePath) ?? null;
}

export async function resolveVaultPathBridge(vaultPath: string, relativePath: string): Promise<PathResolveResult> {
  const result = await getElectronAPI()?.resolveVaultPath?.(vaultPath, relativePath);
  if (!result) return { absolutePath: null, exists: false };
  return result;
}

export async function isPathInVaultBridge(vaultPath: string, checkPath: string): Promise<boolean> {
  return (await getElectronAPI()?.isPathInVault?.(vaultPath, checkPath)) ?? false;
}

export async function pathExistsBridge(checkPath: string): Promise<boolean> {
  return (await getElectronAPI()?.pathExists?.(checkPath)) ?? false;
}

export async function getFolderContentsBridge(folderPath: string): Promise<FileItem[] | null> {
  return (await getElectronAPI()?.getFolderContents?.(folderPath)) ?? null;
}

export async function loadProjectFromPathBridge(projectPath: string): Promise<{ data: unknown; path: string } | null> {
  return getElectronAPI()?.loadProjectFromPath?.(projectPath) ?? null;
}

export async function saveProjectBridge(projectData: string, projectPath?: string): Promise<string | null> {
  return getElectronAPI()?.saveProject?.(projectData, projectPath) ?? null;
}

export async function getRelativePathBridge(vaultPath: string, absolutePath: string): Promise<string | null> {
  return getElectronAPI()?.getRelativePath?.(vaultPath, absolutePath) ?? null;
}

export async function calculateFileHashBridge(filePath: string): Promise<string | null> {
  return getElectronAPI()?.calculateFileHash?.(filePath) ?? null;
}

export async function getFileInfoBridge(filePath: string): Promise<{ size?: number } | null> {
  return getElectronAPI()?.getFileInfo?.(filePath) ?? null;
}

export async function loadAssetIndexBridge(vaultPath: string): Promise<AssetIndexLike | null> {
  return getElectronAPI()?.loadAssetIndex?.(vaultPath) ?? null;
}

export async function withSerializedAssetIndexMutationBridge<T>(run: () => Promise<T>): Promise<T> {
  const previous = assetIndexMutationQueue;
  let release!: () => void;
  assetIndexMutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await run();
  } finally {
    release();
  }
}

export async function getVideoMetadataBridge(filePath: string): Promise<VideoMetadataLike | null> {
  return getElectronAPI()?.getVideoMetadata?.(filePath) ?? null;
}

export async function readImageMetadataBridge(filePath: string): Promise<ImageMetadataLike | null> {
  return getElectronAPI()?.readImageMetadata?.(filePath) ?? null;
}

export function hasVaultGatewayBridge(): boolean {
  return !!getElectronAPI()?.vaultGateway;
}

export async function saveAssetIndexBridge(vaultPath: string, index: AssetIndexLike): Promise<boolean> {
  return (await getElectronAPI()?.vaultGateway?.saveAssetIndex?.(vaultPath, index as any)) ?? false;
}

export async function moveToTrashWithMetaBridge(
  filePath: string,
  trashPath: string,
  meta: TrashMetaLike
): Promise<string | null> {
  return (await getElectronAPI()?.vaultGateway?.moveToTrashWithMeta?.(filePath, trashPath, meta as any)) ?? null;
}

export async function importAndRegisterAssetBridge(
  sourcePath: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult | null> {
  return getElectronAPI()?.vaultGateway?.importAndRegisterAsset?.(sourcePath, vaultPath, assetId) ?? null;
}

export async function importDataUrlAssetBridge(
  dataUrl: string,
  vaultPath: string,
  assetId: string
): Promise<VaultImportResult | null> {
  return getElectronAPI()?.vaultGateway?.importDataUrlAsset?.(dataUrl, vaultPath, assetId) ?? null;
}
