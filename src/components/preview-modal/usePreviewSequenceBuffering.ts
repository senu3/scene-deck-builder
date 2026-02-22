import { useCallback, useEffect, useRef } from 'react';
import { createVideoObjectUrl } from '../../utils/videoUtils';
import type { Asset } from '../../types';
import type { PreviewItem } from './types';

interface VideoObjectUrlState {
  assetId: string;
  url: string;
}

interface UsePreviewSequenceBufferingInput {
  isSingleMode: boolean;
  items: PreviewItem[];
  currentIndex: number;
  videoObjectUrl: VideoObjectUrlState | null;
  setVideoObjectUrl: (next: VideoObjectUrlState | null) => void;
  resolveAssetForCut: (cut: PreviewItem['cut']) => Asset | null;
  setSequenceBuffering: (isBuffering: boolean) => void;
  sequenceIsPlaying: boolean;
  sequenceIsBuffering: boolean;
  initialPreloadItems: number;
  playSafeAhead: number;
  preloadAhead: number;
  revokeIfBlob: (url: string) => void;
}

export function usePreviewSequenceBuffering({
  isSingleMode,
  items,
  currentIndex,
  videoObjectUrl,
  setVideoObjectUrl,
  resolveAssetForCut,
  setSequenceBuffering,
  sequenceIsPlaying,
  sequenceIsBuffering,
  initialPreloadItems,
  playSafeAhead,
  preloadAhead,
  revokeIfBlob,
}: UsePreviewSequenceBufferingInput) {
  const videoUrlCacheRef = useRef<Map<string, string>>(new Map());
  const readyItemsRef = useRef<Set<string>>(new Set());
  const preloadingRef = useRef<Set<string>>(new Set());

  const getVideoAssetId = useCallback((index: number): string | null => {
    const item = items[index];
    if (!item) return null;
    const cutAsset = resolveAssetForCut(item.cut);
    if (cutAsset?.type !== 'video') return null;
    return cutAsset.id ?? item.cut.assetId ?? null;
  }, [items, resolveAssetForCut]);

  const getItemsInTimeWindow = useCallback((startIndex: number, windowSeconds: number): number[] => {
    const indices: number[] = [];
    let accumulatedTime = 0;

    for (let i = startIndex; i < items.length && accumulatedTime < windowSeconds; i++) {
      indices.push(i);
      accumulatedTime += items[i].normalizedDisplayTime;
    }

    return indices;
  }, [items]);

  const isItemReady = useCallback((index: number): boolean => {
    const item = items[index];
    if (!item) return false;

    const cutAsset = resolveAssetForCut(item.cut);
    if (cutAsset?.type === 'video') {
      const assetId = getVideoAssetId(index);
      if (!assetId) return false;
      return videoUrlCacheRef.current.has(assetId);
    }
    return !!item.thumbnail;
  }, [items, getVideoAssetId, resolveAssetForCut]);

  const preloadItems = useCallback(async (indices: number[]): Promise<void> => {
    const preloadPromises: Promise<void>[] = [];

    for (const index of indices) {
      const item = items[index];
      if (!item) continue;

      const cutAsset = resolveAssetForCut(item.cut);
      if (cutAsset?.type === 'video' && cutAsset.path) {
        const assetId = getVideoAssetId(index);
        if (!assetId) continue;

        if (readyItemsRef.current.has(assetId) || preloadingRef.current.has(assetId)) continue;

        if (!videoUrlCacheRef.current.has(assetId)) {
          preloadingRef.current.add(assetId);
          preloadPromises.push(
            createVideoObjectUrl(cutAsset.path).then(url => {
              if (url) {
                videoUrlCacheRef.current.set(assetId, url);
                readyItemsRef.current.add(assetId);
              }
              preloadingRef.current.delete(assetId);
            })
          );
        } else {
          readyItemsRef.current.add(assetId);
        }
      } else {
        const assetId = cutAsset?.id ?? item.cut.assetId;
        if (assetId) {
          readyItemsRef.current.add(assetId);
        }
      }
    }

    await Promise.all(preloadPromises);
  }, [items, getVideoAssetId, resolveAssetForCut]);

  const checkBufferStatus = useCallback((): { ready: boolean; neededItems: number[] } => {
    if (items.length === 0) return { ready: true, neededItems: [] };

    const neededItems = getItemsInTimeWindow(currentIndex, playSafeAhead);
    const allReady = neededItems.every(idx => isItemReady(idx));

    return { ready: allReady, neededItems };
  }, [items, currentIndex, playSafeAhead, getItemsInTimeWindow, isItemReady]);

  const cleanupOldUrls = useCallback((keepFromIndex: number) => {
    const keepBackWindow = 5;
    const keepStart = Math.max(0, keepFromIndex - keepBackWindow);

    const keepAssetIds = new Set<string>();
    for (let i = keepStart; i < items.length; i++) {
      const assetId = getVideoAssetId(i);
      if (assetId) {
        keepAssetIds.add(assetId);
      }
    }

    for (const [assetId, url] of videoUrlCacheRef.current) {
      if (!keepAssetIds.has(assetId)) {
        revokeIfBlob(url);
        videoUrlCacheRef.current.delete(assetId);
        readyItemsRef.current.delete(assetId);
        preloadingRef.current.delete(assetId);
      }
    }
  }, [items, getVideoAssetId, revokeIfBlob]);

  useEffect(() => {
    if (isSingleMode) return;

    const activeAssetIds = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const assetId = getVideoAssetId(i);
      if (assetId) {
        activeAssetIds.add(assetId);
      }
    }

    for (const [assetId, url] of videoUrlCacheRef.current) {
      if (!activeAssetIds.has(assetId)) {
        revokeIfBlob(url);
        videoUrlCacheRef.current.delete(assetId);
        readyItemsRef.current.delete(assetId);
        preloadingRef.current.delete(assetId);
      }
    }
  }, [isSingleMode, items, getVideoAssetId, revokeIfBlob]);

  useEffect(() => {
    if (isSingleMode || items.length === 0) return;

    const initialPreload = async () => {
      const initialItems: number[] = [];
      for (let i = 0; i < Math.min(initialPreloadItems, items.length); i++) {
        initialItems.push(i);
      }
      await preloadItems(initialItems);

      const timeWindowItems = getItemsInTimeWindow(0, preloadAhead);
      await preloadItems(timeWindowItems);
    };

    initialPreload();
  }, [isSingleMode, items, initialPreloadItems, preloadAhead, preloadItems, getItemsInTimeWindow]);

  useEffect(() => {
    if (isSingleMode || items.length === 0) return;

    const manageBuffer = async () => {
      const itemsToPreload = getItemsInTimeWindow(currentIndex, preloadAhead);
      preloadItems(itemsToPreload);

      const currentItem = items[currentIndex];
      const assetId = getVideoAssetId(currentIndex);
      const cachedUrl = assetId ? videoUrlCacheRef.current.get(assetId) : undefined;
      const currentAsset = currentItem ? resolveAssetForCut(currentItem.cut) : undefined;

      if (currentAsset?.type === 'video') {
        if (cachedUrl && assetId && (!videoObjectUrl || videoObjectUrl.assetId !== assetId || videoObjectUrl.url !== cachedUrl)) {
          setVideoObjectUrl({ assetId, url: cachedUrl });
        } else if (!cachedUrl && currentAsset.path && assetId) {
          const url = await createVideoObjectUrl(currentAsset.path);
          if (url) {
            videoUrlCacheRef.current.set(assetId, url);
            readyItemsRef.current.add(assetId);
            setVideoObjectUrl({ assetId, url });
          }
        }
      } else {
        setVideoObjectUrl(null);
      }

      const { ready } = checkBufferStatus();
      const currentReady = isItemReady(currentIndex);
      if (sequenceIsPlaying && !ready && !sequenceIsBuffering) {
        if (!currentReady) {
          setSequenceBuffering(true);
        }
      } else if (sequenceIsPlaying && (ready || currentReady) && sequenceIsBuffering) {
        setSequenceBuffering(false);
      }

      cleanupOldUrls(currentIndex);
    };

    manageBuffer();
  }, [
    isSingleMode,
    items,
    currentIndex,
    videoObjectUrl,
    preloadAhead,
    getItemsInTimeWindow,
    preloadItems,
    cleanupOldUrls,
    getVideoAssetId,
    checkBufferStatus,
    isItemReady,
    resolveAssetForCut,
    sequenceIsPlaying,
    sequenceIsBuffering,
    setSequenceBuffering,
    setVideoObjectUrl,
  ]);

  useEffect(() => {
    if (isSingleMode) return;

    return () => {
      for (const url of videoUrlCacheRef.current.values()) {
        revokeIfBlob(url);
      }
      videoUrlCacheRef.current.clear();
    };
  }, [isSingleMode, revokeIfBlob]);

  return { checkBufferStatus };
}
