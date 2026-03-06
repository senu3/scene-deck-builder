import type { DeleteAssetFileResult, RemoveAssetsFromIndexResult } from '../../metadata/provider';
import type { ThumbnailProfile } from '../../../utils/thumbnailCache';

export type ClipThumbnailRegenMode = 'clip' | 'clear';

export interface RegenThumbnailsRequest {
  sceneId: string;
  cutId: string;
  assetPath: string;
  mode: ClipThumbnailRegenMode;
  inPointSec: number;
  outPointSec?: number;
}

export type AppEffect =
  | {
      type: 'FILES_DELETE';
      payload: {
        assetPath: string;
        trashPath: string;
        assetIds: string[];
        reason?: string;
      };
    }
  | {
      type: 'INDEX_UPDATE';
      payload: {
        vaultPath: string;
        assetIds: string[];
      };
    }
  | {
      type: 'METADATA_DELETE';
      payload: {
        assetIds: string[];
      };
    }
  | {
      type: 'REGEN_THUMBNAILS';
      payload: {
        profile: ThumbnailProfile;
        cutIds: string[];
        reason: string;
        requests: RegenThumbnailsRequest[];
      };
    };

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
  requestThumbnailRegeneration?: (input: {
    profile: ThumbnailProfile;
    cutIds: string[];
    reason: string;
    requests: RegenThumbnailsRequest[];
  }) => void | Promise<void>;
}
