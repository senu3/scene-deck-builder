import type { Asset, Cut, CutAudioBinding } from '../../types';

interface ResolveCutAudioBindingInput {
  cut: Cut | null | undefined;
  getAsset: (assetId: string) => Asset | undefined;
  globalMuted?: boolean;
}

export interface ResolvedCutAudioBinding {
  primary: CutAudioBinding | undefined;
  attached: Asset | undefined;
  offset: number;
  muteEmbedded: boolean;
}

const AUDIO_KIND_PRIORITY: Record<'voice.lipsync' | 'voice.other' | 'se', number> = {
  'voice.lipsync': 0,
  'voice.other': 1,
  se: 2,
};

function resolvePrimaryAudioBinding(cut: Cut | null | undefined): CutAudioBinding | undefined {
  if (!cut?.audioBindings?.length) return undefined;

  const enabledBindings = cut.audioBindings.filter((binding) => binding.enabled !== false);
  if (enabledBindings.length === 0) {
    return cut.audioBindings[0];
  }

  return enabledBindings
    .slice()
    .sort((a, b) => AUDIO_KIND_PRIORITY[a.kind] - AUDIO_KIND_PRIORITY[b.kind])[0];
}

function resolveMuteEmbeddedAudio(cut: Cut | null | undefined, globalMuted: boolean): boolean {
  const useEmbeddedAudio = cut?.useEmbeddedAudio ?? true;
  return globalMuted || !useEmbeddedAudio;
}

export function resolveCutAudioBinding({
  cut,
  getAsset,
  globalMuted = false,
}: ResolveCutAudioBindingInput): ResolvedCutAudioBinding {
  const primary = resolvePrimaryAudioBinding(cut);
  const attached = primary?.audioAssetId ? getAsset(primary.audioAssetId) : undefined;

  return {
    primary,
    attached,
    offset: primary?.offsetSec ?? 0,
    muteEmbedded: resolveMuteEmbeddedAudio(cut, globalMuted),
  };
}
