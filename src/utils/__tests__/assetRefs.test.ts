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
      metadata: {
        'img-1': {
          assetId: 'img-1',
          lipSync: {
            baseImageAssetId: 'img-1',
            variantAssetIds: ['img-2', 'img-3', 'img-4'],
            maskAssetId: 'mask-1',
            compositedFrameAssetIds: ['cmp-1', 'cmp-2', 'cmp-3', 'cmp-4'],
            rmsSourceAudioAssetId: 'aud-1',
            sourceVideoAssetId: 'vid-1',
            thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
            fps: 60,
          },
        },
      },
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
        },
      },
    } as any;

    const refs = collectAssetRefs(scenes, metadataStore);
    expect(refs.get('img-1')?.some((ref) => ref.kind === 'cut')).toBe(true);
    expect(refs.get('aud-1')?.some((ref) => ref.kind === 'cut-audio-binding')).toBe(true);
    expect(refs.get('aud-scene-1')?.some((ref) => ref.kind === 'scene-audio')).toBe(true);
    expect(refs.get('mask-1')?.some((ref) => ref.kind === 'lipsync-mask')).toBe(true);
    expect(refs.get('cmp-3')?.some((ref) => ref.kind === 'lipsync-composited')).toBe(true);
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

    const blocking = getBlockingRefsForAssetIds(refs, ['aud-1']);
    expect(blocking.length).toBe(1);
    expect(blocking[0]?.kind).toBe('cut-audio-binding');

    const dangling = findDanglingAssetRefs(refs, new Set(['img-1']));
    expect(dangling.some((ref) => ref.assetId === 'aud-1')).toBe(true);
  });
});
