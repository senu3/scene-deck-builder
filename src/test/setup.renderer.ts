import { vi } from 'vitest';

// React 18 act() support flag for testing environments (silences warnings).
// See: https://react.dev/reference/react/act#setting-up-your-testing-environment
// (URL in comment only; no runtime dependency)
// Property is used by React to detect test environments.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal window.electronAPI mock for renderer unit tests.
const electronAPIMock = {
  pathExists: vi.fn(async () => true),
  getFolderContents: vi.fn(async () => []),
  loadProjectFromPath: vi.fn(async () => ({ data: null, path: '' })),
  saveProject: vi.fn(async () => 'mocked-path'),
  resolveVaultPath: vi.fn(async (_vaultPath: string, relativePath: string) => ({
    absolutePath: `C:/mock/${relativePath}`,
    exists: true,
  })),
  getRelativePath: vi.fn(async (_vaultPath: string, absolutePath: string) => {
    const normalized = absolutePath.replace(/\\/g, '/');
    const idx = normalized.indexOf('/assets/');
    return idx >= 0 ? normalized.slice(idx + 1) : null;
  }),
  calculateFileHash: vi.fn(async () => 'abc'),
  getFileInfo: vi.fn(async () => ({ size: 1234 })),
  loadAssetIndex: vi.fn(async () => ({ version: 1, assets: [] })),
  isPathInVault: vi.fn(async () => false),
  vaultGateway: {
    importAndRegisterAsset: vi.fn(async () => ({
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
    moveToTrashWithMeta: vi.fn(async () => 'C:/mock/vault/.trash/img_abc.png'),
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
