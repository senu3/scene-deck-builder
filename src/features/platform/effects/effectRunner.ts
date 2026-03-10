import type { AppEffect, EffectRunResult, EffectRunnerDeps } from './effects';

function resolveFailureReason(effectType: AppEffect['type'], reason?: string): string {
  if (reason) return reason;
  if (effectType === 'FILES_DELETE') return 'trash-move-failed';
  if (effectType === 'INDEX_UPDATE') return 'index-update-failed';
  if (effectType === 'SAVE_METADATA') return 'metadata-save-failed';
  if (effectType === 'SAVE_PROJECT') return 'project-save-failed';
  if (effectType === 'SAVE_RECENT_PROJECTS') return 'recent-projects-save-failed';
  if (effectType === 'SAVE_ASSET_INDEX') return 'asset-index-save-failed';
  if (effectType === 'REGEN_THUMBNAILS') return 'thumbnail-regeneration-failed';
  return 'metadata-delete-failed';
}

interface RunEffectsOptions {
  onEffectEvent?: (input: {
    stage: 'start' | 'success' | 'failure';
    effect: AppEffect;
    reason?: string;
  }) => void;
}

export async function runEffects(
  effects: AppEffect[],
  deps: EffectRunnerDeps,
  options: RunEffectsOptions = {}
): Promise<EffectRunResult[]> {
  const results: EffectRunResult[] = [];

  for (const effect of effects) {
    options.onEffectEvent?.({
      stage: 'start',
      effect,
    });

    if (effect.type === 'FILES_DELETE') {
      const result = await deps.deleteAssetFile(effect.payload);
      if (!result.success) {
        const reason = resolveFailureReason(effect.type, result.reason);
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      results.push({ effect, success: true });
      options.onEffectEvent?.({
        stage: 'success',
        effect,
      });
      continue;
    }

    if (effect.type === 'INDEX_UPDATE') {
      const result = await deps.removeAssetsFromIndex(effect.payload);
      if (!result.success) {
        const reason = resolveFailureReason(effect.type, result.reason);
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      results.push({ effect, success: true });
      options.onEffectEvent?.({
        stage: 'success',
        effect,
      });
      continue;
    }

    if (effect.type === 'SAVE_METADATA') {
      const success = await deps.saveMetadata(effect.payload);
      if (!success) {
        const reason = resolveFailureReason(effect.type);
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      results.push({ effect, success: true });
      options.onEffectEvent?.({
        stage: 'success',
        effect,
      });
      continue;
    }

    if (effect.type === 'SAVE_PROJECT') {
      const success = await deps.saveProject(effect.payload);
      if (!success) {
        const reason = resolveFailureReason(effect.type);
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      results.push({ effect, success: true });
      options.onEffectEvent?.({
        stage: 'success',
        effect,
      });
      continue;
    }

    if (effect.type === 'SAVE_RECENT_PROJECTS') {
      const success = await deps.saveRecentProjects(effect.payload);
      if (!success) {
        const reason = resolveFailureReason(effect.type);
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      results.push({ effect, success: true });
      options.onEffectEvent?.({
        stage: 'success',
        effect,
      });
      continue;
    }

    if (effect.type === 'SAVE_ASSET_INDEX') {
      const success = await deps.saveAssetIndex(effect.payload);
      if (!success) {
        const reason = resolveFailureReason(effect.type);
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      results.push({ effect, success: true });
      options.onEffectEvent?.({
        stage: 'success',
        effect,
      });
      continue;
    }

    if (effect.type === 'REGEN_THUMBNAILS') {
      if (!deps.requestThumbnailRegeneration) {
        const reason = resolveFailureReason(effect.type, 'thumbnail-regeneration-handler-missing');
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      try {
        await deps.requestThumbnailRegeneration(effect.payload);
        results.push({ effect, success: true });
        options.onEffectEvent?.({
          stage: 'success',
          effect,
        });
      } catch (error) {
        const reason = resolveFailureReason(
          effect.type,
          error instanceof Error ? error.message : undefined
        );
        results.push({
          effect,
          success: false,
          reason,
        });
        options.onEffectEvent?.({
          stage: 'failure',
          effect,
          reason,
        });
        return results;
      }
      continue;
    }

    try {
      await deps.deleteMetadata(effect.payload.assetIds);
      results.push({ effect, success: true });
      options.onEffectEvent?.({
        stage: 'success',
        effect,
      });
    } catch (error) {
      const reason = resolveFailureReason(
        effect.type,
        error instanceof Error ? error.message : undefined
      );
      results.push({
        effect,
        success: false,
        reason,
      });
      options.onEffectEvent?.({
        stage: 'failure',
        effect,
        reason,
      });
      return results;
    }
  }

  return results;
}
