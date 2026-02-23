// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateStartAssetFileDragPayload } from '../handlers/assetFileDrag';

const tempDirs: string[] = [];

function mkVaultFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-deck-dnd-'));
  tempDirs.push(root);
  const vaultPath = path.join(root, 'vault');
  const assetsPath = path.join(vaultPath, 'assets');
  fs.mkdirSync(assetsPath, { recursive: true });
  return { root, vaultPath, assetsPath };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('validateStartAssetFileDragPayload', () => {
  it('accepts files inside vault/assets', () => {
    const { vaultPath, assetsPath } = mkVaultFixture();
    const filePath = path.join(assetsPath, 'image.png');
    fs.writeFileSync(filePath, 'ok');

    const result = validateStartAssetFileDragPayload({ filePath, vaultPath });
    expect(result.ok).toBe(true);
    expect(result.filePath).toBeTruthy();
  });

  it('rejects a missing file', () => {
    const { vaultPath, assetsPath } = mkVaultFixture();
    const filePath = path.join(assetsPath, 'missing.png');

    const result = validateStartAssetFileDragPayload({ filePath, vaultPath });
    expect(result.ok).toBe(false);
  });

  it('rejects directories', () => {
    const { vaultPath, assetsPath } = mkVaultFixture();

    const result = validateStartAssetFileDragPayload({ filePath: assetsPath, vaultPath });
    expect(result.ok).toBe(false);
  });

  it('rejects files outside vault/assets', () => {
    const { vaultPath, root } = mkVaultFixture();
    const outsidePath = path.join(root, 'outside.png');
    fs.writeFileSync(outsidePath, 'x');

    const result = validateStartAssetFileDragPayload({ filePath: outsidePath, vaultPath });
    expect(result.ok).toBe(false);
  });
});

