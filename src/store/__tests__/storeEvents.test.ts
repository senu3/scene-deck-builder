import { beforeEach, describe, expect, it } from 'vitest';
import type { Command } from '../historyStore';
import { useHistoryStore } from '../historyStore';
import { useStore } from '../useStore';
import { resetElectronMocks } from '../../test/setup.renderer';

const OLD_ASSET = {
  id: 'asset-old',
  name: 'old.png',
  path: 'C:/vault/assets/old.png',
  type: 'image' as const,
};

const NEW_ASSET = {
  id: 'asset-new',
  name: 'new.png',
  path: 'C:/vault/assets/new.png',
  type: 'image' as const,
};

function seedRelinkState() {
  const initial = useStore.getState();
  useStore.setState(
    {
      ...initial,
      scenes: [
        {
          id: 'scene-1',
          name: 'Scene 1',
          order: 0,
          notes: [],
          cuts: [
            {
              id: 'cut-1',
              assetId: OLD_ASSET.id,
              displayTime: 1,
              order: 0,
              useEmbeddedAudio: true,
              audioBindings: [],
              asset: OLD_ASSET,
            },
          ],
        },
      ],
      assetCache: new Map([
        [OLD_ASSET.id, OLD_ASSET],
        [NEW_ASSET.id, NEW_ASSET],
      ]),
      metadataStore: { version: 1, metadata: {}, sceneMetadata: {} },
      storeEvents: [],
    },
    false
  );
  return initial;
}

describe('store events', () => {
  beforeEach(() => {
    resetElectronMocks();
    useHistoryStore.getState().clear();
  });

  it('emits CUT_RELINKED with origin/opId via operation context', async () => {
    const initial = seedRelinkState();
    const events: any[] = [];
    const unsubscribe = useStore.getState().registerStoreEventSubscriber({
      name: 'telemetry',
      onEvent: (event) => events.push(event),
    });

    const op = useStore.getState().createStoreEventOperation('user', 'op-user-1');
    await useStore.getState().runWithStoreEventContext(op, () => {
      useStore.getState().relinkCutAsset('scene-1', 'cut-1', NEW_ASSET);
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'CUT_RELINKED',
      sceneId: 'scene-1',
      cutId: 'cut-1',
      previousAssetId: OLD_ASSET.id,
      nextAssetId: NEW_ASSET.id,
      origin: 'user',
      opId: 'op-user-1',
    });

    unsubscribe();
    useStore.setState(initial, true);
  });

  it('propagates origin as user/undo/redo through history executor context', async () => {
    const initial = seedRelinkState();
    const relinkEvents: Array<{ origin: string; opId: string }> = [];
    const unsubscribe = useStore.getState().registerStoreEventSubscriber({
      name: 'telemetry',
      onEvent: (event) => {
        if (event.type === 'CUT_RELINKED') {
          relinkEvents.push({ origin: event.origin, opId: event.opId });
        }
      },
    });

    const relinkCommand: Command = {
      type: 'relink',
      description: 'relink cut asset',
      execute: () => {
        useStore.getState().relinkCutAsset('scene-1', 'cut-1', NEW_ASSET);
      },
      undo: () => {
        useStore.getState().relinkCutAsset('scene-1', 'cut-1', OLD_ASSET);
      },
    };

    await useHistoryStore.getState().executeCommand(relinkCommand);
    await useHistoryStore.getState().undo();
    await useHistoryStore.getState().redo();

    expect(relinkEvents).toHaveLength(3);
    expect(relinkEvents[0]?.origin).toBe('user');
    expect(relinkEvents[1]?.origin).toBe('undo');
    expect(relinkEvents[2]?.origin).toBe('redo');
    expect(new Set(relinkEvents.map((event) => event.opId)).size).toBe(3);

    unsubscribe();
    useStore.setState(initial, true);
  });

  it('rejects allowlist外 subscriber name', () => {
    expect(() =>
      useStore.getState().registerStoreEventSubscriber({
        name: 'unknown' as any,
        onEvent: () => undefined,
      })
    ).toThrow(/Unsupported store event subscriber/);
  });
});
