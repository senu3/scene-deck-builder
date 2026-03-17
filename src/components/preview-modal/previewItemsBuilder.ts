import type { Asset, Cut, Scene } from '../../types';
import { resolveAssetThumbnailSource } from '../../features/thumbnails/api';
import { computeCanonicalStoryTimingsForCuts, type CanonicalDurationSec } from '../../utils/storyTiming';
import { FALLBACK_CANONICAL_DURATION_SEC } from './constants';
import type { PreviewItem } from './types';

interface FocusCutData {
  scene: Scene;
  sceneIndex: number;
  cut: Cut;
  cutIndex: number;
}

interface BuildPreviewItemsInput {
  isSingleMode: boolean;
  isSingleModeVideo: boolean;
  isSingleModeImage: boolean;
  asset?: Asset;
  singleModeImageData: string | null;
  orderedScenes: Scene[];
  previewMode: 'scene' | 'all';
  selectedSceneId: string | null;
  getAsset: (assetId: string) => Asset | undefined;
  getDisplayTimeForAsset: (assetId: string) => number | null;
  focusCutData: FocusCutData | null;
  missingFocusedCut: boolean;
  sequenceCuts?: Cut[];
  sequenceContext?: { kind: 'scene'; sceneId: string; sceneName?: string };
  resolveAssetForCut: (cut: Cut | null | undefined) => Asset | null;
  resolveClipSnapshotThumbnail: (cut: Cut | null | undefined) => string | null;
  resolveCutDisplayTimeSec: (cut: Cut | null | undefined) => CanonicalDurationSec;
}

async function resolvePreviewThumbnail(
  cut: Cut,
  cutAsset: Asset | null,
  resolveClipSnapshotThumbnail: (cut: Cut | null | undefined) => string | null,
): Promise<string | null> {
  let thumbnail: string | null = resolveClipSnapshotThumbnail(cut) ?? null;

  if (cutAsset) {
    try {
      const resolved = await resolveAssetThumbnailSource('sequence-preview', cutAsset);
      if (resolved) thumbnail = resolved;
    } catch {
      // ignore
    }
  }

  return thumbnail;
}

export async function buildPreviewItems(input: BuildPreviewItemsInput): Promise<PreviewItem[]> {
  const {
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
  } = input;

  if (isSingleModeVideo) {
    return [];
  }

  if (isSingleModeImage && asset) {
    const displayTime = getDisplayTimeForAsset(asset.id);
    const singleCut: Cut = {
      id: `single-${asset.id}`,
      assetId: asset.id,
      asset,
      displayTime: displayTime ?? Number.NaN,
      order: 0,
    };
    const thumbnail = singleModeImageData ?? resolveClipSnapshotThumbnail(singleCut) ?? null;

    return [{
      cut: singleCut,
      sceneId: focusCutData?.scene.id || 'single',
      sceneName: asset.name ?? 'Single',
      sceneIndex: 0,
      cutIndex: 0,
      sceneStartAbs: 0,
      previewOffsetSec: 0,
      normalizedDisplayTime: resolveCutDisplayTimeSec(singleCut),
      thumbnail,
    }];
  }

  if (isSingleMode) return [];
  if (missingFocusedCut) return [];

  if (sequenceCuts) {
    const newItems: PreviewItem[] = [];
    const scopedSceneId = sequenceContext?.sceneId ?? 'sequence';
    const scopedSceneName = sequenceContext?.sceneName || 'Scene';
    const scopedTimings = computeCanonicalStoryTimingsForCuts(
      sequenceCuts.map((cut) => ({ cut, sceneId: scopedSceneId })),
      getAsset,
      { fallbackDurationSec: 1.0, preferAssetDuration: true }
    );
    for (let cIdx = 0; cIdx < sequenceCuts.length; cIdx++) {
      const cut = sequenceCuts[cIdx];
      const cutAsset = resolveAssetForCut(cut);
      const thumbnail = await resolvePreviewThumbnail(
        cut,
        cutAsset,
        resolveClipSnapshotThumbnail,
      );

      newItems.push({
        cut,
        sceneId: scopedSceneId,
        sceneName: scopedSceneName,
        sceneIndex: 0,
        cutIndex: cIdx,
        sceneStartAbs: 0,
        previewOffsetSec: 0,
        normalizedDisplayTime: scopedTimings.normalizedDurationByCutId.get(cut.id) ?? FALLBACK_CANONICAL_DURATION_SEC,
        thumbnail,
      });
    }

    return newItems;
  }

  if (focusCutData) {
    const { scene, sceneIndex, cut, cutIndex } = focusCutData;
    const focusTimings = computeCanonicalStoryTimingsForCuts(
      scene.cuts.map((item) => ({
        cut: item,
        sceneId: scene.id,
      })),
      getAsset,
      { fallbackDurationSec: 1.0, preferAssetDuration: true }
    );
    const sceneStartAbs = focusTimings.sceneTimings.get(scene.id)?.startSec ?? 0;
    const previewOffsetSec = Math.max(0, (focusTimings.cutTimings.get(cut.id)?.startSec ?? 0) - sceneStartAbs);
    const normalizedDisplayTime = focusTimings.normalizedDurationByCutId.get(cut.id) ?? FALLBACK_CANONICAL_DURATION_SEC;
    const cutAsset = resolveAssetForCut(cut);
    if (!cutAsset) {
      return [];
    }

    const thumbnail = await resolvePreviewThumbnail(
      cut,
      cutAsset,
      resolveClipSnapshotThumbnail,
    );

    return [{
      cut,
      sceneId: scene.id,
      sceneName: scene.name,
      sceneIndex,
      cutIndex,
      sceneStartAbs,
      previewOffsetSec,
      normalizedDisplayTime,
      thumbnail,
    }];
  }

  const newItems: PreviewItem[] = [];
  const scenesToPreview = previewMode === 'scene' && selectedSceneId
    ? orderedScenes.filter((s) => s.id === selectedSceneId)
    : orderedScenes;
  const timings = computeCanonicalStoryTimingsForCuts(
    scenesToPreview.flatMap((scene) =>
      scene.cuts.map((cut) => ({
        cut,
        sceneId: scene.id,
      }))
    ),
    getAsset,
    { fallbackDurationSec: 1.0, preferAssetDuration: true }
  );
  for (let sIdx = 0; sIdx < scenesToPreview.length; sIdx++) {
    const scene = scenesToPreview[sIdx];
    const sceneStartAbs = timings.sceneTimings.get(scene.id)?.startSec ?? 0;
    for (let cIdx = 0; cIdx < scene.cuts.length; cIdx++) {
      const cut = scene.cuts[cIdx];
      const cutAsset = resolveAssetForCut(cut);
      const thumbnail = await resolvePreviewThumbnail(
        cut,
        cutAsset,
        resolveClipSnapshotThumbnail,
      );

      newItems.push({
        cut,
        sceneId: scene.id,
        sceneName: scene.name,
        sceneIndex: sIdx,
        cutIndex: cIdx,
        sceneStartAbs,
        previewOffsetSec: 0,
        normalizedDisplayTime: timings.normalizedDurationByCutId.get(cut.id) ?? FALLBACK_CANONICAL_DURATION_SEC,
        thumbnail,
      });
    }
  }

  return newItems;
}
