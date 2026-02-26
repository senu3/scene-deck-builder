import type { AudioBindingCore, CutAudioBinding, SceneAudioBinding } from '../types';

export function toCoreAudioBindingFromCut(binding: CutAudioBinding): AudioBindingCore {
  return {
    assetId: binding.audioAssetId,
    enabled: binding.enabled !== false,
    gain: binding.gain,
    offsetSec: binding.offsetSec,
  };
}

export function toCoreAudioBindingFromScene(binding: SceneAudioBinding): AudioBindingCore {
  return {
    assetId: binding.audioAssetId,
    enabled: binding.enabled !== false,
    gain: binding.gain,
    offsetSec: 0,
  };
}

export function fromCoreAudioBindingToCut(
  binding: AudioBindingCore,
  options: {
    id: string;
    kind: CutAudioBinding['kind'];
    sourceName?: string;
  }
): CutAudioBinding {
  return {
    id: options.id,
    audioAssetId: binding.assetId,
    sourceName: options.sourceName,
    offsetSec: binding.offsetSec ?? 0,
    gain: binding.gain,
    enabled: binding.enabled !== false,
    kind: options.kind,
  };
}

export function fromCoreAudioBindingToScene(
  binding: AudioBindingCore,
  options: {
    id: string;
    sourceName?: string;
  }
): SceneAudioBinding {
  return {
    id: options.id,
    audioAssetId: binding.assetId,
    sourceName: options.sourceName,
    gain: binding.gain,
    enabled: binding.enabled !== false,
    kind: 'scene',
  };
}
