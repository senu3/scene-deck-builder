export type StoreEventOrigin = 'user' | 'undo' | 'redo' | 'recovery' | 'import';
export type StoreEventSubscriberName = 'ui' | 'preview-cache' | 'telemetry';

export interface StoreEventOperationContext {
  origin: StoreEventOrigin;
  opId: string;
}

export interface StoreEventSubscriber {
  name: StoreEventSubscriberName;
  onEvent: (event: StoreEvent) => void;
}

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
      origin: StoreEventOrigin;
      opId: string;
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
      origin?: StoreEventOrigin;
      opId?: string;
    };
