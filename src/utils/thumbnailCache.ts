import { generateVideoThumbnail } from './videoUtils';

export type ThumbnailMediaType = 'image' | 'video';

interface ThumbnailCacheLimits {
  maxBytes: number;
  maxItems: number;
}

interface ThumbnailRequestOptions {
  timeOffset?: number;
  key?: string;
  profile: 'timeline-card' | 'asset-grid' | 'sequence-preview' | 'details-panel';
}

interface CacheEntry {
  data: string;
  bytes: number;
}

const DEFAULT_LIMITS: ThumbnailCacheLimits = {
  // Keep conservative defaults; tune via setThumbnailCacheLimits.
  maxBytes: 128 * 1024 * 1024,
  maxItems: 1000,
};

let limits: ThumbnailCacheLimits = { ...DEFAULT_LIMITS };
let totalBytes = 0;

// LRU order: Map preserves insertion order.
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function estimateStringBytes(value: string): number {
  // JS strings are UTF-16 (approx 2 bytes/char).
  return value.length * 2;
}

function makeCacheKey(path: string, options: ThumbnailRequestOptions): string {
  if (!options.profile) {
    throw new Error('Thumbnail profile is required. Use a profile-specific request option.');
  }
  if (options.key) return options.key;
  const timeOffset = typeof options.timeOffset === 'number' ? options.timeOffset : 'default';
  const profile = options.profile;
  return `${path}|t=${timeOffset}|p=${profile}`;
}

function touch(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
}

function evictIfNeeded(): void {
  while (cache.size > limits.maxItems || totalBytes > limits.maxBytes) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    const entry = cache.get(oldest);
    if (entry) {
      totalBytes -= entry.bytes;
    }
    cache.delete(oldest);
  }
}

export function setThumbnailCacheLimits(next: Partial<ThumbnailCacheLimits>): void {
  limits = {
    ...limits,
    ...next,
  };
  evictIfNeeded();
}

export function getThumbnailCacheStats(): { items: number; bytes: number; limits: ThumbnailCacheLimits } {
  return { items: cache.size, bytes: totalBytes, limits: { ...limits } };
}

export function getCachedThumbnail(path: string, options: ThumbnailRequestOptions): string | null {
  const key = makeCacheKey(path, options);
  const entry = cache.get(key);
  if (!entry) return null;
  touch(key, entry);
  return entry.data;
}

export function removeThumbnailCache(path: string, options: ThumbnailRequestOptions): void {
  const key = makeCacheKey(path, options);
  const entry = cache.get(key);
  if (!entry) return;
  totalBytes -= entry.bytes;
  cache.delete(key);
}

export function clearThumbnailCache(): void {
  cache.clear();
  inFlight.clear();
  totalBytes = 0;
}

export async function getThumbnail(
  path: string,
  type: ThumbnailMediaType,
  options: ThumbnailRequestOptions
): Promise<string | null> {
  const key = makeCacheKey(path, options);
  const cached = cache.get(key);
  if (cached) {
    touch(key, cached);
    return cached.data;
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      let data: string | null = null;
      if (window.electronAPI?.generateThumbnail) {
        const result = await window.electronAPI.generateThumbnail(path, type, {
          timeOffset: options.timeOffset,
          profile: options.profile,
        });
        data = result?.success ? (result.thumbnail ?? null) : null;
      }

      if (!data && type === 'video') {
        data = await generateVideoThumbnail(path, options.timeOffset);
      } else if (!data && window.electronAPI) {
        // Legacy fallback only; new flow should use generateThumbnail IPC.
        data = await window.electronAPI.readFileAsBase64(path);
      }

      if (!data) return null;

      const bytes = estimateStringBytes(data);
      if (bytes > limits.maxBytes) {
        // Too large to cache; return without storing.
        return data;
      }

      cache.set(key, { data, bytes });
      totalBytes += bytes;
      evictIfNeeded();
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
