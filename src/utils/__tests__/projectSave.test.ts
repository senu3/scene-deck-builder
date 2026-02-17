import { describe, expect, it } from 'vitest';
import type { Asset, Scene } from '../../types';
import { buildProjectSavePayload, prepareScenesForSave, serializeProjectSavePayload } from '../projectSave';

const base = {
  version: 3,
  name: 'Project',
  vaultPath: 'C:/vault',
  scenes: [{ id: 's1', name: 'Scene 1', cuts: [], order: 0, notes: [] }],
  sceneOrder: ['s1'],
  sourcePanel: { folders: [], expandedPaths: [], viewMode: 'list' as const },
  savedAt: '2026-02-05T00:00:00.000Z',
};

describe('projectSave', () => {
  it('builds payload with expected fields', () => {
    const payload = buildProjectSavePayload(base);
    expect(payload).toEqual(base);
  });

  it('serializes payload to JSON string', () => {
    const payload = buildProjectSavePayload(base);
    const serialized = serializeProjectSavePayload(payload);
    expect(serialized).toBe(JSON.stringify(base));
  });

  it('includes target duration when provided', () => {
    const payload = buildProjectSavePayload({ ...base, targetTotalDurationSec: 1500 });
    expect(payload.targetTotalDurationSec).toBe(1500);
  });

  it('prepares cut asset snapshot from assetId lookup only', () => {
    const scenes: Scene[] = [{
      id: 'scene-1',
      name: 'Scene 1',
      order: 0,
      notes: [],
      cuts: [{
        id: 'cut-1',
        order: 0,
        assetId: 'asset-1',
        displayTime: 2,
      }],
    }];
    const assets = new Map<string, Asset>([
      ['asset-1', { id: 'asset-1', name: 'img.png', path: '/vault/assets/a.png', vaultRelativePath: 'assets/a.png', type: 'image', thumbnail: 'thumb' }],
    ]);

    const prepared = prepareScenesForSave(scenes, (assetId) => assets.get(assetId));
    expect(prepared[0].cuts[0].asset).toEqual({
      id: 'asset-1',
      name: 'img.png',
      path: '',
      type: 'image',
      thumbnail: 'thumb',
      vaultRelativePath: 'assets/a.png',
    });
  });

  it('does not fallback to legacy cut.asset when assetId lookup fails', () => {
    const scenes: Scene[] = [{
      id: 'scene-1',
      name: 'Scene 1',
      order: 0,
      notes: [],
      cuts: [{
        id: 'cut-1',
        order: 0,
        assetId: 'missing-asset',
        displayTime: 2,
        asset: { id: 'legacy', name: 'legacy.png', path: '/legacy/path.png', type: 'image' },
      }],
    }];

    const prepared = prepareScenesForSave(scenes, () => undefined);
    expect(prepared[0].cuts[0].asset).toBeUndefined();
  });
});
