import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Cut, MetadataStore, Scene } from '../../types';
import { AudioManager } from '../../utils/audioUtils';
import { resolvePreviewAudioTracks } from '../../utils/previewAudioTracks';
import { computeCanonicalStoryTimingsForCuts } from '../../utils/storyTiming';

interface UsePreviewSingleAttachedAudioInput {
  isSingleMode: boolean;
  isSingleModeVideo: boolean;
  hasCutContext: boolean;
  assetId: string | undefined;
  focusCut: Cut | null;
  focusScene: Scene | null;
  metadataStore: MetadataStore | null;
  getAsset: (assetId: string) => Asset | undefined;
  getAttachedAudioForCut: (cut: Cut | null | undefined) => Asset | undefined;
  getAudioOffsetForCut: (cut: Cut | null | undefined) => number;
  inPoint: number | null;
  outPoint: number | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  singleModeIsPlaying: boolean;
  sequenceIsPlaying: boolean;
  sequenceIsBuffering: boolean;
  getSequenceAbsoluteTime: () => number;
  globalMuted: boolean;
  globalVolume: number;
}

export function usePreviewSingleAttachedAudio({
  isSingleMode,
  isSingleModeVideo,
  hasCutContext,
  assetId,
  focusCut,
  focusScene,
  metadataStore,
  getAsset,
  getAttachedAudioForCut,
  getAudioOffsetForCut,
  inPoint,
  outPoint,
  videoRef,
  singleModeIsPlaying,
  sequenceIsPlaying,
  sequenceIsBuffering,
  getSequenceAbsoluteTime,
  globalMuted,
  globalVolume,
}: UsePreviewSingleAttachedAudioInput) {
  const singleAudioManagerRef = useRef(new AudioManager());
  const singleAudioPlayingRef = useRef(false);
  const [singleAudioLoaded, setSingleAudioLoaded] = useState(false);

  useEffect(() => {
    return () => {
      singleAudioManagerRef.current.unload();
    };
  }, []);

  const singleSceneAudioTrack = useMemo(() => {
    const sceneId = focusScene?.id ?? null;
    const previewOffsetSec = focusCut && focusScene
      ? (() => {
          const timings = computeCanonicalStoryTimingsForCuts(
            focusScene.cuts.map((item) => ({
              cut: item,
              sceneId: focusScene.id,
            })),
            getAsset,
            { fallbackDurationSec: 1.0, preferAssetDuration: true }
          );
          const cutTiming = timings.cutTimings.get(focusCut.id);
          const sceneTiming = timings.sceneTimings.get(focusScene.id);
          if (!cutTiming || !sceneTiming) return 0;
          return Math.max(0, cutTiming.startSec - sceneTiming.startSec);
        })()
      : 0;
    return resolvePreviewAudioTracks({
      sceneId,
      cuts: focusScene?.cuts || [],
      sceneStartAbs: 0,
      previewOffsetSec,
      metadataStore,
      getAssetById: getAsset,
    })[0] || null;
  }, [focusCut, focusScene, metadataStore, getAsset]);

  const getSingleModeSceneAudioPlayhead = useCallback((): number => {
    const absoluteTime = videoRef.current?.currentTime ?? 0;
    if (!isSingleModeVideo) {
      return absoluteTime;
    }
    const clipStart = inPoint !== null
      ? Math.min(inPoint, outPoint ?? inPoint)
      : 0;
    return Math.max(0, absoluteTime - clipStart);
  }, [videoRef, isSingleModeVideo, inPoint, outPoint]);

  useEffect(() => {
    if (!isSingleMode || !assetId) {
      singleAudioManagerRef.current.unload();
      setSingleAudioLoaded(false);
      singleAudioPlayingRef.current = false;
      return;
    }

    if (!hasCutContext) {
      singleAudioManagerRef.current.unload();
      setSingleAudioLoaded(false);
      singleAudioPlayingRef.current = false;
      return;
    }

    const attachedAudio = singleSceneAudioTrack?.asset || getAttachedAudioForCut(focusCut);
    singleAudioManagerRef.current.unload();
    setSingleAudioLoaded(false);
    singleAudioPlayingRef.current = false;

    if (!attachedAudio?.path) {
      return;
    }

    const manager = singleAudioManagerRef.current;
    if (manager.isDisposed()) return;

    const loadAudio = async () => {
      const offset = singleSceneAudioTrack ? 0 : getAudioOffsetForCut(focusCut);
      manager.setOffset(offset);
      const expectedLoadId = manager.getLoadId() + 1;
      const loaded = await manager.load(attachedAudio.path);
      if (!loaded) return;
      if (manager.getActiveLoadId() === expectedLoadId) {
        setSingleAudioLoaded(true);
      }
    };

    void loadAudio();
  }, [
    isSingleMode,
    assetId,
    hasCutContext,
    focusCut,
    getAttachedAudioForCut,
    getAudioOffsetForCut,
    singleSceneAudioTrack,
  ]);

  useEffect(() => {
    if (!isSingleMode || !singleAudioLoaded) return;
    const manager = singleAudioManagerRef.current;

    if (isSingleModeVideo) {
      if (singleModeIsPlaying) {
        const currentTime = getSingleModeSceneAudioPlayhead();
        const sceneStartOffset = singleSceneAudioTrack?.previewOffsetSec ?? 0;
        manager.play(currentTime + sceneStartOffset);
      } else {
        manager.pause();
      }
      singleAudioPlayingRef.current = singleModeIsPlaying;
      return;
    }

    if (sequenceIsPlaying && !sequenceIsBuffering) {
      if (!singleAudioPlayingRef.current) {
        const sceneStartOffset = singleSceneAudioTrack?.previewOffsetSec ?? 0;
        manager.play(Math.max(0, getSequenceAbsoluteTime() + sceneStartOffset));
        singleAudioPlayingRef.current = true;
      }
    } else if (singleAudioPlayingRef.current) {
      manager.pause();
      singleAudioPlayingRef.current = false;
    }
  }, [
    isSingleMode,
    singleAudioLoaded,
    isSingleModeVideo,
    singleModeIsPlaying,
    sequenceIsPlaying,
    sequenceIsBuffering,
    singleSceneAudioTrack,
    getSingleModeSceneAudioPlayhead,
    getSequenceAbsoluteTime,
  ]);

  useEffect(() => {
    singleAudioManagerRef.current.setVolume(globalMuted ? 0 : globalVolume);
  }, [globalVolume, globalMuted]);
}
