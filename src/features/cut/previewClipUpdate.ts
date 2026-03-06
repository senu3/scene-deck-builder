import { ClearClipPointsCommand, UpdateClipPointsCommand } from '../../store/commands';
import type { Command } from '../../store/historyStore';
import type { Cut } from '../../types';
import { emitRegenThumbnailsEffect } from './thumbnailEffects';
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
  getCurrentClipRevision: (cutId: string) => number;
  updateCutAsset: (sceneId: string, cutId: string, updates: { thumbnail?: string }) => void;
  thumbnailProfile: ThumbnailProfile;
  onThumbnailUpdated?: (thumbnail: string) => void;
}

const CLIP_POINT_EPSILON = 0.0001;

function approximatelyEqual(a: number | undefined, b: number | undefined): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs((a as number) - (b as number)) < CLIP_POINT_EPSILON;
}

export async function savePreviewClipPoints(
  context: PreviewClipContext,
  inPoint: number,
  outPoint: number,
  deps: PreviewClipDeps,
  options?: { expectedClipRevision?: number },
): Promise<void> {
  if (
    typeof options?.expectedClipRevision === 'number'
    && deps.getCurrentClipRevision(context.cutId) !== options.expectedClipRevision
  ) {
    return;
  }

  const currentCut = deps.getCurrentCut(context.sceneId, context.cutId);
  const start = Math.min(inPoint, outPoint);
  const end = Math.max(inPoint, outPoint);
  if (
    currentCut?.isClip
    && approximatelyEqual(currentCut.inPoint, start)
    && approximatelyEqual(currentCut.outPoint, end)
  ) {
    return;
  }

  await deps.executeCommand(new UpdateClipPointsCommand(context.sceneId, context.cutId, start, end));

  if (deps.thumbnailProfile !== 'timeline-card') return;
  if (context.asset?.type !== 'video' || !context.asset.path) return;
  await emitRegenThumbnailsEffect(
    {
      profile: deps.thumbnailProfile,
      reason: 'clip-points-saved',
      requests: [{
        sceneId: context.sceneId,
        cutId: context.cutId,
        assetPath: context.asset.path,
        mode: 'clip',
        inPointSec: start,
        outPointSec: end,
      }],
    },
    {
      getCurrentCut: deps.getCurrentCut,
      updateCutAsset: deps.updateCutAsset,
      onThumbnailUpdated: deps.onThumbnailUpdated,
    }
  );
}

export async function clearPreviewClipPoints(
  context: PreviewClipContext,
  deps: PreviewClipDeps,
): Promise<void> {
  const currentCut = deps.getCurrentCut(context.sceneId, context.cutId);
  if (!currentCut?.isClip && !context.isClip) return;
  await deps.executeCommand(new ClearClipPointsCommand(context.sceneId, context.cutId));

  if (deps.thumbnailProfile !== 'timeline-card') return;
  if (context.asset?.type !== 'video' || !context.asset.path) return;
  await emitRegenThumbnailsEffect(
    {
      profile: deps.thumbnailProfile,
      reason: 'clip-points-cleared',
      requests: [{
        sceneId: context.sceneId,
        cutId: context.cutId,
        assetPath: context.asset.path,
        mode: 'clear',
        inPointSec: 0,
      }],
    },
    {
      getCurrentCut: deps.getCurrentCut,
      updateCutAsset: deps.updateCutAsset,
      onThumbnailUpdated: deps.onThumbnailUpdated,
    }
  );
}
