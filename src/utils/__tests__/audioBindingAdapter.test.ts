import { describe, expect, it } from 'vitest';
import {
  fromCoreAudioBindingToCut,
  fromCoreAudioBindingToScene,
  toCoreAudioBindingFromCut,
  toCoreAudioBindingFromScene,
} from '../audioBindingAdapter';

describe('audioBindingAdapter', () => {
  it('converts cut binding to core binding', () => {
    const core = toCoreAudioBindingFromCut({
      id: 'cut-bind-1',
      audioAssetId: 'aud-1',
      sourceName: 'voice.wav',
      offsetSec: 1.5,
      gain: 0.7,
      enabled: true,
      kind: 'voice.other',
    });

    expect(core).toEqual({
      assetId: 'aud-1',
      enabled: true,
      gain: 0.7,
      offsetSec: 1.5,
    });
  });

  it('converts scene binding to core binding', () => {
    const core = toCoreAudioBindingFromScene({
      id: 'scene-bind-1',
      audioAssetId: 'aud-scene',
      sourceName: 'bgm.wav',
      gain: 0.5,
      enabled: true,
      kind: 'scene',
    });

    expect(core).toEqual({
      assetId: 'aud-scene',
      enabled: true,
      gain: 0.5,
      offsetSec: 0,
    });
  });

  it('converts core binding back to cut binding', () => {
    const cutBinding = fromCoreAudioBindingToCut(
      {
        assetId: 'aud-2',
        enabled: true,
        gain: 0.9,
        offsetSec: 2,
      },
      {
        id: 'cut-bind-2',
        kind: 'se',
        sourceName: 'se.wav',
      }
    );

    expect(cutBinding).toEqual({
      id: 'cut-bind-2',
      audioAssetId: 'aud-2',
      sourceName: 'se.wav',
      offsetSec: 2,
      gain: 0.9,
      enabled: true,
      kind: 'se',
    });
  });

  it('converts core binding back to scene binding', () => {
    const sceneBinding = fromCoreAudioBindingToScene(
      {
        assetId: 'aud-3',
        enabled: true,
        gain: 0.4,
      },
      {
        id: 'scene-bind-2',
        sourceName: 'scene.wav',
      }
    );

    expect(sceneBinding).toEqual({
      id: 'scene-bind-2',
      audioAssetId: 'aud-3',
      sourceName: 'scene.wav',
      gain: 0.4,
      enabled: true,
      kind: 'scene',
    });
  });
});
