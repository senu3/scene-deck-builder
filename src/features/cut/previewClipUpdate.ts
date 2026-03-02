import { ClearClipPointsCommand, UpdateClipPointsCommand } from '../../store/commands';
import type { Command } from '../../store/historyStore';
import { getCutClipThumbnail } from '../thumbnails/api';
import type { ThumbnailProfile } from '../../utils/thumbnailCache';

interface PreviewClipAssetInput {
  path?: string;
  type?: string;
}

interface PreviewClipContext {
  sceneId: string;
  cutId: string;
  isClip: boolean;
  asset?: PreviewClipAssetInput;
}

interface PreviewClipDeps {
  executeCommand: (command: Command) => Promise<void>;
  updateCutAsset: (sceneId: string, cutId: string, updates: { thumbnail?: string }) => void;
  thumbnailProfile: ThumbnailProfile;
  onThumbnailUpdated?: (thumbnail: string) => void;
}

export async function savePreviewClipPoints(
  context: PreviewClipContext,
  inPoint: number,
  outPoint: number,
  deps: PreviewClipDeps,
): Promise<void> {
  await deps.executeCommand(new UpdateClipPointsCommand(context.sceneId, context.cutId, inPoint, outPoint));

  if (context.asset?.type !== 'video' || !context.asset.path) return;
  const thumbnail = await getCutClipThumbnail(deps.thumbnailProfile, {
    cutId: context.cutId,
    path: context.asset.path,
    inPointSec: inPoint,
    outPointSec: outPoint,
  });
  if (!thumbnail) return;

  deps.updateCutAsset(context.sceneId, context.cutId, { thumbnail });
  deps.onThumbnailUpdated?.(thumbnail);
}

export async function clearPreviewClipPoints(
  context: PreviewClipContext,
  deps: PreviewClipDeps,
): Promise<void> {
  if (!context.isClip) return;
  await deps.executeCommand(new ClearClipPointsCommand(context.sceneId, context.cutId));

  if (context.asset?.type !== 'video' || !context.asset.path) return;
  const thumbnail = await getCutClipThumbnail(deps.thumbnailProfile, {
    cutId: context.cutId,
    path: context.asset.path,
    inPointSec: 0,
  });
  if (!thumbnail) return;

  deps.updateCutAsset(context.sceneId, context.cutId, { thumbnail });
  deps.onThumbnailUpdated?.(thumbnail);
}
