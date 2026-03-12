import { useEffect, useMemo, useState } from 'react';
import type { Asset } from '../../types';
import {
  hasRequiredAssetMetadata,
  hydrateAssetWithCanonicalMetadata,
  needsAssetMetadataHydration,
  type AssetMetadataRequirements,
} from './assetHydration';

export type AssetMetadataHydrationStatus = 'idle' | 'loading' | 'error';

interface UseAssetMetadataHydrationInput {
  asset: Asset | null | undefined;
  requirements: AssetMetadataRequirements;
  cacheAsset?: (asset: Asset) => void;
  retryDelayMs?: number;
  maxAttempts?: number;
}

function buildRequirementKey(requirements: AssetMetadataRequirements): string {
  return [
    requirements.duration ? 'duration' : '',
    requirements.dimensions ? 'dimensions' : '',
    requirements.fileSize ? 'fileSize' : '',
  ].join('|');
}

export function useAssetMetadataHydration({
  asset,
  requirements,
  cacheAsset,
  retryDelayMs = 300,
  maxAttempts = 3,
}: UseAssetMetadataHydrationInput): {
  asset: Asset | null | undefined;
  status: AssetMetadataHydrationStatus;
} {
  const [resolvedAsset, setResolvedAsset] = useState<Asset | null | undefined>(asset);
  const [status, setStatus] = useState<AssetMetadataHydrationStatus>('idle');
  const requirementKey = useMemo(() => buildRequirementKey(requirements), [requirements]);

  useEffect(() => {
    setResolvedAsset(asset);

    if (!asset || !needsAssetMetadataHydration(asset, requirements)) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const runAttempt = async () => {
      if (cancelled) return;
      setStatus('loading');

      try {
        const hydrated = await hydrateAssetWithCanonicalMetadata(asset);
        if (cancelled) return;

        setResolvedAsset(hydrated);
        if (hydrated !== asset) {
          cacheAsset?.(hydrated);
        }

        if (hasRequiredAssetMetadata(hydrated, requirements)) {
          setStatus('idle');
          return;
        }
      } catch {
        // Retry below.
      }

      attempt += 1;
      if (attempt >= maxAttempts) {
        setStatus('error');
        return;
      }

      retryTimer = setTimeout(() => {
        void runAttempt();
      }, retryDelayMs * attempt);
    };

    void runAttempt();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    asset?.id,
    asset?.path,
    asset?.type,
    asset?.duration,
    asset?.fileSize,
    asset?.metadata?.width,
    asset?.metadata?.height,
    requirementKey,
    cacheAsset,
    retryDelayMs,
    maxAttempts,
  ]);

  return {
    asset: resolvedAsset,
    status,
  };
}
