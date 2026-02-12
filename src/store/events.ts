export type StoreEvent =
  | {
      type: 'CUT_DELETED';
      sceneId: string;
      cutId: string;
      assetId?: string;
      occurredAt: string;
    };
