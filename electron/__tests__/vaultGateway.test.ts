// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureVaultStagingPath, finalizeAssetIntoVaultInternal, moveToTrashInternal } from '../vaultGateway';

const tempDirs: string[] = [];

function mkVaultFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-deck-vault-gateway-'));
  tempDirs.push(root);
  const vaultPath = path.join(root, 'vault');
  const assetsPath = path.join(vaultPath, 'assets');
  const trashPath = path.join(vaultPath, '.trash');
  fs.mkdirSync(assetsPath, { recursive: true });
  fs.mkdirSync(trashPath, { recursive: true });
  return { root, vaultPath, assetsPath, trashPath };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('moveToTrashInternal', () => {
  it('removes all linked assetIds from index and records them in trash metadata', async () => {
    const { vaultPath, assetsPath, trashPath } = mkVaultFixture();
    const filePath = path.join(assetsPath, 'shared.wav');
    fs.writeFileSync(filePath, 'audio-data');
    fs.writeFileSync(path.join(assetsPath, '.index.json'), JSON.stringify({
      version: 1,
      assets: [
        {
          id: 'asset-1',
          hash: 'hash-1',
          filename: 'shared.wav',
          originalName: 'shared.wav',
          originalPath: 'imports/shared.wav',
          type: 'audio',
          fileSize: 100,
          importedAt: '2026-03-11T00:00:00.000Z',
        },
        {
          id: 'asset-2',
          hash: 'hash-2',
          filename: 'shared.wav',
          originalName: 'shared.wav',
          originalPath: 'imports/shared-copy.wav',
          type: 'audio',
          fileSize: 100,
          importedAt: '2026-03-11T00:01:00.000Z',
        },
        {
          id: 'asset-3',
          hash: 'hash-3',
          filename: 'other.wav',
          originalName: 'other.wav',
          originalPath: 'imports/other.wav',
          type: 'audio',
          fileSize: 80,
          importedAt: '2026-03-11T00:02:00.000Z',
        },
      ],
    }, null, 2), 'utf-8');

    const result = await moveToTrashInternal(filePath, trashPath, {
      assetIds: ['asset-1', 'asset-2'],
      reason: 'asset-panel-delete',
    });

    expect(result).toMatchObject({
      success: true,
      indexUpdated: true,
      trashedPath: path.join(trashPath, 'shared.wav'),
    });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(path.join(trashPath, 'shared.wav'))).toBe(true);

    const nextIndex = JSON.parse(fs.readFileSync(path.join(assetsPath, '.index.json'), 'utf-8')) as {
      assets: Array<{ id: string }>;
    };
    expect(nextIndex.assets.map((entry) => entry.id)).toEqual(['asset-3']);

    const trashIndex = JSON.parse(fs.readFileSync(path.join(trashPath, '.trash.json'), 'utf-8')) as {
      items: Array<{
        assetId?: string;
        assetIds?: string[];
        indexEntry?: { id: string };
        indexEntries?: Array<{ id: string }>;
      }>;
    };
    expect(trashIndex.items).toHaveLength(1);
    expect(trashIndex.items[0]).toMatchObject({
      assetId: 'asset-1',
      assetIds: ['asset-1', 'asset-2'],
      indexEntry: { id: 'asset-1' },
      indexEntries: [{ id: 'asset-1' }, { id: 'asset-2' }],
    });
  });
});

describe('finalizeAssetIntoVaultInternal', () => {
  it('imports external files into managed hash filenames and updates the index', async () => {
    const { vaultPath, assetsPath } = mkVaultFixture();
    const sourcePath = path.join(path.dirname(vaultPath), 'source.png');
    fs.writeFileSync(sourcePath, 'image-data');

    const result = await finalizeAssetIntoVaultInternal(sourcePath, vaultPath, 'asset-1', {
      originalName: 'display.png',
      originalPath: sourcePath,
    });

    expect(result.success).toBe(true);
    expect(result.relativePath).toMatch(/^assets\/img_[a-f0-9]{12}\.png$/);
    expect(result.vaultPath).toMatch(/[\\/]assets[\\/]img_[a-f0-9]{12}\.png$/);
    expect(fs.existsSync(sourcePath)).toBe(true);

    const index = JSON.parse(fs.readFileSync(path.join(assetsPath, '.index.json'), 'utf-8')) as {
      assets: Array<{ id: string; filename: string; originalName: string; originalPath: string }>;
    };
    expect(index.assets).toEqual([expect.objectContaining({
      id: 'asset-1',
      filename: result.relativePath?.replace(/^assets\//, ''),
      originalName: 'display.png',
    })]);
  });

  it('normalizes pre-existing assets files to managed hash filenames and removes the original file', async () => {
    const { vaultPath, assetsPath } = mkVaultFixture();
    const sourcePath = path.join(assetsPath, 'captured-frame.png');
    fs.writeFileSync(sourcePath, 'frame-data');

    const result = await finalizeAssetIntoVaultInternal(sourcePath, vaultPath, 'asset-frame', {
      originalName: 'Captured Frame',
      originalPath: sourcePath,
    });

    expect(result.success).toBe(true);
    expect(result.relativePath).toMatch(/^assets\/img_[a-f0-9]{12}\.png$/);
    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(result.vaultPath && fs.existsSync(result.vaultPath)).toBe(true);

    const index = JSON.parse(fs.readFileSync(path.join(assetsPath, '.index.json'), 'utf-8')) as {
      assets: Array<{ id: string; filename: string; originalName: string; originalPath: string }>;
    };
    expect(index.assets).toEqual([expect.objectContaining({
      id: 'asset-frame',
      filename: result.relativePath?.replace(/^assets\//, ''),
      originalName: 'Captured Frame',
      originalPath: 'assets/captured-frame.png',
    })]);
  });

  it('does not cleanup unrelated stale staging files during finalize', async () => {
    const { vaultPath } = mkVaultFixture();
    const sourcePath = path.join(path.dirname(vaultPath), 'source.png');
    fs.writeFileSync(sourcePath, 'image-data');

    const stagingPath = ensureVaultStagingPath(vaultPath);
    const staleFile = path.join(stagingPath, 'old.tmp');
    fs.writeFileSync(staleFile, 'old');
    const staleDate = new Date(Date.now() - (48 * 60 * 60 * 1000));
    fs.utimesSync(staleFile, staleDate, staleDate);

    // Recreate the stale file after the explicit staging access cleanup above.
    fs.writeFileSync(staleFile, 'old');
    fs.utimesSync(staleFile, staleDate, staleDate);

    const result = await finalizeAssetIntoVaultInternal(sourcePath, vaultPath, 'asset-2', {
      originalName: 'display.png',
      originalPath: sourcePath,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(staleFile)).toBe(true);
  });
});

describe('ensureVaultStagingPath', () => {
  it('purges stale staging files while keeping recent ones', () => {
    const { vaultPath } = mkVaultFixture();
    const stagingPath = ensureVaultStagingPath(vaultPath);
    const staleFile = path.join(stagingPath, 'old.tmp');
    const freshFile = path.join(stagingPath, 'recent.tmp');
    const nestedDir = path.join(stagingPath, 'nested');
    const nestedStaleFile = path.join(nestedDir, 'nested-old.tmp');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(staleFile, 'old');
    fs.writeFileSync(freshFile, 'recent');
    fs.writeFileSync(nestedStaleFile, 'nested-old');

    const now = new Date();
    const staleDate = new Date(now.getTime() - (48 * 60 * 60 * 1000));
    fs.utimesSync(staleFile, staleDate, staleDate);
    fs.utimesSync(nestedStaleFile, staleDate, staleDate);

    ensureVaultStagingPath(vaultPath);

    expect(fs.existsSync(staleFile)).toBe(false);
    expect(fs.existsSync(nestedStaleFile)).toBe(false);
    expect(fs.existsSync(nestedDir)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
  });
});
