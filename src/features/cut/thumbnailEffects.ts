import {
  createRegenThumbnailsEffect,
  dispatchAppEffects,
  type AppEffect,
  type RegenThumbnailsRequest,
} from '../platform/effects';
import type { ClipThumbnailRegenerationDeps } from './clipThumbnailRegenerationQueue';
import type { ThumbnailProfile } from '../../utils/thumbnailCache';

export interface RegenThumbnailsEffectInput {
  profile: ThumbnailProfile;
  reason: string;
  requests: RegenThumbnailsRequest[];
}

export function buildRegenThumbnailsEffect(input: RegenThumbnailsEffectInput): AppEffect {
  return createRegenThumbnailsEffect({
    profile: input.profile,
    cutIds: Array.from(new Set(input.requests.map((request) => request.cutId))),
    reason: input.reason,
    requests: input.requests,
  });
}

export async function emitRegenThumbnailsEffect(
  input: RegenThumbnailsEffectInput,
  deps: ClipThumbnailRegenerationDeps
): Promise<void> {
  const effect = buildRegenThumbnailsEffect(input);
  const { results } = await dispatchAppEffects([effect], {
    origin: 'feature',
    thumbnailDeps: deps,
  });

  const failed = results.find((result) => !result.success);
  if (!failed) return;
  throw new Error(failed.reason);
}
