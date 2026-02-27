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

function getElectronAPI(): BridgeElectronAPI | null {
  if (typeof window === 'undefined' || !window.electronAPI) return null;
  return window.electronAPI;
}

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

export function hasVaultGatewayBridge(): boolean {
  return !!getElectronAPI()?.vaultGateway;
}

export async function saveAssetIndexBridge(vaultPath: string, index: AssetIndexLike): Promise<boolean> {
  return (await getElectronAPI()?.vaultGateway?.saveAssetIndex?.(vaultPath, index as any)) ?? false;
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
