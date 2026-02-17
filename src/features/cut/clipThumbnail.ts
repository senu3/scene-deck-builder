import { getThumbnail } from '../../utils/thumbnailCache';

function normalizeTimeOffset(timeOffset: number | undefined): number {
  if (!Number.isFinite(timeOffset)) return 0;
  return Math.max(0, timeOffset ?? 0);
}

export async function generateVideoClipThumbnail(
  assetPath: string | undefined,
  timeOffset: number | undefined
): Promise<string | null> {
  if (!assetPath) return null;
  if (!window.electronAPI?.generateThumbnail) return null;

  try {
    return await getThumbnail(assetPath, 'video', {
      timeOffset: normalizeTimeOffset(timeOffset),
      profile: 'timeline-card',
    });
  } catch {
    return null;
  }
}
