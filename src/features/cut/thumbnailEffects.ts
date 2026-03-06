import { runEffects, type AppEffect, type RegenThumbnailsRequest } from '../platform/effects';
import { enqueueClipThumbnailRegeneration, type ClipThumbnailRegenerationDeps } from './clipThumbnailRegenerationQueue';
import type { ThumbnailProfile } from '../../utils/thumbnailCache';

export interface RegenThumbnailsEffectInput {
  profile: ThumbnailProfile;
  reason: string;
  requests: RegenThumbnailsRequest[];
}

export function buildRegenThumbnailsEffect(input: RegenThumbnailsEffectInput): AppEffect {
  return {
    type: 'REGEN_THUMBNAILS',
    payload: {
      profile: input.profile,
      cutIds: Array.from(new Set(input.requests.map((request) => request.cutId))),
      reason: input.reason,
      requests: input.requests,
    },
  };
}

export async function emitRegenThumbnailsEffect(
  input: RegenThumbnailsEffectInput,
  deps: ClipThumbnailRegenerationDeps
): Promise<void> {
  const effect = buildRegenThumbnailsEffect(input);
  const results = await runEffects([effect], {
    deleteAssetFile: async () => ({ success: true }),
    removeAssetsFromIndex: async () => ({ success: true }),
    deleteMetadata: () => {},
    requestThumbnailRegeneration: async (payload) => {
      if (payload.profile !== 'timeline-card') return;
      for (const request of payload.requests) {
        enqueueClipThumbnailRegeneration(request, deps);
      }
    },
  });

  const failed = results.find((result) => !result.success);
  if (!failed) return;
  throw new Error(failed.reason);
}
