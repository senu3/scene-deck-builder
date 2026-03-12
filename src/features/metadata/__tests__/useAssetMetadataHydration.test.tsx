import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import type { Asset } from '../../../types';
import { useAssetMetadataHydration, type AssetMetadataHydrationStatus } from '../useAssetMetadataHydration';

const { act } = React;

vi.mock('../provider', () => ({
  readCanonicalAssetMetadataForPath: vi.fn(),
}));

type Snapshot = {
  asset: Asset | null | undefined;
  status: AssetMetadataHydrationStatus;
};

function HydrationProbe({
  asset,
  onSnapshot,
  cacheAsset,
}: {
  asset: Asset;
  onSnapshot: (snapshot: Snapshot) => void;
  cacheAsset: (asset: Asset) => void;
}) {
  const snapshot = useAssetMetadataHydration({
    asset,
    requirements: { dimensions: true, fileSize: true },
    cacheAsset,
    retryDelayMs: 10,
    maxAttempts: 2,
  });

  React.useEffect(() => {
    onSnapshot({
      asset: snapshot.asset
        ? {
            ...snapshot.asset,
            metadata: snapshot.asset.metadata ? { ...snapshot.asset.metadata } : undefined,
          }
        : snapshot.asset,
      status: snapshot.status,
    });
  }, [snapshot.asset, snapshot.status, onSnapshot]);

  return null;
}

describe('useAssetMetadataHydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries failed metadata reads and caches the recovered asset', async () => {
    const { readCanonicalAssetMetadataForPath } = await import('../provider');
    vi.mocked(readCanonicalAssetMetadataForPath)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        fileSize: 2048,
        metadata: {
          width: 1920,
          height: 1080,
        },
      });

    const snapshots: Snapshot[] = [];
    const cacheAsset = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <HydrationProbe
          asset={{
            id: 'image-1',
            name: 'image.png',
            path: '/vault/assets/image.png',
            type: 'image',
          }}
          cacheAsset={cacheAsset}
          onSnapshot={(snapshot) => snapshots.push(snapshot)}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const finalSnapshot = snapshots.at(-1);

    expect(vi.mocked(readCanonicalAssetMetadataForPath)).toHaveBeenCalledTimes(2);
    expect(snapshots.some((snapshot) => snapshot.status === 'loading')).toBe(true);
    expect(finalSnapshot?.status).toBe('idle');
    expect(finalSnapshot?.asset).toEqual(expect.objectContaining({
      id: 'image-1',
      fileSize: 2048,
      metadata: expect.objectContaining({
        width: 1920,
        height: 1080,
      }),
    }));
    expect(cacheAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: 'image-1',
      fileSize: 2048,
      metadata: expect.objectContaining({
        width: 1920,
        height: 1080,
      }),
    }));

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
