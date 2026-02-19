import { getCutClipThumbnail } from '../thumbnails/api';

export async function generateVideoClipThumbnail(
  cutId: string | undefined,
  assetPath: string | undefined,
  timeOffset: number | undefined,
  outPoint?: number
): Promise<string | null> {
  if (!cutId || !assetPath) return null;

  try {
    return await getCutClipThumbnail('timeline-card', {
      cutId,
      path: assetPath,
      inPointSec: timeOffset ?? 0,
      outPointSec: outPoint,
    });
  } catch {
    return null;
  }
}
