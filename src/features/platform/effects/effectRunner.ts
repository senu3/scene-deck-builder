import type { DeleteEffects, EffectRunResult, EffectRunnerDeps } from './effects';

function resolveFailureReason(effectType: DeleteEffects['type'], reason?: string): string {
  if (reason) return reason;
  if (effectType === 'FILES_DELETE') return 'trash-move-failed';
  if (effectType === 'INDEX_UPDATE') return 'index-update-failed';
  return 'metadata-delete-failed';
}

export async function runEffects(
  effects: DeleteEffects[],
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
