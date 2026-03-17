import { vi } from 'vitest';

// React 18 act() support flag for testing environments (silences warnings).
// See: https://react.dev/reference/react/act#setting-up-your-testing-environment
// (URL in comment only; no runtime dependency)
// Property is used by React to detect test environments.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal window.electronAPI mock for renderer unit tests.
const electronAPIMock = {
  getVersions: vi.fn(() => ({
    electron: '1.0.0',
    chrome: '1.0.0',
    node: '1.0.0',
    v8: '1.0.0',
  })),
  pathExists: vi.fn(async () => true),
  getPathForFile: vi.fn((file: File) => (file as File & { path?: string }).path || ''),
  startAssetDragOut: vi.fn(() => ({ ok: true })),
  onToggleSidebar: vi.fn(() => () => {}),
  onAutosaveFlushRequest: vi.fn(() => () => {}),
  onAppCloseRequest: vi.fn(() => () => {}),
  notifyAutosaveFlushed: vi.fn(),
  respondToAppCloseRequest: vi.fn(),
  setAutosaveEnabled: vi.fn(async () => true),
  getFolderContents: vi.fn(async () => []),
  readImageMetadata: vi.fn(async () => null),
  getVideoMetadata: vi.fn(async () => null),
  loadProject: vi.fn(async () => ({ kind: 'canceled' as const })),
  loadProjectFromPath: vi.fn(async () => ({ kind: 'success' as const, data: null, path: '' })),
  saveProject: vi.fn(async () => 'mocked-path'),
  showSaveSequenceDialog: vi.fn(async () => 'C:/mock/sequence_export.mp4'),
  exportSequence: vi.fn(async () => ({
    success: true,
    outputPath: 'C:/mock/sequence_export.mp4',
    fileSize: 1024,
  })),
  writeExportSidecars: vi.fn(async () => ({
    success: true,
    manifestPath: 'C:/mock/manifest.json',
    timelinePath: 'C:/mock/timeline.txt',
  })),
  ensureAssetsFolder: vi.fn(async () => 'C:/mock/vault/assets'),
  ensureVaultStagingFolder: vi.fn(async () => 'C:/mock/vault/.staging'),
  extractVideoFrame: vi.fn(async () => ({
    success: true,
    outputPath: 'C:/mock/vault/assets/frame.png',
    fileSize: 1024,
  })),
  resolveVaultPath: vi.fn(async (_vaultPath: string, relativePath: string) => ({
    absolutePath: `C:/mock/${relativePath}`,
    exists: true,
  })),
  getRelativePath: vi.fn(async (_vaultPath: string, absolutePath: string) => {
    const normalized = absolutePath.replace(/\\/g, '/');
    const idx = normalized.indexOf('/assets/');
    return idx >= 0 ? normalized.slice(idx + 1) : null;
  }),
  generateThumbnail: vi.fn(async () => ({
    success: true,
    thumbnail: 'data:image/jpeg;base64,mock-thumb',
  })),
  readFileAsBase64: vi.fn(async () => 'data:image/png;base64,mock-base64'),
  getFfmpegLimits: vi.fn(async () => ({
    stderrMaxBytes: 256 * 1024,
    maxClipSeconds: 120,
    maxTotalSeconds: 600,
    maxClipBytes: 64 * 1024 * 1024,
    maxTotalBytes: 256 * 1024 * 1024,
  })),
  setFfmpegLimits: vi.fn(async (limits: Record<string, number>) => ({
    stderrMaxBytes: limits.stderrMaxBytes ?? 256 * 1024,
    maxClipSeconds: limits.maxClipSeconds ?? 120,
    maxTotalSeconds: limits.maxTotalSeconds ?? 600,
    maxClipBytes: limits.maxClipBytes ?? 64 * 1024 * 1024,
    maxTotalBytes: limits.maxTotalBytes ?? 256 * 1024 * 1024,
  })),
  calculateFileHash: vi.fn(async () => 'abc'),
  getFileInfo: vi.fn(async () => ({ size: 1234 })),
  readAssetIndex: vi.fn(async () => ({ kind: 'readable' as const, index: { version: 1, assets: [] } })),
  isPathInVault: vi.fn(async () => false),
  vaultGateway: {
    finalizeAsset: vi.fn(async () => ({
      success: true,
      vaultPath: 'C:/mock/vault/assets/img_abc.png',
      relativePath: 'assets/img_abc.png',
      hash: 'abc',
      isDuplicate: false,
    })),
    importAndRegisterAsset: vi.fn(async () => ({
      success: true,
      vaultPath: 'C:/mock/vault/assets/img_abc.png',
      relativePath: 'assets/img_abc.png',
      hash: 'abc',
      isDuplicate: false,
    })),
    registerVaultAsset: vi.fn(async (_filePath: string, _vaultPath: string, _assetId: string) => ({
      success: true,
      vaultPath: 'C:/mock/vault/assets/img_abc.png',
      relativePath: 'assets/img_abc.png',
      hash: 'abc',
      isDuplicate: false,
    })),
    importDataUrlAsset: vi.fn(async () => ({
      success: true,
      vaultPath: 'C:/mock/vault/assets/img_data.png',
      relativePath: 'assets/img_data.png',
      hash: 'data',
      isDuplicate: false,
    })),
    saveAssetIndex: vi.fn(async () => true),
    moveToTrashWithMeta: vi.fn(async () => ({
      success: true,
      trashedPath: 'C:/mock/vault/.trash/img_abc.png',
      indexUpdated: true,
    })),
  },
};

Object.defineProperty(window, 'electronAPI', {
  value: electronAPIMock,
  writable: true,
});

// Allow tests to reset mocks easily.
export function resetElectronMocks() {
  Object.values(electronAPIMock).forEach((value) => {
    if (typeof value === 'function' && 'mockClear' in value) {
      value.mockClear();
    }
  });
  Object.values(electronAPIMock.vaultGateway).forEach((value) => {
    if (typeof value === 'function' && 'mockClear' in value) {
      value.mockClear();
    }
  });
}
