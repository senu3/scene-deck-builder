import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Asset, Cut, MetadataStore, Scene } from '../../types';
import { resolveCutThumbnailFromCache } from '../../features/thumbnails/api';
import { resolveCutAsset } from '../../utils/assetResolve';
import {
  asCanonicalDurationSec,
  resolveCanonicalCutDuration,
  type CanonicalDurationSec,
} from '../../utils/storyTiming';
import { buildPreviewItems } from './previewItemsBuilder';
import type { PreviewItem } from './types';

interface FocusCutData {
  scene: Scene;
  sceneIndex: number;
  cut: Cut;
  cutIndex: number;
}

interface UsePreviewItemsStateInput {
  isSingleMode: boolean;
  isSingleModeVideo: boolean;
  isSingleModeImage: boolean;
  asset: Asset | undefined;
  singleModeImageData: string | null;
  orderedScenes: Scene[];
  previewMode: 'all' | 'scene';
  selectedSceneId: string | null;
  getAsset: (assetId: string) => Asset | undefined;
  metadataStore: MetadataStore | null;
  focusCutData: FocusCutData | null;
  missingFocusedCut: boolean;
  sequenceCuts?: Cut[];
  sequenceContext?: { kind: 'scene'; sceneId: string; sceneName?: string };
}

export function usePreviewItemsState({
  isSingleMode,
  isSingleModeVideo,
  isSingleModeImage,
  asset,
  singleModeImageData,
  orderedScenes,
  previewMode,
  selectedSceneId,
  getAsset,
  metadataStore,
  focusCutData,
  missingFocusedCut,
  sequenceCuts,
  sequenceContext,
}: UsePreviewItemsStateInput) {
  const [items, setItems] = useState<PreviewItem[]>([]);

  const resolveAssetForCut = useCallback((cut: Cut | null | undefined): Asset | null => {
    return resolveCutAsset(cut, getAsset);
  }, [getAsset]);

  const resolveClipSnapshotThumbnail = useCallback((cut: Cut | null | undefined): string | null => {
    if (!cut?.isClip) return null;
    const asset = resolveCutAsset(cut, getAsset);
    return resolveCutThumbnailFromCache('sequence-preview', {
      cutId: cut.id,
      kind: 'clip',
      assetId: asset?.id ?? cut.assetId,
      assetPath: asset?.path,
      assetType: asset?.type,
      inPointSec: cut.inPoint,
      outPointSec: cut.outPoint,
    });
  }, [getAsset]);

  const resolveCutDisplayTimeSec = useCallback((cut: Cut | null | undefined): CanonicalDurationSec => {
    const resolved = resolveCanonicalCutDuration(cut, getAsset, {
      fallbackDurationSec: 1.0,
      preferAssetDuration: true,
    });
    return asCanonicalDurationSec(resolved.durationSec);
  }, [getAsset]);

  const getDisplayTimeForAsset = useCallback((assetId: string): number | null => {
    if (!metadataStore) return null;
    const metadata = metadataStore.metadata[assetId];
    const displayTime = metadata?.displayTime;
    if (typeof displayTime !== 'number' || !Number.isFinite(displayTime) || displayTime <= 0) {
      return null;
    }
    return displayTime;
  }, [metadataStore]);

  useEffect(() => {
    let cancelled = false;
    void buildPreviewItems({
      isSingleMode,
      isSingleModeVideo,
      isSingleModeImage,
      asset,
      singleModeImageData,
      orderedScenes,
      previewMode,
      selectedSceneId,
      getAsset,
      getDisplayTimeForAsset,
      focusCutData,
      missingFocusedCut,
      sequenceCuts,
      sequenceContext,
      resolveAssetForCut,
      resolveClipSnapshotThumbnail,
      resolveCutDisplayTimeSec,
    }).then((nextItems) => {
      if (cancelled) return;
      setItems(nextItems);
    });
    return () => {
      cancelled = true;
    };
  }, [
    isSingleMode,
    isSingleModeVideo,
    isSingleModeImage,
    asset,
    singleModeImageData,
    orderedScenes,
    previewMode,
    selectedSceneId,
    getAsset,
    getDisplayTimeForAsset,
    focusCutData,
    missingFocusedCut,
    sequenceCuts,
    sequenceContext,
    resolveAssetForCut,
    resolveClipSnapshotThumbnail,
    resolveCutDisplayTimeSec,
  ]);

  const sequenceDurations = useMemo(() => items.map(item => item.normalizedDisplayTime), [items]);

  return {
    items,
    sequenceDurations,
    resolveAssetForCut,
  };
}
