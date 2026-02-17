import type { MetadataStore, Scene } from '../types';
import { resolveCutAssetId } from './assetResolve';

export type AssetRefKind =
  | 'cut'
  | 'cut-audio-binding'
  | 'scene-audio'
  | 'lipsync-base'
  | 'lipsync-variant'
  | 'lipsync-mask'
  | 'lipsync-composited'
  | 'lipsync-rms-audio'
  | 'lipsync-source-video';

export interface AssetRef {
  assetId: string;
  kind: AssetRefKind;
  ownerAssetId?: string;
  sceneId?: string;
  cutId?: string;
}

export type AssetRefMap = Map<string, AssetRef[]>;

function pushRef(map: AssetRefMap, ref: AssetRef) {
  const existing = map.get(ref.assetId);
  if (existing) {
    existing.push(ref);
  } else {
    map.set(ref.assetId, [ref]);
  }
}

export function collectAssetRefs(scenes: Scene[], metadataStore: MetadataStore | null): AssetRefMap {
  const refs: AssetRefMap = new Map();

  for (const scene of scenes) {
    for (const cut of scene.cuts) {
      const cutAssetId = resolveCutAssetId(cut, () => undefined);
      if (!cutAssetId) continue;
      pushRef(refs, {
        assetId: cutAssetId,
        kind: 'cut',
        sceneId: scene.id,
        cutId: cut.id,
      });

      for (const binding of cut.audioBindings || []) {
        if (!binding.audioAssetId) continue;
        pushRef(refs, {
          assetId: binding.audioAssetId,
          kind: 'cut-audio-binding',
          sceneId: scene.id,
          cutId: cut.id,
        });
      }
    }
  }

  collectAudioAssetRefs(refs, metadataStore);
  if (!metadataStore) return refs;

  for (const [ownerAssetId, meta] of Object.entries(metadataStore.metadata)) {
    const lipSync = meta.lipSync;
    if (!lipSync) continue;

    pushRef(refs, {
      assetId: lipSync.baseImageAssetId,
      kind: 'lipsync-base',
      ownerAssetId,
    });

    for (const variantId of lipSync.variantAssetIds || []) {
      pushRef(refs, {
        assetId: variantId,
        kind: 'lipsync-variant',
        ownerAssetId,
      });
    }

    for (const compositedId of lipSync.compositedFrameAssetIds || []) {
      pushRef(refs, {
        assetId: compositedId,
        kind: 'lipsync-composited',
        ownerAssetId,
      });
    }

    if (lipSync.maskAssetId) {
      pushRef(refs, {
        assetId: lipSync.maskAssetId,
        kind: 'lipsync-mask',
        ownerAssetId,
      });
    }

    pushRef(refs, {
      assetId: lipSync.rmsSourceAudioAssetId,
      kind: 'lipsync-rms-audio',
      ownerAssetId,
    });

    if (lipSync.sourceVideoAssetId) {
      pushRef(refs, {
        assetId: lipSync.sourceVideoAssetId,
        kind: 'lipsync-source-video',
        ownerAssetId,
      });
    }
  }

  return refs;
}

export function collectAudioAssetRefs(refs: AssetRefMap, metadataStore: MetadataStore | null): void {
  if (!metadataStore?.sceneMetadata) return;

  for (const [sceneId, sceneMeta] of Object.entries(metadataStore.sceneMetadata)) {
    const binding = sceneMeta?.attachAudio;
    if (!binding?.audioAssetId || binding.enabled === false) continue;
    pushRef(refs, {
      assetId: binding.audioAssetId,
      kind: 'scene-audio',
      sceneId,
    });
  }
}

export function getBlockingRefsForAssetIds(
  refs: AssetRefMap,
  targetAssetIds: string[]
): AssetRef[] {
  const targetSet = new Set(targetAssetIds.filter(Boolean));
  if (targetSet.size === 0) return [];

  const blocking: AssetRef[] = [];
  for (const assetId of targetSet) {
    const assetRefs = refs.get(assetId) || [];
    blocking.push(...assetRefs);
  }
  return blocking;
}

export function findDanglingAssetRefs(
  refs: AssetRefMap,
  existingAssetIds: Set<string>
): AssetRef[] {
  const dangling: AssetRef[] = [];
  for (const [assetId, assetRefs] of refs.entries()) {
    if (existingAssetIds.has(assetId)) continue;
    dangling.push(...assetRefs);
  }
  return dangling;
}
