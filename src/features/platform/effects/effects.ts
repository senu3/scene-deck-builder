import type { DeleteAssetFileResult, RemoveAssetsFromIndexResult } from '../../metadata/provider';
import type { ThumbnailProfile } from '../../../utils/thumbnailCache';
import type { MetadataStore } from '../../../types';

export type ClipThumbnailRegenMode = 'clip' | 'clear';
export type AppEffectChannel = 'commit' | 'deferred';
export type AppEffectFailurePolicy = 'fail' | 'warn' | 'retryable';

export interface RegenThumbnailsRequest {
  sceneId: string;
  cutId: string;
  assetPath: string;
  mode: ClipThumbnailRegenMode;
  inPointSec: number;
  outPointSec?: number;
}

interface AppEffectBase {
  channel: AppEffectChannel;
  orderingKey: string;
  idempotent: boolean;
  coalescible: boolean;
  failurePolicy: AppEffectFailurePolicy;
}

export type AppEffect =
  | (AppEffectBase & {
      type: 'FILES_DELETE';
      payload: {
        assetPath: string;
        trashPath: string;
        assetIds: string[];
        reason?: string;
      };
    })
  | (AppEffectBase & {
      type: 'INDEX_UPDATE';
      payload: {
        vaultPath: string;
        assetIds: string[];
      };
    })
  | (AppEffectBase & {
      type: 'METADATA_DELETE';
      payload: {
        assetIds: string[];
      };
    })
  | (AppEffectBase & {
      type: 'SAVE_METADATA';
      payload: {
        vaultPath: string;
        store: MetadataStore;
      };
    })
  | (AppEffectBase & {
      type: 'REGEN_THUMBNAILS';
      payload: {
        profile: ThumbnailProfile;
        cutIds: string[];
        reason: string;
        requests: RegenThumbnailsRequest[];
      };
    });

export type EffectSuccessResult = {
  effect: AppEffect;
  success: true;
};

export type EffectFailureResult = {
  effect: AppEffect;
  success: false;
  reason: string;
};

export type EffectRunResult = EffectSuccessResult | EffectFailureResult;

export interface EffectRunnerDeps {
  deleteAssetFile: (input: {
    assetPath: string;
    trashPath: string;
    assetIds: string[];
    reason?: string;
  }) => Promise<DeleteAssetFileResult>;
  removeAssetsFromIndex: (input: {
    vaultPath: string;
    assetIds: string[];
  }) => Promise<RemoveAssetsFromIndexResult>;
  deleteMetadata: (assetIds: string[]) => void | Promise<void>;
  saveMetadata: (input: {
    vaultPath: string;
    store: MetadataStore;
  }) => Promise<boolean>;
  requestThumbnailRegeneration?: (input: {
    profile: ThumbnailProfile;
    cutIds: string[];
    reason: string;
    requests: RegenThumbnailsRequest[];
  }) => void | Promise<void>;
}

export interface AppEffectWarning {
  code: 'effect-failed';
  effectType: AppEffect['type'];
  reason: string;
  message: string;
  commandId?: string;
  commandType?: string;
}

export function createFilesDeleteEffect(payload: {
  assetPath: string;
  trashPath: string;
  assetIds: string[];
  reason?: string;
}): Extract<AppEffect, { type: 'FILES_DELETE' }> {
  return {
    type: 'FILES_DELETE',
    payload,
    channel: 'commit',
    orderingKey: 'vault-files',
    idempotent: false,
    coalescible: false,
    failurePolicy: 'fail',
  };
}

export function createIndexUpdateEffect(payload: {
  vaultPath: string;
  assetIds: string[];
}): Extract<AppEffect, { type: 'INDEX_UPDATE' }> {
  return {
    type: 'INDEX_UPDATE',
    payload,
    channel: 'commit',
    orderingKey: 'vault-index',
    idempotent: true,
    coalescible: false,
    failurePolicy: 'warn',
  };
}

export function createMetadataDeleteEffect(payload: {
  assetIds: string[];
}): Extract<AppEffect, { type: 'METADATA_DELETE' }> {
  return {
    type: 'METADATA_DELETE',
    payload,
    channel: 'commit',
    orderingKey: 'vault-metadata',
    idempotent: true,
    coalescible: false,
    failurePolicy: 'warn',
  };
}

export function createSaveMetadataEffect(payload: {
  vaultPath: string;
  store: MetadataStore;
}): Extract<AppEffect, { type: 'SAVE_METADATA' }> {
  return {
    type: 'SAVE_METADATA',
    payload,
    channel: 'commit',
    orderingKey: 'vault-metadata',
    idempotent: true,
    coalescible: true,
    failurePolicy: 'warn',
  };
}

export function createRegenThumbnailsEffect(payload: {
  profile: ThumbnailProfile;
  cutIds: string[];
  reason: string;
  requests: RegenThumbnailsRequest[];
}): Extract<AppEffect, { type: 'REGEN_THUMBNAILS' }> {
  return {
    type: 'REGEN_THUMBNAILS',
    payload,
    channel: 'deferred',
    orderingKey: `thumbnail:${payload.profile}`,
    idempotent: true,
    coalescible: true,
    failurePolicy: 'warn',
  };
}
