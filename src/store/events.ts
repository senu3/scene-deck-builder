export type StoreEvent =
  | {
      type: 'CUT_DELETED';
      sceneId: string;
      cutId: string;
      assetId?: string;
      occurredAt: string;
    }
  | {
      type: 'CUT_MOVED';
      fromSceneId: string;
      toSceneId: string;
      cutIds: string[];
      occurredAt: string;
    }
  | {
      type: 'CUT_RELINKED';
      sceneId: string;
      cutId: string;
      previousAssetId?: string;
      nextAssetId: string;
      occurredAt: string;
    };

export type StoreEventInput =
  | {
      type: 'CUT_DELETED';
      sceneId: string;
      cutId: string;
      assetId?: string;
    }
  | {
      type: 'CUT_MOVED';
      fromSceneId: string;
      toSceneId: string;
      cutIds: string[];
    }
  | {
      type: 'CUT_RELINKED';
      sceneId: string;
      cutId: string;
      previousAssetId?: string;
      nextAssetId: string;
    };
