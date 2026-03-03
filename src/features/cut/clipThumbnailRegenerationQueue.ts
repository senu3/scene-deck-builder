import type { Cut } from '../../types';
import { getCutClipThumbnail } from '../thumbnails/api';

const CLIP_POINT_EPSILON = 0.0001;

export type ClipThumbnailRegenerationMode = 'clip' | 'clear';

export interface ClipThumbnailRegenerationRequest {
  sceneId: string;
  cutId: string;
  assetPath: string;
  mode: ClipThumbnailRegenerationMode;
  inPointSec: number;
  outPointSec?: number;
}

export interface ClipThumbnailRegenerationDeps {
  getCurrentCut: (sceneId: string, cutId: string) => Cut | undefined;
  updateCutAsset: (sceneId: string, cutId: string, updates: { thumbnail?: string }) => void;
  onThumbnailUpdated?: (thumbnail: string) => void;
}

interface QueueEntry {
  latest?: ClipThumbnailRegenerationRequest;
  running: boolean;
}

const queueByCutId = new Map<string, QueueEntry>();

function isApproximatelyEqual(a: number | undefined, b: number | undefined): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs((a as number) - (b as number)) < CLIP_POINT_EPSILON;
}

function shouldApplyThumbnail(
  request: ClipThumbnailRegenerationRequest,
  deps: ClipThumbnailRegenerationDeps,
): boolean {
  const currentCut = deps.getCurrentCut(request.sceneId, request.cutId);
  if (!currentCut) return false;
  if (currentCut.asset?.path && currentCut.asset.path !== request.assetPath) return false;

  if (request.mode === 'clear') {
    return !currentCut.isClip;
  }

  if (!currentCut.isClip) return false;
  return isApproximatelyEqual(currentCut.inPoint, request.inPointSec)
    && isApproximatelyEqual(currentCut.outPoint, request.outPointSec);
}

async function resolveClipThumbnail(request: ClipThumbnailRegenerationRequest): Promise<string | null> {
  return getCutClipThumbnail('timeline-card', {
    cutId: request.cutId,
    path: request.assetPath,
    inPointSec: request.inPointSec,
    outPointSec: request.outPointSec,
  });
}

async function processQueueForCut(cutId: string, deps: ClipThumbnailRegenerationDeps): Promise<void> {
  const entry = queueByCutId.get(cutId);
  if (!entry || entry.running) return;

  entry.running = true;
  try {
    while (entry.latest) {
      const request = entry.latest;
      entry.latest = undefined;

      try {
        const thumbnail = await resolveClipThumbnail(request);
        if (!thumbnail) continue;
        if (!shouldApplyThumbnail(request, deps)) continue;

        deps.updateCutAsset(request.sceneId, request.cutId, { thumbnail });
        deps.onThumbnailUpdated?.(thumbnail);
      } catch (error) {
        console.warn('[clip-thumbnail-queue] failed to regenerate thumbnail:', error);
      }
    }
  } finally {
    queueByCutId.delete(cutId);
  }
}

export function enqueueClipThumbnailRegeneration(
  request: ClipThumbnailRegenerationRequest,
  deps: ClipThumbnailRegenerationDeps,
): void {
  const current = queueByCutId.get(request.cutId);
  if (!current) {
    queueByCutId.set(request.cutId, { latest: request, running: false });
  } else {
    current.latest = request;
  }

  void processQueueForCut(request.cutId, deps);
}

export function __resetClipThumbnailRegenerationQueueForTests(): void {
  queueByCutId.clear();
}
