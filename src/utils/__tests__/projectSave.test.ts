import { describe, expect, it } from 'vitest';
import type { Asset, Scene } from '../../types';
import {
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
            muteAudio: true,
            composeWithClip: true,
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
          muteAudio: true,
          composeWithClip: true,
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
          muteAudio: true,
          composeWithClip: true,
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
          muteAudio: true,
          composeWithClip: true,
        },
      },
      'cut-x': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 2000,
          muteAudio: true,
          composeWithClip: true,
        },
      },
      'cut-1-bad': {
        hold: {
          enabled: false,
          mode: 'tail',
          durationMs: 1000,
          muteAudio: true,
          composeWithClip: true,
        },
      },
    }, scenes);

    expect(normalized).toEqual({
      'cut-1': {
        hold: {
          enabled: true,
          mode: 'tail',
          durationMs: 1500,
          muteAudio: true,
          composeWithClip: true,
        },
      },
    });
  });
});
