import { ClearClipPointsCommand, UpdateClipPointsCommand } from '../../store/commands';
import type { Command } from '../../store/historyStore';
import type { Cut } from '../../types';
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
  thumbnailProfile: ThumbnailProfile;
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

  await deps.executeCommand(
    new UpdateClipPointsCommand(context.sceneId, context.cutId, start, end, deps.thumbnailProfile)
  );
}

export async function clearPreviewClipPoints(
  context: PreviewClipContext,
  deps: PreviewClipDeps,
): Promise<void> {
  const currentCut = deps.getCurrentCut(context.sceneId, context.cutId);
  if (!currentCut?.isClip && !context.isClip) return;
  await deps.executeCommand(
    new ClearClipPointsCommand(context.sceneId, context.cutId, deps.thumbnailProfile)
  );
}
