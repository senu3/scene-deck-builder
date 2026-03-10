import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSourceFolderForSourcePanel,
  checkPathExistsForSourcePanel,
  readFolderContentsForSourcePanel,
  selectSourceFolderForSourcePanel,
} from '../sourcePanelProvider';
import {
  getFolderContentsBridge,
  pathExistsBridge,
  selectFolderBridge,
} from '../../platform/electronGateway';

vi.mock('../../platform/electronGateway', () => ({
  getFolderContentsBridge: vi.fn(),
  pathExistsBridge: vi.fn(),
  selectFolderBridge: vi.fn(),
}));

describe('sourcePanelProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns folder contents when bridge succeeds', async () => {
    vi.mocked(getFolderContentsBridge).mockResolvedValue([
      { name: 'a.png', path: '/vault/a.png', isDirectory: false },
    ]);

    const result = await readFolderContentsForSourcePanel('/vault');
    expect(result).toEqual([{ name: 'a.png', path: '/vault/a.png', isDirectory: false }]);
  });

  it('returns null when folder contents bridge fails', async () => {
    vi.mocked(getFolderContentsBridge).mockRejectedValue(new Error('boom'));
    await expect(readFolderContentsForSourcePanel('/vault')).resolves.toBeNull();
  });

  it('returns false when pathExists bridge fails', async () => {
    vi.mocked(pathExistsBridge).mockRejectedValue(new Error('boom'));
    await expect(checkPathExistsForSourcePanel('/vault/assets')).resolves.toBe(false);
  });

  it('returns selected folder when bridge payload is valid', async () => {
    vi.mocked(selectFolderBridge).mockResolvedValue({
      path: '/vault/assets',
      name: 'assets',
      structure: [{ name: 'a.png', path: '/vault/assets/a.png', isDirectory: false }],
    });

    await expect(selectSourceFolderForSourcePanel()).resolves.toEqual({
      path: '/vault/assets',
      name: 'assets',
      structure: [{ name: 'a.png', path: '/vault/assets/a.png', isDirectory: false }],
    });
  });

  it('hydrates dropped folder path into source folder shape', async () => {
    vi.mocked(getFolderContentsBridge).mockResolvedValue([
      { name: 'nested', path: '/vault/drop/nested', isDirectory: true },
    ]);

    await expect(buildSourceFolderForSourcePanel('/vault/drop', 'drop')).resolves.toEqual({
      path: '/vault/drop',
      name: 'drop',
      structure: [{ name: 'nested', path: '/vault/drop/nested', isDirectory: true }],
    });
  });
});
