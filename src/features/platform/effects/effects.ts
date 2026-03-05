import type { DeleteAssetFileResult, RemoveAssetsFromIndexResult } from '../../metadata/provider';

export type DeleteEffects =
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
    };

export type EffectSuccessResult = {
  effect: DeleteEffects;
  success: true;
};

export type EffectFailureResult = {
  effect: DeleteEffects;
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
}
