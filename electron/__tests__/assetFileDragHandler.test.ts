// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateStartAssetDragOutPayload } from '../handlers/assetFileDrag';

const tempDirs: string[] = [];

function mkVaultFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-deck-dnd-'));
  tempDirs.push(root);
  const vaultPath = path.join(root, 'vault');
  const assetsPath = path.join(vaultPath, 'assets');
  fs.mkdirSync(assetsPath, { recursive: true });
  return { root, vaultPath, assetsPath };
}

function writeAssetIndex(
  vaultPath: string,
  entries: Array<{ id: string; filename: string }>
) {
  const indexPath = path.join(vaultPath, 'assets', '.index.json');
  fs.writeFileSync(indexPath, JSON.stringify({
    version: 1,
    assets: entries.map((entry) => ({
      ...entry,
      hash: `${entry.id}-hash`,
      originalName: entry.filename,
      originalPath: `assets/${entry.filename}`,
      type: 'image',
      fileSize: 1,
      importedAt: '2026-03-12T00:00:00.000Z',
    })),
  }), 'utf-8');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateStartAssetDragOutPayload', () => {
  it('accepts indexed files inside vault/assets', () => {
    const { vaultPath, assetsPath } = mkVaultFixture();
    const filePath = path.join(assetsPath, 'image.png');
    fs.writeFileSync(filePath, 'ok');
    writeAssetIndex(vaultPath, [{ id: 'asset-1', filename: 'image.png' }]);

    const result = validateStartAssetDragOutPayload({ assetId: 'asset-1', vaultPath });
    expect(result.ok).toBe(true);
    expect(result.filePath).toBeTruthy();
  });

  it('rejects when asset id is missing', () => {
    const { vaultPath } = mkVaultFixture();
    writeAssetIndex(vaultPath, []);

    const result = validateStartAssetDragOutPayload({ assetId: '', vaultPath });
    expect(result).toEqual({ ok: false, reason: 'asset-id-missing' });
  });

  it('rejects when the asset record is missing from index', () => {
    const { vaultPath } = mkVaultFixture();
    writeAssetIndex(vaultPath, [{ id: 'asset-1', filename: 'image.png' }]);

    const result = validateStartAssetDragOutPayload({ assetId: 'missing', vaultPath });
    expect(result).toEqual({ ok: false, reason: 'asset-not-found' });
  });

  it('rejects when the indexed file is missing', () => {
    const { vaultPath } = mkVaultFixture();
    writeAssetIndex(vaultPath, [{ id: 'asset-1', filename: 'missing.png' }]);

    const result = validateStartAssetDragOutPayload({ assetId: 'asset-1', vaultPath });
    expect(result).toEqual({ ok: false, reason: 'file-missing' });
  });

  it('rejects index entries that escape vault/assets', () => {
    const { vaultPath } = mkVaultFixture();
    const outsidePath = path.join(vaultPath, 'outside.png');
    fs.writeFileSync(outsidePath, 'x');
    writeAssetIndex(vaultPath, [{ id: 'asset-1', filename: '../outside.png' }]);

    const result = validateStartAssetDragOutPayload({ assetId: 'asset-1', vaultPath });
    expect(result).toEqual({ ok: false, reason: 'outside-assets' });
  });
});
