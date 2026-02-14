import type { Command } from './historyStore';
import { useStore } from './useStore';
import type { Asset, Cut } from '../types';

function resolveCutAsset(store: ReturnType<typeof useStore.getState>, cut: Cut): Asset | undefined {
  return store.getAsset(cut.assetId) || cut.asset;
}

function cloneCutSnapshot(cut: Cut): Cut {
  return {
    ...cut,
    subtitle: cut.subtitle
      ? {
          text: cut.subtitle.text,
          range: cut.subtitle.range ? { start: cut.subtitle.range.start, end: cut.subtitle.range.end } : undefined,
        }
      : undefined,
    audioBindings: cut.audioBindings ? cut.audioBindings.map((binding) => ({ ...binding })) : [],
  };
}

function restoreCutState(
  store: ReturnType<typeof useStore.getState>,
  sceneId: string,
  cutId: string,
  sourceCut: Cut
): void {
  store.updateCutDisplayTime(sceneId, cutId, sourceCut.displayTime);

  if (sourceCut.isClip && sourceCut.inPoint !== undefined && sourceCut.outPoint !== undefined) {
    store.updateCutClipPoints(sceneId, cutId, sourceCut.inPoint, sourceCut.outPoint);
  }

  store.updateCutLipSync(sceneId, cutId, !!sourceCut.isLipSync, sourceCut.lipSyncFrameCount);
  store.updateCutSubtitle(sceneId, cutId, sourceCut.subtitle);
  store.setCutAudioBindings(sceneId, cutId, sourceCut.audioBindings || []);
  store.setCutUseEmbeddedAudio(sceneId, cutId, sourceCut.useEmbeddedAudio ?? true);
}

export class DuplicateCutWithClipCommand implements Command {
  type = 'DUPLICATE_CUT_WITH_CLIP';
  description: string;

  private sceneId: string;
  private sourceCutId: string;
  private inPoint: number;
  private outPoint: number;
  private createdCutId?: string;

  constructor(sceneId: string, sourceCutId: string, inPoint: number, outPoint: number) {
    this.sceneId = sceneId;
    this.sourceCutId = sourceCutId;
    this.inPoint = inPoint;
    this.outPoint = outPoint;
    const duration = Math.abs(outPoint - inPoint);
    this.description = `Duplicate cut and set clip points: ${inPoint.toFixed(2)}s - ${outPoint.toFixed(2)}s (${duration.toFixed(2)}s)`;
  }

  getCreatedCutId(): string | undefined {
    return this.createdCutId;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    if (!scene) return;

    const sourceIndex = scene.cuts.findIndex((c) => c.id === this.sourceCutId);
    if (sourceIndex < 0) return;
    const sourceCut = scene.cuts[sourceIndex];
    if (!sourceCut) return;

    const sourceSnapshot = cloneCutSnapshot(sourceCut);
    const insertIndex = Math.min(scene.cuts.length, sourceIndex + 1);
    const resolvedAsset = resolveCutAsset(store, sourceSnapshot);

    this.createdCutId = resolvedAsset
      ? store.addCutToScene(this.sceneId, resolvedAsset, insertIndex)
      : store.addLoadingCutToScene(this.sceneId, sourceSnapshot.assetId, `missing:${sourceSnapshot.assetId}`, insertIndex);

    if (!this.createdCutId) return;

    restoreCutState(store, this.sceneId, this.createdCutId, sourceSnapshot);
    store.updateCutClipPoints(this.sceneId, this.createdCutId, this.inPoint, this.outPoint);
  }

  async undo(): Promise<void> {
    if (!this.createdCutId) return;
    const store = useStore.getState();
    store.removeCut(this.sceneId, this.createdCutId);
  }
}
