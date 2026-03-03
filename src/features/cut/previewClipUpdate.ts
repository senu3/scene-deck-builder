import { ClearClipPointsCommand, UpdateClipPointsCommand } from '../../store/commands';
import type { Command } from '../../store/historyStore';
import type { Cut } from '../../types';
import { enqueueClipThumbnailRegeneration } from './clipThumbnailRegenerationQueue';
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
  getCurrentCut: (sceneId: string, cutId: string) => Cut | undefined;
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

  if (deps.thumbnailProfile !== 'timeline-card') return;
  if (context.asset?.type !== 'video' || !context.asset.path) return;
  enqueueClipThumbnailRegeneration({
    sceneId: context.sceneId,
    cutId: context.cutId,
    assetPath: context.asset.path,
    mode: 'clip',
    inPointSec: inPoint,
    outPointSec: outPoint,
  }, {
    getCurrentCut: deps.getCurrentCut,
    updateCutAsset: deps.updateCutAsset,
    onThumbnailUpdated: deps.onThumbnailUpdated,
  });
}

export async function clearPreviewClipPoints(
  context: PreviewClipContext,
  deps: PreviewClipDeps,
): Promise<void> {
  if (!context.isClip) return;
  await deps.executeCommand(new ClearClipPointsCommand(context.sceneId, context.cutId));

  if (deps.thumbnailProfile !== 'timeline-card') return;
  if (context.asset?.type !== 'video' || !context.asset.path) return;
  enqueueClipThumbnailRegeneration({
    sceneId: context.sceneId,
    cutId: context.cutId,
    assetPath: context.asset.path,
    mode: 'clear',
    inPointSec: 0,
  }, {
    getCurrentCut: deps.getCurrentCut,
    updateCutAsset: deps.updateCutAsset,
    onThumbnailUpdated: deps.onThumbnailUpdated,
  });
}
