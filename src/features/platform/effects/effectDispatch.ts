import { enqueueClipThumbnailRegeneration, type ClipThumbnailRegenerationDeps } from '../../cut/clipThumbnailRegenerationQueue';
import { deleteAssetFile } from '../../metadata/provider';
import { useStore } from '../../../store/useStore';
import { saveMetadataStore } from '../../../utils/metadataStore';
import {
  saveAssetIndexBridge,
  saveProjectBridge,
  saveRecentProjectsBridge,
} from '../electronGateway';
import { recordEffectActivity } from './effectActivity';
import { runEffects } from './effectRunner';
import type { AppEffect, AppEffectWarning, EffectRunResult } from './effects';

export interface AppEffectDispatchOptions {
  origin?: 'command' | 'feature' | 'store';
  commandId?: string;
  commandType?: string;
  thumbnailDeps?: Partial<ClipThumbnailRegenerationDeps>;
}

export interface AppEffectDispatchResult {
  results: EffectRunResult[];
  warnings: AppEffectWarning[];
}

function resolveEffectWarnings(
  results: EffectRunResult[],
  options: AppEffectDispatchOptions
): AppEffectWarning[] {
  return results
    .filter((result): result is Extract<EffectRunResult, { success: false }> => !result.success)
    .filter((result) => result.effect.failurePolicy !== 'fail')
    .map((result) => ({
      code: 'effect-failed' as const,
      effectType: result.effect.type,
      reason: result.reason,
      message: `${result.effect.type} failed: ${result.reason}`,
      commandId: options.commandId,
      commandType: options.commandType,
    }));
}

function resolveThumbnailDeps(
  options: AppEffectDispatchOptions
): ClipThumbnailRegenerationDeps {
  return {
    getCurrentCut: options.thumbnailDeps?.getCurrentCut ?? ((sceneId, cutId) => {
      const scene = useStore.getState().scenes.find((entry) => entry.id === sceneId);
      return scene?.cuts.find((cut) => cut.id === cutId);
    }),
    updateCutAsset: options.thumbnailDeps?.updateCutAsset ?? ((sceneId, cutId, updates) => {
      useStore.getState().updateCutAsset(sceneId, cutId, updates);
    }),
    onThumbnailUpdated: options.thumbnailDeps?.onThumbnailUpdated,
  };
}

function recordIssuedEffects(effects: AppEffect[], options: AppEffectDispatchOptions): void {
  for (const effect of effects) {
    recordEffectActivity({
      stage: 'issued',
      effectType: effect.type,
      channel: effect.channel,
      orderingKey: effect.orderingKey,
      commandId: options.commandId,
      commandType: options.commandType,
    });
  }
}

async function runEffectBatch(
  effects: AppEffect[],
  options: AppEffectDispatchOptions
): Promise<EffectRunResult[]> {
  if (effects.length === 0) return [];

  recordIssuedEffects(effects, options);

  const thumbnailDeps = resolveThumbnailDeps(options);
  return runEffects(effects, {
    deleteAssetFile,
    deleteMetadata: async (assetIds) => {
      useStore.getState().removeAssetReferences(assetIds);
    },
    saveMetadata: async ({ vaultPath, store }) => saveMetadataStore(vaultPath, store),
    saveProject: async ({ projectPath, projectData }) => (await saveProjectBridge(projectData, projectPath)) !== null,
    saveRecentProjects: async ({ projects }) => saveRecentProjectsBridge(projects),
    saveAssetIndex: async ({ vaultPath, index }) => saveAssetIndexBridge(vaultPath, index),
    requestThumbnailRegeneration: async (payload) => {
      if (payload.profile !== 'timeline-card') return;
      for (const request of payload.requests) {
        enqueueClipThumbnailRegeneration(request, thumbnailDeps);
      }
    },
  }, {
    onEffectEvent: ({ stage, effect, reason }) => {
      recordEffectActivity({
        stage,
        effectType: effect.type,
        channel: effect.channel,
        orderingKey: effect.orderingKey,
        commandId: options.commandId,
        commandType: options.commandType,
        reason,
      });
    },
  });
}

export async function dispatchAppEffects(
  effects: AppEffect[],
  options: AppEffectDispatchOptions = {}
): Promise<AppEffectDispatchResult> {
  const commitEffects = effects.filter((effect) => effect.channel === 'commit');
  const deferredEffects = effects.filter((effect) => effect.channel === 'deferred');

  const commitResults = await runEffectBatch(commitEffects, options);
  const commitFailed = commitResults.some((result) => !result.success);
  if (commitFailed) {
    return {
      results: commitResults,
      warnings: resolveEffectWarnings(commitResults, options),
    };
  }

  const deferredResults = await runEffectBatch(deferredEffects, options);
  const results = [...commitResults, ...deferredResults];
  return {
    results,
    warnings: resolveEffectWarnings(results, options),
  };
}
