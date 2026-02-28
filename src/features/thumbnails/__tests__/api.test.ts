import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedThumbnail, getThumbnail, removeThumbnailCache } from '../../../utils/thumbnailCache';
import {
  buildAssetThumbnailKey,
  buildCutClipFingerprint,
  buildCutDerivedThumbnailKey,
  getCachedAssetThumbnail,
  getAssetThumbnail,
  getCutClipThumbnail,
  getCutDerivedThumbnail,
  resolveAssetThumbnailFromCache,
  resolveAssetThumbnailSource,
  removeAssetThumbnail,
} from '../api';

vi.mock('../../../utils/thumbnailCache', () => ({
  getCachedThumbnail: vi.fn(),
  getThumbnail: vi.fn(),
  removeThumbnailCache: vi.fn(),
}));

describe('thumbnails api key strategy', () => {
  beforeEach(() => {
    vi.mocked(getCachedThumbnail).mockReset();
    vi.mocked(getThumbnail).mockReset();
    vi.mocked(removeThumbnailCache).mockReset();
    vi.mocked(getCachedThumbnail).mockReturnValue('cached-thumb');
    vi.mocked(getThumbnail).mockResolvedValue('thumb');
  });

  it('returns stable asset key for same input', () => {
    const a = buildAssetThumbnailKey({
      assetId: 'asset-1',
      path: '/vault/assets/a.mp4',
      profile: 'timeline-card',
      timeOffset: 1.25,
    });
    const b = buildAssetThumbnailKey({
      assetId: 'asset-1',
      path: '/vault/assets/a.mp4',
      profile: 'timeline-card',
      timeOffset: 1.25,
    });
    expect(a).toBe(b);
  });

  it('changes asset key when profile changes', () => {
    const timeline = buildAssetThumbnailKey({
      assetId: 'asset-1',
      path: '/vault/assets/a.mp4',
      profile: 'timeline-card',
      timeOffset: 0,
    });
    const details = buildAssetThumbnailKey({
      assetId: 'asset-1',
      path: '/vault/assets/a.mp4',
      profile: 'details-panel',
      timeOffset: 0,
    });
    expect(timeline).not.toBe(details);
  });

  it('treats clip as one cut-derived kind and changes key when range changes', () => {
    const keyA = buildCutDerivedThumbnailKey({
      kind: 'clip',
      cutId: 'cut-1',
      fingerprint: buildCutClipFingerprint(1, 2),
      profile: 'timeline-card',
    });
    const keyB = buildCutDerivedThumbnailKey({
      kind: 'clip',
      cutId: 'cut-1',
      fingerprint: buildCutClipFingerprint(1, 3),
      profile: 'timeline-card',
    });
    expect(keyA).not.toBe(keyB);
  });

  it('separates namespace between asset and cut-derived clip', () => {
    const assetKey = buildAssetThumbnailKey({
      assetId: 'asset-1',
      path: '/vault/assets/a.mp4',
      profile: 'timeline-card',
      timeOffset: 1,
    });
    const cutDerivedKey = buildCutDerivedThumbnailKey({
      kind: 'clip',
      cutId: 'cut-1',
      fingerprint: buildCutClipFingerprint(1, 2),
      profile: 'timeline-card',
    });
    expect(assetKey.startsWith('asset:')).toBe(true);
    expect(cutDerivedKey.startsWith('cut:clip:')).toBe(true);
    expect(assetKey).not.toBe(cutDerivedKey);
  });

  it('passes asset key via options.key to thumbnail cache', async () => {
    await getAssetThumbnail('asset-grid', {
      assetId: 'asset-1',
      path: '/vault/assets/a.png',
      type: 'image',
      timeOffset: 0,
    });

    expect(getThumbnail).toHaveBeenCalledTimes(1);
    const [, , options] = vi.mocked(getThumbnail).mock.calls[0];
    expect(options.key).toBe('asset:asset-1:asset-grid:0');
  });

  it('passes cut-derived clip key via options.key to thumbnail cache', async () => {
    await getCutClipThumbnail('timeline-card', {
      cutId: 'cut-1',
      path: '/vault/assets/a.mp4',
      inPointSec: 1.2,
      outPointSec: 2.5,
    });

    expect(getThumbnail).toHaveBeenCalledTimes(1);
    const [, , options] = vi.mocked(getThumbnail).mock.calls[0];
    expect(options.key).toBe('cut:clip:cut-1:1200-2500:timeline-card');
    expect(options.timeOffset).toBe(1.2);
  });

  it('hits same cache key for same cut-derived request from different entry points', async () => {
    await getCutDerivedThumbnail('timeline-card', {
      kind: 'clip',
      cutId: 'cut-1',
      fingerprint: '1200-2500',
      path: '/vault/assets/a.mp4',
      type: 'video',
      timeOffset: 1.2,
    });
    await getCutClipThumbnail('timeline-card', {
      cutId: 'cut-1',
      path: '/vault/assets/a.mp4',
      inPointSec: 1.2,
      outPointSec: 2.5,
    });

    const calls = vi.mocked(getThumbnail).mock.calls;
    expect(calls).toHaveLength(2);
    const firstOptions = calls[0][2];
    const secondOptions = calls[1][2];
    expect(firstOptions.key).toBe(secondOptions.key);
  });

  it('resolves cached asset thumbnail through facade key strategy', () => {
    const cached = getCachedAssetThumbnail('asset-grid', {
      assetId: 'asset-1',
      path: '/vault/assets/a.png',
      timeOffset: 0,
    });
    expect(cached).toBe('cached-thumb');
    const [, options] = vi.mocked(getCachedThumbnail).mock.calls[0];
    expect(options.key).toBe('asset:asset-1:asset-grid:0');
  });

  it('removes cached asset thumbnail through facade key strategy', () => {
    removeAssetThumbnail('asset-grid', {
      assetId: 'asset-1',
      path: '/vault/assets/a.png',
      timeOffset: 0,
    });
    const [, options] = vi.mocked(removeThumbnailCache).mock.calls[0];
    expect(options.key).toBe('asset:asset-1:asset-grid:0');
  });

  it('resolves asset thumbnail from cache before snapshot fallback', () => {
    const resolved = resolveAssetThumbnailFromCache('asset-grid', {
      id: 'asset-1',
      path: '/vault/assets/a.png',
      type: 'image',
      thumbnail: 'snapshot-thumb',
    });

    expect(resolved).toBe('cached-thumb');
    const [, options] = vi.mocked(getCachedThumbnail).mock.calls[0];
    expect(options.key).toBe('asset:asset-1:asset-grid:0');
  });

  it('returns snapshot fallback from cache resolver when cache misses', () => {
    vi.mocked(getCachedThumbnail).mockReturnValueOnce(null);

    const resolved = resolveAssetThumbnailFromCache('asset-grid', {
      id: 'asset-1',
      path: '/vault/assets/a.png',
      type: 'image',
      thumbnail: 'snapshot-thumb',
    });

    expect(resolved).toBe('snapshot-thumb');
    const [, options] = vi.mocked(getCachedThumbnail).mock.calls[0];
    expect(options.key).toBe('asset:asset-1:asset-grid:0');
  });

  it('keeps asset key namespace even when source resolver falls back to snapshot', async () => {
    vi.mocked(getCachedThumbnail).mockReturnValueOnce(null);
    vi.mocked(getThumbnail).mockResolvedValueOnce(null);

    const resolved = await resolveAssetThumbnailSource('asset-grid', {
      id: 'asset-1',
      path: '/vault/assets/a.png',
      type: 'image',
      thumbnail: 'snapshot-thumb',
    });

    expect(resolved).toBe('snapshot-thumb');
    const [, , options] = vi.mocked(getThumbnail).mock.calls[0];
    expect(options.key).toBe('asset:asset-1:asset-grid:0');
  });
});
