import { describe, expect, it } from 'vitest';
import { collectAssetRefs, findDanglingAssetRefs, getBlockingRefsForAssetIds } from '../assetRefs';

describe('assetRefs', () => {
  it('collects cut and metadata references with expected kinds', () => {
    const scenes = [
      {
        id: 'scene-1',
        name: 'S1',
        order: 0,
        notes: [],
        cuts: [
          {
            id: 'cut-1',
            assetId: 'img-1',
            order: 0,
            displayTime: 1,
            audioBindings: [{ id: 'b1', audioAssetId: 'aud-1', offsetSec: 0, enabled: true, kind: 'se' }],
          },
        ],
      },
    ] as any;
    const metadataStore = {
      version: 1,
      metadata: {},
      sceneMetadata: {
        'scene-1': {
          id: 'scene-1',
          name: 'S1',
          notes: [],
          updatedAt: 't',
          attachAudio: {
            id: 'scene-a1',
            audioAssetId: 'aud-scene-1',
            enabled: true,
            kind: 'scene',
          },
          groupAudioBindings: {
            'group-1': {
              id: 'ga-1',
              groupId: 'group-1',
              audioAssetId: 'aud-group-1',
              enabled: true,
              kind: 'group',
            },
            'group-disabled': {
              id: 'ga-2',
              groupId: 'group-disabled',
              audioAssetId: 'aud-group-disabled',
              enabled: false,
              kind: 'group',
            },
          },
        },
      },
    } as any;

    const refs = collectAssetRefs(scenes, metadataStore);
    expect(refs.get('img-1')?.some((ref) => ref.kind === 'cut')).toBe(true);
    expect(refs.get('aud-1')?.some((ref) => ref.kind === 'cut-audio-binding')).toBe(true);
    expect(refs.get('aud-scene-1')?.some((ref) => ref.kind === 'scene-audio')).toBe(true);
    expect(refs.get('aud-group-1')?.some((ref) => ref.kind === 'group-audio' && ref.groupId === 'group-1')).toBe(true);
    expect(refs.get('aud-group-disabled')).toBeUndefined();
  });

  it('returns blocking refs and detects dangling refs', () => {
    const refs = collectAssetRefs(
      [{
        id: 'scene-1',
        name: 'S1',
        order: 0,
        notes: [],
        cuts: [{
          id: 'cut-1',
          assetId: 'img-1',
          order: 0,
          displayTime: 1,
          audioBindings: [{ id: 'b1', audioAssetId: 'aud-1', offsetSec: 0, enabled: true, kind: 'se' }],
        }],
      }] as any,
      {
        version: 1,
        metadata: {},
        sceneMetadata: {},
      } as any
    );

    const blocking = getBlockingRefsForAssetIds(refs, ['aud-1', 'aud-group-1']);
    expect(blocking.length).toBe(1);
    expect(blocking[0]?.kind).toBe('cut-audio-binding');

    const dangling = findDanglingAssetRefs(refs, new Set(['img-1']));
    expect(dangling.some((ref) => ref.assetId === 'aud-1')).toBe(true);
  });

  it('returns group-audio as blocking refs', () => {
    const refs = collectAssetRefs(
      [{
        id: 'scene-1',
        name: 'S1',
        order: 0,
        notes: [],
        cuts: [{ id: 'cut-1', assetId: 'img-1', order: 0, displayTime: 1, groupId: 'group-1' }],
      }] as any,
      {
        version: 1,
        metadata: {},
        sceneMetadata: {
          'scene-1': {
            id: 'scene-1',
            name: 'S1',
            notes: [],
            updatedAt: 't',
            groupAudioBindings: {
              'group-1': {
                id: 'ga-1',
                groupId: 'group-1',
                audioAssetId: 'aud-group-1',
                enabled: true,
                kind: 'group',
              },
            },
          },
        },
      } as any
    );

    const blocking = getBlockingRefsForAssetIds(refs, ['aud-group-1']);
    expect(blocking).toHaveLength(1);
    expect(blocking[0]?.kind).toBe('group-audio');
    expect(blocking[0]?.groupId).toBe('group-1');
  });
});
