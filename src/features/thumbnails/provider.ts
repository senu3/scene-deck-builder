import { generateVideoThumbnail } from '../../utils/videoUtils';
import type { ThumbnailMediaType, ThumbnailProfile } from '../../utils/thumbnailCache';

interface ResolveThumbnailOptions {
  timeOffset?: number;
  profile: ThumbnailProfile;
}

function normalizeTimeOffset(timeOffset: number | undefined): number {
  if (!Number.isFinite(timeOffset)) return 0;
  return Math.max(0, timeOffset ?? 0);
}

async function requestThumbnailViaIpc(
  path: string,
  type: ThumbnailMediaType,
  options: ResolveThumbnailOptions
): Promise<string | null> {
  if (!window.electronAPI?.generateThumbnail) return null;
  try {
    const result = await window.electronAPI.generateThumbnail(path, type, {
      timeOffset: options.timeOffset,
      profile: options.profile,
    });
    return result?.success ? (result.thumbnail ?? null) : null;
  } catch {
    return null;
  }
}

async function fallbackInRenderer(
  path: string,
  type: ThumbnailMediaType,
  options: ResolveThumbnailOptions
): Promise<string | null> {
  if (type === 'video') {
    return generateVideoThumbnail(path, normalizeTimeOffset(options.timeOffset));
  }
  if (window.electronAPI?.readFileAsBase64) {
    // Fallback for image path reads if thumbnail IPC is unavailable.
    return window.electronAPI.readFileAsBase64(path);
  }
  return null;
}

export async function resolveThumbnailData(
  path: string,
  type: ThumbnailMediaType,
  options: ResolveThumbnailOptions
): Promise<string | null> {
  const viaIpc = await requestThumbnailViaIpc(path, type, options);
  if (viaIpc) return viaIpc;
  return fallbackInRenderer(path, type, options);
}
