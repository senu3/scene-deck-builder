import type { AppEffect, EffectRunResult, EffectRunnerDeps } from './effects';

function resolveFailureReason(effectType: AppEffect['type'], reason?: string): string {
  if (reason) return reason;
  if (effectType === 'FILES_DELETE') return 'trash-move-failed';
  if (effectType === 'INDEX_UPDATE') return 'index-update-failed';
  if (effectType === 'REGEN_THUMBNAILS') return 'thumbnail-regeneration-failed';
  return 'metadata-delete-failed';
}

export async function runEffects(
  effects: AppEffect[],
  deps: EffectRunnerDeps
): Promise<EffectRunResult[]> {
  const results: EffectRunResult[] = [];

  for (const effect of effects) {
    if (effect.type === 'FILES_DELETE') {
      const result = await deps.deleteAssetFile(effect.payload);
      if (!result.success) {
        results.push({
          effect,
          success: false,
          reason: resolveFailureReason(effect.type, result.reason),
        });
        return results;
      }
      results.push({ effect, success: true });
      continue;
    }

    if (effect.type === 'INDEX_UPDATE') {
      const result = await deps.removeAssetsFromIndex(effect.payload);
      if (!result.success) {
        results.push({
          effect,
          success: false,
          reason: resolveFailureReason(effect.type, result.reason),
        });
        return results;
      }
      results.push({ effect, success: true });
      continue;
    }

    if (effect.type === 'REGEN_THUMBNAILS') {
      if (!deps.requestThumbnailRegeneration) {
        results.push({
          effect,
          success: false,
          reason: resolveFailureReason(effect.type, 'thumbnail-regeneration-handler-missing'),
        });
        return results;
      }
      try {
        await deps.requestThumbnailRegeneration(effect.payload);
        results.push({ effect, success: true });
      } catch (error) {
        results.push({
          effect,
          success: false,
          reason: resolveFailureReason(
            effect.type,
            error instanceof Error ? error.message : undefined
          ),
        });
        return results;
      }
      continue;
    }

    try {
      await deps.deleteMetadata(effect.payload.assetIds);
      results.push({ effect, success: true });
    } catch (error) {
      results.push({
        effect,
        success: false,
        reason: resolveFailureReason(
          effect.type,
          error instanceof Error ? error.message : undefined
        ),
      });
      return results;
    }
  }

  return results;
}
