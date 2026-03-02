import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPathExistsForSourcePanel, readFolderContentsForSourcePanel } from '../sourcePanelProvider';
import { getFolderContentsBridge, pathExistsBridge } from '../../platform/electronGateway';

vi.mock('../../platform/electronGateway', () => ({
  getFolderContentsBridge: vi.fn(),
  pathExistsBridge: vi.fn(),
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
});
