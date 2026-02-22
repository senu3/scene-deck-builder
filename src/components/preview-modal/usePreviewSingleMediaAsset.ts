import { useEffect, useState } from 'react';
import type { Asset } from '../../types';
import { createVideoObjectUrl } from '../../utils/videoUtils';
import { getAssetThumbnail } from '../../features/thumbnails/api';

interface VideoObjectUrlState {
  assetId: string;
  url: string;
}

interface UsePreviewSingleMediaAssetInput {
  isSingleMode: boolean;
  asset: Asset | undefined;
  videoObjectUrl: VideoObjectUrlState | null;
  setVideoObjectUrl: (next: VideoObjectUrlState | null) => void;
  revokeIfBlob: (url: string) => void;
}

export function usePreviewSingleMediaAsset({
  isSingleMode,
  asset,
  videoObjectUrl,
  setVideoObjectUrl,
  revokeIfBlob,
}: UsePreviewSingleMediaAssetInput) {
  const [isLoading, setIsLoading] = useState(isSingleMode);
  const [singleModeImageData, setSingleModeImageData] = useState<string | null>(null);

  useEffect(() => {
    if (!isSingleMode || !asset?.path) return;

    let isMounted = true;

    const loadAsset = async () => {
      setIsLoading(true);

      if (asset.type === 'video') {
        const url = await createVideoObjectUrl(asset.path);
        if (isMounted && url) {
          setVideoObjectUrl({ assetId: asset.id, url });
        }
      } else if (asset.type === 'image') {
        try {
          const previewImage = await getAssetThumbnail('sequence-preview', {
            assetId: asset.id,
            path: asset.path,
            type: 'image',
          });
          if (isMounted && previewImage) {
            setSingleModeImageData(previewImage);
          }
        } catch {
          // Failed to load image preview
        }
      }

      setIsLoading(false);
    };

    void loadAsset();

    return () => {
      isMounted = false;
    };
  }, [isSingleMode, asset?.id, asset?.path, asset?.type, setVideoObjectUrl]);

  useEffect(() => {
    if (!isSingleMode) return;

    return () => {
      if (videoObjectUrl?.url) {
        revokeIfBlob(videoObjectUrl.url);
      }
    };
  }, [isSingleMode, videoObjectUrl, revokeIfBlob]);

  return {
    isLoading,
    singleModeImageData,
  };
}
