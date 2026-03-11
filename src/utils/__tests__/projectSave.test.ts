import { describe, expect, it } from 'vitest';
import type { Asset, Scene } from '../../types';
import {
  buildDerivedAssetIndexForSave,
  buildProjectSavePayload,
  collectPersistedCutRuntimeById,
  normalizePersistedCutRuntimeById,
  prepareScenesForSave,
  serializeProjectSavePayload,
} from '../projectSave';

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

  it('includes persisted hold runtime when present', () => {
    const payload = buildProjectSavePayload({
      ...base,
      cutRuntimeById: {
        'cut-hold': {
          hold: {
            enabled: true,
            mode: 'tail',
            durationMs: 1200,
          },
        },
      },
      scenes: [{
        id: 's1',
        name: 'Scene 1',
        notes: [],
        cuts: [{ id: 'cut-hold', assetId: 'a1', displayTime: 1, order: 0 }],
      }],
      sceneOrder: ['s1'],
    });
    expect(payload.cutRuntimeById).toEqual({
      'cut-hold': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 1200,
        },
      },
    });
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

  it('rebuilds usageRefs and asset order only for save-time derived index output', () => {
    const scenes: Scene[] = [{
      id: 'scene-1',
      name: 'Scene 1',
      order: 0,
      notes: [],
      cuts: [
        { id: 'cut-1', order: 0, assetId: 'asset-b', displayTime: 2 },
        { id: 'cut-2', order: 1, assetId: 'asset-a', displayTime: 1 },
      ],
    }];

    const rebuilt = buildDerivedAssetIndexForSave({
      version: 1,
      assets: [
        {
          id: 'asset-a',
          hash: 'hash-a',
          filename: 'a.png',
          originalName: 'a.png',
          originalPath: 'assets/a.png',
          type: 'image',
          fileSize: 100,
          importedAt: '2026-03-11T00:00:00.000Z',
        },
        {
          id: 'asset-b',
          hash: 'hash-b',
          filename: 'b.png',
          originalName: 'b.png',
          originalPath: 'assets/b.png',
          type: 'image',
          fileSize: 200,
          importedAt: '2026-03-11T00:00:00.000Z',
        },
      ],
    }, scenes, ['scene-1']);

    expect(rebuilt.assets.map((entry) => entry.id)).toEqual(['asset-b', 'asset-a']);
    expect(rebuilt.assets[0]?.usageRefs).toEqual([expect.objectContaining({
      sceneId: 'scene-1',
      cutId: 'cut-1',
      cutIndex: 1,
    })]);
    expect(rebuilt.assets[1]?.usageRefs).toEqual([expect.objectContaining({
      sceneId: 'scene-1',
      cutId: 'cut-2',
      cutIndex: 2,
    })]);
  });

  it('drops non-hold runtime and unknown cutIds from persisted runtime map', () => {
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
    const persisted = collectPersistedCutRuntimeById({
      'cut-1': {
        isLoading: true,
      },
      'cut-2': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 1000,
        },
      },
    }, scenes);
    expect(persisted).toEqual({});
  });

  it('normalizes raw persisted runtime and keeps only valid hold entries', () => {
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
    const normalized = normalizePersistedCutRuntimeById({
      'cut-1': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 1500.4,
        },
      },
      'cut-x': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 2000,
        },
      },
      'cut-1-bad': {
        hold: {
          enabled: false,
          mode: 'tail',
          durationMs: 1000,
        },
      },
    }, scenes);

    expect(normalized).toEqual({
      'cut-1': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 1500,
        },
      },
    });
  });

  it('round-trips persisted hold runtime through save payload JSON', () => {
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
    const payload = buildProjectSavePayload({
      ...base,
      scenes,
      sceneOrder: ['scene-1'],
      cutRuntimeById: {
        'cut-1': {
          hold: {
            enabled: true,
            mode: 'tail',
            durationMs: 1100,
          },
        },
      },
    });
    const serialized = serializeProjectSavePayload(payload);
    const parsed = JSON.parse(serialized);
    const normalized = normalizePersistedCutRuntimeById(parsed.cutRuntimeById, scenes);

    expect(normalized).toEqual({
      'cut-1': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 1100,
        },
      },
    });
  });
});
