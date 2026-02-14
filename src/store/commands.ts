import { Command } from './historyStore';
import { useStore } from './useStore';
import type { Asset, Cut, Scene, CutGroup, SceneAudioBinding, CutSubtitle, AudioAnalysis } from '../types';
import { syncSceneMetadata } from '../utils/metadataStore';
import { v4 as uuidv4 } from 'uuid';
import { analyzeAudioRms } from '../utils/audioUtils';
import {
  buildSimpleAutoClipRanges,
  generateSimpleAutoClipSplitPoints,
  type SimpleAutoClipMode,
} from '../features/cut/simpleAutoClip';

function restoreCutState(
  store: ReturnType<typeof useStore.getState>,
  sceneId: string,
  cutId: string,
  sourceCut: Cut
) {
  store.updateCutDisplayTime(sceneId, cutId, sourceCut.displayTime);

  if (sourceCut.isClip && sourceCut.inPoint !== undefined && sourceCut.outPoint !== undefined) {
    store.updateCutClipPoints(sceneId, cutId, sourceCut.inPoint, sourceCut.outPoint);
  }

  store.updateCutLipSync(sceneId, cutId, !!sourceCut.isLipSync, sourceCut.lipSyncFrameCount);
  store.updateCutSubtitle(sceneId, cutId, sourceCut.subtitle);
  store.setCutAudioBindings(sceneId, cutId, sourceCut.audioBindings || []);
  store.setCutUseEmbeddedAudio(sceneId, cutId, sourceCut.useEmbeddedAudio ?? true);
}

function resolveCutAsset(store: ReturnType<typeof useStore.getState>, cut: Cut): Asset | undefined {
  return store.getAsset(cut.assetId) || cut.asset;
}

function getAssetDisplayName(asset: Asset): string {
  if (asset.originalPath) {
    const originalName = asset.originalPath.split(/[/\\]/).pop();
    if (originalName) return originalName;
  }
  return asset.name;
}

function addCutFromReference(
  store: ReturnType<typeof useStore.getState>,
  sceneId: string,
  cut: Cut
): string {
  const resolvedAsset = resolveCutAsset(store, cut);
  if (resolvedAsset) {
    return store.addCutToScene(sceneId, resolvedAsset);
  }
  return store.addLoadingCutToScene(sceneId, cut.assetId, `missing:${cut.assetId}`);
}

function cloneCut(cut: Cut): Cut {
  return {
    ...cut,
    subtitle: cut.subtitle
      ? {
          text: cut.subtitle.text,
          range: cut.subtitle.range
            ? { start: cut.subtitle.range.start, end: cut.subtitle.range.end }
            : undefined,
        }
      : undefined,
    audioBindings: cut.audioBindings?.map((binding) => ({ ...binding })) || [],
  };
}

function cloneScene(scene: Scene): Scene {
  return {
    ...scene,
    cuts: scene.cuts.map((cut) => cloneCut(cut)),
    groups: scene.groups?.map((group) => ({ ...group, cutIds: [...group.cutIds] })),
    notes: scene.notes?.map((note) => ({ ...note })) || [],
  };
}

function replaceScene(sceneId: string, nextScene: Scene): void {
  useStore.setState((state) => ({
    scenes: state.scenes.map((scene) => (scene.id === sceneId ? cloneScene(nextScene) : scene)),
  }));
}

/**
 * カット追加コマンド
 */
export class AddCutCommand implements Command {
  type = 'ADD_CUT';
  description: string;

  private sceneId: string;
  private asset: Asset;
  private cutId?: string;
  private displayTime?: number;
  private insertIndex?: number;

  constructor(sceneId: string, asset: Asset, displayTime?: number, insertIndex?: number) {
    this.sceneId = sceneId;
    this.asset = asset;
    this.displayTime = displayTime;
    this.insertIndex = insertIndex;
    this.description = `Add cut: ${asset.name}`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    this.cutId = store.addCutToScene(this.sceneId, this.asset, this.insertIndex);

    if (this.displayTime !== undefined && this.cutId) {
      store.updateCutDisplayTime(this.sceneId, this.cutId, this.displayTime);
    }
  }

  async undo(): Promise<void> {
    if (!this.cutId) return;

    const store = useStore.getState();
    store.removeCut(this.sceneId, this.cutId);
  }
}

/**
 * カット削除コマンド
 */
export class RemoveCutCommand implements Command {
  type = 'REMOVE_CUT';
  description: string;

  private sceneId: string;
  private cutId: string;
  private removedCut?: Cut;
  private removedCutIndex?: number;

  constructor(sceneId: string, cutId: string) {
    this.sceneId = sceneId;
    this.cutId = cutId;
    this.description = `Remove cut`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);

    if (scene) {
      this.removedCutIndex = scene.cuts.findIndex((c) => c.id === this.cutId);
      this.removedCut = scene.cuts[this.removedCutIndex];
    }

    store.removeCut(this.sceneId, this.cutId);
  }

  async undo(): Promise<void> {
    if (!this.removedCut) {
      console.warn('No cut data to restore');
      return;
    }

    const store = useStore.getState();

    // カットを復元
    const newCutId = addCutFromReference(store, this.sceneId, this.removedCut);
    restoreCutState(store, this.sceneId, newCutId, this.removedCut);

    // 元の位置に移動（可能な場合）
    if (this.removedCutIndex !== undefined && this.removedCutIndex > 0) {
      const scene = store.scenes.find((s) => s.id === this.sceneId);
      if (scene) {
        store.reorderCuts(
          this.sceneId,
          newCutId,
          this.removedCutIndex,
          this.sceneId,
          scene.cuts.length - 1
        );
      }
    }
  }
}

/**
 * 表示時間更新コマンド
 */
export class UpdateDisplayTimeCommand implements Command {
  type = 'UPDATE_DISPLAY_TIME';
  description: string;

  private sceneId: string;
  private cutId: string;
  private newTime: number;
  private oldTime?: number;

  constructor(sceneId: string, cutId: string, newTime: number) {
    this.sceneId = sceneId;
    this.cutId = cutId;
    this.newTime = newTime;
    this.description = `Update display time to ${newTime}s`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const cut = scene?.cuts.find((c) => c.id === this.cutId);

    if (cut) {
      this.oldTime = cut.displayTime;
    }

    store.updateCutDisplayTime(this.sceneId, this.cutId, this.newTime);
  }

  async undo(): Promise<void> {
    if (this.oldTime === undefined) return;

    const store = useStore.getState();
    store.updateCutDisplayTime(this.sceneId, this.cutId, this.oldTime);
  }
}

/**
 * カット並び替えコマンド
 */
export class ReorderCutsCommand implements Command {
  type = 'REORDER_CUTS';
  description: string;

  private sceneId: string;
  private cutId: string;
  private newIndex: number;
  private oldIndex?: number;

  constructor(sceneId: string, cutId: string, newIndex: number, oldIndex: number) {
    this.sceneId = sceneId;
    this.cutId = cutId;
    this.oldIndex = oldIndex;
    this.newIndex = newIndex;
    this.description = `Reorder cut`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    store.reorderCuts(this.sceneId, this.cutId, this.newIndex, this.sceneId, this.oldIndex!);
  }

  async undo(): Promise<void> {
    if (this.oldIndex === undefined) return;

    const store = useStore.getState();
    store.reorderCuts(this.sceneId, this.cutId, this.oldIndex, this.sceneId, this.newIndex);
  }
}

/**
 * 字幕更新コマンド
 */
export class UpdateCutSubtitleCommand implements Command {
  type = 'UPDATE_CUT_SUBTITLE';
  description: string;

  private sceneId: string;
  private cutId: string;
  private nextSubtitle?: CutSubtitle;
  private previousSubtitle?: CutSubtitle;

  constructor(sceneId: string, cutId: string, subtitle?: CutSubtitle) {
    this.sceneId = sceneId;
    this.cutId = cutId;
    this.nextSubtitle = subtitle
      ? {
          text: subtitle.text,
          range: subtitle.range ? { start: subtitle.range.start, end: subtitle.range.end } : undefined,
        }
      : undefined;
    this.description = subtitle?.text?.trim() ? 'Update cut subtitle' : 'Clear cut subtitle';
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const cut = scene?.cuts.find((c) => c.id === this.cutId);
    this.previousSubtitle = cut?.subtitle
      ? {
          text: cut.subtitle.text,
          range: cut.subtitle.range ? { start: cut.subtitle.range.start, end: cut.subtitle.range.end } : undefined,
        }
      : undefined;
    store.updateCutSubtitle(this.sceneId, this.cutId, this.nextSubtitle);
  }

  async undo(): Promise<void> {
    const store = useStore.getState();
    store.updateCutSubtitle(this.sceneId, this.cutId, this.previousSubtitle);
  }
}

/**
 * 同一シーン内のカット並び替え（任意でグループ順同期）コマンド
 */
export class ReorderCutsWithGroupSyncCommand implements Command {
  type = 'REORDER_CUTS_WITH_GROUP_SYNC';
  description = 'Reorder cuts with optional group sync';

  private sceneId: string;
  private cutIds: string[];
  private toIndex: number;
  private groupId?: string;
  private previousSceneCuts?: Cut[];
  private previousGroupCutIds?: string[];

  constructor(sceneId: string, cutIds: string[], toIndex: number, groupId?: string) {
    this.sceneId = sceneId;
    this.cutIds = cutIds;
    this.toIndex = toIndex;
    this.groupId = groupId;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    if (!scene) return;

    const cutIdSet = new Set(this.cutIds);
    if (cutIdSet.size === 0) return;

    const cutById = new Map(scene.cuts.map((cut) => [cut.id, cut] as const));
    const movedCuts = this.cutIds
      .map((id) => cutById.get(id))
      .filter((cut): cut is Cut => cut !== undefined);
    if (movedCuts.length === 0) return;

    this.previousSceneCuts = scene.cuts.map((cut) => ({ ...cut }));

    const remainingCuts = scene.cuts.filter((cut) => !cutIdSet.has(cut.id));
    const insertIndex = Math.max(0, Math.min(this.toIndex, remainingCuts.length));
    const nextCuts = [...remainingCuts];
    nextCuts.splice(insertIndex, 0, ...movedCuts);

    const group = this.groupId ? scene.groups?.find((g) => g.id === this.groupId) : undefined;
    const nextGroupCutIds = group
      ? nextCuts.filter((cut) => group.cutIds.includes(cut.id)).map((cut) => cut.id)
      : undefined;
    if (group) {
      this.previousGroupCutIds = [...group.cutIds];
    }

    useStore.setState((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === this.sceneId
          ? {
              ...s,
              cuts: nextCuts.map((cut, idx) => ({ ...cut, order: idx })),
              groups:
                this.groupId && nextGroupCutIds
                  ? (s.groups || []).map((g) => (g.id === this.groupId ? { ...g, cutIds: nextGroupCutIds } : g))
                  : s.groups,
            }
          : s
      ),
    }));
  }

  async undo(): Promise<void> {
    if (!this.previousSceneCuts) return;

    useStore.setState((state) => ({
      scenes: state.scenes.map((s) =>
        s.id === this.sceneId
          ? {
              ...s,
              cuts: this.previousSceneCuts!.map((cut, idx) => ({ ...cut, order: idx })),
              groups:
                this.groupId && this.previousGroupCutIds
                  ? (s.groups || []).map((g) =>
                      g.id === this.groupId ? { ...g, cutIds: [...this.previousGroupCutIds!] } : g
                    )
                  : s.groups,
            }
          : s
      ),
    }));
  }
}

/**
 * シーン間カット移動コマンド
 */
export class MoveCutBetweenScenesCommand implements Command {
  type = 'MOVE_CUT_BETWEEN_SCENES';
  description: string;

  private fromSceneId: string;
  private toSceneId: string;
  private cutId: string;
  private toIndex: number;
  private fromIndex?: number;

  constructor(fromSceneId: string, toSceneId: string, cutId: string, toIndex: number) {
    this.fromSceneId = fromSceneId;
    this.toSceneId = toSceneId;
    this.cutId = cutId;
    this.toIndex = toIndex;
    this.description = `Move cut between scenes`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const fromScene = store.scenes.find((s) => s.id === this.fromSceneId);

    if (fromScene) {
      this.fromIndex = fromScene.cuts.findIndex((c) => c.id === this.cutId);
    }

    store.moveCutToScene(this.fromSceneId, this.toSceneId, this.cutId, this.toIndex);
  }

  async undo(): Promise<void> {
    if (this.fromIndex === undefined) return;

    const store = useStore.getState();
    store.moveCutToScene(this.toSceneId, this.fromSceneId, this.cutId, this.fromIndex);
  }
}

/**
 * シーン複製コマンド
 */
export class DuplicateSceneCommand implements Command {
  type = 'DUPLICATE_SCENE';
  description: string;

  private sourceSceneId: string;
  private newSceneId?: string;
  private newCutIds: string[] = [];

  constructor(sourceSceneId: string) {
    this.sourceSceneId = sourceSceneId;
    this.description = `Duplicate scene`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const sourceScene = store.scenes.find((s) => s.id === this.sourceSceneId);

    if (!sourceScene) return;

    // 新しいシーンを作成
    this.newSceneId = store.addScene(`${sourceScene.name} (Copy)`);

    // 全カットをコピー
    sourceScene.cuts.forEach((cut) => {
      const newCutId = addCutFromReference(store, this.newSceneId!, cut);
      restoreCutState(store, this.newSceneId!, newCutId, cut);
      this.newCutIds.push(newCutId);
    });

    // ノートをコピー
    sourceScene.notes?.forEach((note) => {
      store.addSceneNote(this.newSceneId!, {
        type: note.type,
        content: note.content,
      });
    });
  }

  async undo(): Promise<void> {
    if (!this.newSceneId) return;

    const store = useStore.getState();
    store.removeScene(this.newSceneId);
  }
}

/**
 * シーン追加コマンド
 */
export class AddSceneCommand implements Command {
  type = 'ADD_SCENE';
  description: string;

  private sceneName: string;
  private sceneId?: string;

  constructor(sceneName: string) {
    this.sceneName = sceneName;
    this.description = `Add scene: ${sceneName}`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    this.sceneId = store.addScene(this.sceneName);
  }

  async undo(): Promise<void> {
    if (!this.sceneId) return;

    const store = useStore.getState();
    store.removeScene(this.sceneId);
  }
}

/**
 * シーン削除コマンド
 */
export class RemoveSceneCommand implements Command {
  type = 'REMOVE_SCENE';
  description: string;

  private sceneId: string;
  private removedScene?: Scene;
  private removedSceneIndex?: number;

  constructor(sceneId: string) {
    this.sceneId = sceneId;
    this.description = `Remove scene`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    this.removedSceneIndex = store.sceneOrder.findIndex((id) => id === this.sceneId);
    this.removedScene = store.scenes.find((s) => s.id === this.sceneId);

    store.removeScene(this.sceneId);
  }

  async undo(): Promise<void> {
    if (!this.removedScene) {
      console.warn('No scene data to restore');
      return;
    }

    const store = useStore.getState();
    const restoreIndex = Math.min(
      Math.max(this.removedSceneIndex ?? store.sceneOrder.length, 0),
      store.sceneOrder.length
    );

    useStore.setState((state) => {
      const scenes = [...state.scenes];
      scenes.push(this.removedScene as Scene);
      const sceneOrder = [...state.sceneOrder];
      sceneOrder.splice(restoreIndex, 0, (this.removedScene as Scene).id);
      const currentStore = state.metadataStore || { version: 1, metadata: {}, sceneMetadata: {} };
      const metadataStore = syncSceneMetadata(currentStore, scenes);

      return {
        scenes,
        sceneOrder,
        metadataStore,
      };
    });

    store.saveMetadata();
  }
}

/**
 * 複数カット削除コマンド
 */
export class RemoveCutsCommand implements Command {
  type = 'REMOVE_CUTS';
  description: string;

  private refs: Array<{ sceneId: string; cutId: string }>;
  private removed: Array<{ sceneId: string; cut: Cut; index: number }> = [];

  constructor(refs: Array<{ sceneId: string; cutId: string }>) {
    this.refs = refs;
    this.description = `Remove ${refs.length} cuts`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    this.removed = [];

    for (const { sceneId, cutId } of this.refs) {
      const scene = store.scenes.find((s) => s.id === sceneId);
      if (!scene) continue;
      const index = scene.cuts.findIndex((c) => c.id === cutId);
      if (index < 0) continue;
      const cut = scene.cuts[index];
      this.removed.push({ sceneId, cut, index });
    }

    for (const { sceneId, cut } of this.removed) {
      store.removeCut(sceneId, cut.id);
    }
  }

  async undo(): Promise<void> {
    if (this.removed.length === 0) return;

    const store = useStore.getState();
    const toRestore = [...this.removed].sort((a, b) => a.index - b.index);

    for (const { sceneId, cut, index } of toRestore) {
      const newCutId = addCutFromReference(store, sceneId, cut);
      restoreCutState(store, sceneId, newCutId, cut);
      const scene = store.scenes.find((s) => s.id === sceneId);
      if (scene && index > 0) {
        store.reorderCuts(sceneId, newCutId, index, sceneId, scene.cuts.length - 1);
      }
    }
  }
}

/**
 * シーン名変更コマンド
 */
export class RenameSceneCommand implements Command {
  type = 'RENAME_SCENE';
  description: string;

  private sceneId: string;
  private newName: string;
  private oldName?: string;

  constructor(sceneId: string, newName: string) {
    this.sceneId = sceneId;
    this.newName = newName;
    this.description = `Rename scene to ${newName}`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);

    if (scene) {
      this.oldName = scene.name;
    }

    store.renameScene(this.sceneId, this.newName);
  }

  async undo(): Promise<void> {
    if (!this.oldName) return;

    const store = useStore.getState();
    store.renameScene(this.sceneId, this.oldName);
  }
}

/**
 * クリップポイント更新コマンド
 */
export class UpdateClipPointsCommand implements Command {
  type = 'UPDATE_CLIP_POINTS';
  description: string;

  private sceneId: string;
  private cutId: string;
  private newInPoint: number;
  private newOutPoint: number;
  private oldInPoint?: number;
  private oldOutPoint?: number;
  private oldDisplayTime?: number;
  private wasClip?: boolean;

  constructor(sceneId: string, cutId: string, inPoint: number, outPoint: number) {
    this.sceneId = sceneId;
    this.cutId = cutId;
    this.newInPoint = inPoint;
    this.newOutPoint = outPoint;
    const duration = Math.abs(outPoint - inPoint);
    this.description = `Set clip points: ${inPoint.toFixed(2)}s - ${outPoint.toFixed(2)}s (${duration.toFixed(2)}s)`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const cut = scene?.cuts.find((c) => c.id === this.cutId);

    if (cut) {
      this.oldInPoint = cut.inPoint;
      this.oldOutPoint = cut.outPoint;
      this.oldDisplayTime = cut.displayTime;
      this.wasClip = cut.isClip;
    }

    store.updateCutClipPoints(this.sceneId, this.cutId, this.newInPoint, this.newOutPoint);
  }

  async undo(): Promise<void> {
    const store = useStore.getState();

    if (this.wasClip && this.oldInPoint !== undefined && this.oldOutPoint !== undefined) {
      // Restore previous clip points
      store.updateCutClipPoints(this.sceneId, this.cutId, this.oldInPoint, this.oldOutPoint);
    } else {
      // Clear clip points (wasn't a clip before)
      store.clearCutClipPoints(this.sceneId, this.cutId);
      // Restore original display time
      if (this.oldDisplayTime !== undefined) {
        store.updateCutDisplayTime(this.sceneId, this.cutId, this.oldDisplayTime);
      }
    }
  }
}

/**
 * 非Clipのカットを複製し、複製先にクリップポイントを適用するコマンド
 */
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

    const sourceSnapshot: Cut = {
      ...sourceCut,
      subtitle: sourceCut.subtitle ? { ...sourceCut.subtitle } : undefined,
      audioBindings: sourceCut.audioBindings ? sourceCut.audioBindings.map((binding) => ({ ...binding })) : [],
    };

    const insertIndex = Math.min(scene.cuts.length, sourceIndex + 1);
    const resolvedAsset = resolveCutAsset(store, sourceSnapshot);
    this.createdCutId = resolvedAsset
      ? store.addCutToScene(this.sceneId, resolvedAsset, insertIndex)
      : store.addLoadingCutToScene(this.sceneId, sourceSnapshot.assetId, `missing:${sourceSnapshot.assetId}`, insertIndex);

    if (!this.createdCutId) return;

    restoreCutState(store, this.sceneId, this.createdCutId, sourceSnapshot);
    store.updateCutClipPoints(this.sceneId, this.createdCutId, this.inPoint, this.outPoint);

    // Safety: keep source cut non-clip when clipping for the first time.
    // This avoids accidental source mutation and keeps "duplicate then clip" behavior strict.
    if (!sourceSnapshot.isClip) {
      store.clearCutClipPoints(this.sceneId, this.sourceCutId);
      store.updateCutDisplayTime(this.sceneId, this.sourceCutId, sourceSnapshot.displayTime);
    }
  }

  async undo(): Promise<void> {
    if (!this.createdCutId) return;
    const store = useStore.getState();
    store.removeCut(this.sceneId, this.createdCutId);
  }
}

/**
 * クリップポイントクリアコマンド
 */
export class ClearClipPointsCommand implements Command {
  type = 'CLEAR_CLIP_POINTS';
  description = 'Clear clip points';

  private sceneId: string;
  private cutId: string;
  private oldInPoint?: number;
  private oldOutPoint?: number;

  constructor(sceneId: string, cutId: string) {
    this.sceneId = sceneId;
    this.cutId = cutId;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const cut = scene?.cuts.find((c) => c.id === this.cutId);

    if (cut) {
      this.oldInPoint = cut.inPoint;
      this.oldOutPoint = cut.outPoint;
    }

    store.clearCutClipPoints(this.sceneId, this.cutId);
  }

  async undo(): Promise<void> {
    if (this.oldInPoint !== undefined && this.oldOutPoint !== undefined) {
      const store = useStore.getState();
      store.updateCutClipPoints(this.sceneId, this.cutId, this.oldInPoint, this.oldOutPoint);
    }
  }
}

interface AutoClipSimpleCommandDeps {
  analyzeRms?: (path: string, fps: number) => Promise<AudioAnalysis | null>;
}

type AutoClipOutcome = 'created' | 'noop' | 'invalid-target';

/**
 * 動画cutを簡易分割して clip cut を一括追加するコマンド
 * - 元cutは保持
 * - 分割cutは元cut直後へ挿入
 * - 追加cutはグループ化しない（通常cutとして追加）
 */
export class AutoClipSimpleCommand implements Command {
  type = 'AUTOCLIP_SIMPLE';
  description: string;

  private sceneId: string;
  private cutId: string;
  private mode: SimpleAutoClipMode;
  private analyzeRms: (path: string, fps: number) => Promise<AudioAnalysis | null>;

  private previousScene?: Scene;
  private nextScene?: Scene;
  private createdCount = 0;
  private outcome: AutoClipOutcome = 'noop';

  constructor(
    sceneId: string,
    cutId: string,
    mode: SimpleAutoClipMode = 'default',
    deps: AutoClipSimpleCommandDeps = {}
  ) {
    this.sceneId = sceneId;
    this.cutId = cutId;
    this.mode = mode;
    this.analyzeRms = deps.analyzeRms || analyzeAudioRms;
    this.description = `AutoClip (Simple): ${mode}`;
  }

  getCreatedCount(): number {
    return this.createdCount;
  }

  getOutcome(): AutoClipOutcome {
    return this.outcome;
  }

  private resolveDuration(sourceCut: Cut, asset: Asset): number | null {
    if (sourceCut.isClip && sourceCut.inPoint !== undefined && sourceCut.outPoint !== undefined) {
      const clipDuration = Math.abs(sourceCut.outPoint - sourceCut.inPoint);
      if (clipDuration > 0) return clipDuration;
    }
    if (typeof asset.duration === 'number' && Number.isFinite(asset.duration) && asset.duration > 0) {
      return asset.duration;
    }
    if (Number.isFinite(sourceCut.displayTime) && sourceCut.displayTime > 0) {
      return sourceCut.displayTime;
    }
    return null;
  }

  async execute(): Promise<void> {
    if (this.nextScene) {
      replaceScene(this.sceneId, this.nextScene);
      this.outcome = this.createdCount > 0 ? 'created' : 'noop';
      return;
    }

    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    if (!scene) {
      this.outcome = 'invalid-target';
      this.createdCount = 0;
      return;
    }

    const sourceIndex = scene.cuts.findIndex((c) => c.id === this.cutId);
    if (sourceIndex < 0) {
      this.outcome = 'invalid-target';
      this.createdCount = 0;
      return;
    }

    const sourceCut = scene.cuts[sourceIndex];
    const sourceAsset = resolveCutAsset(store, sourceCut);
    if (!sourceCut || !sourceAsset || sourceAsset.type !== 'video') {
      this.outcome = 'invalid-target';
      this.createdCount = 0;
      return;
    }

    const durationSec = this.resolveDuration(sourceCut, sourceAsset);
    if (!durationSec || durationSec <= 0) {
      this.outcome = 'invalid-target';
      this.createdCount = 0;
      return;
    }

    const splitPoints = await generateSimpleAutoClipSplitPoints({
      mode: this.mode,
      durationSec,
      sourcePath: sourceAsset.path,
      analyzeRms: this.analyzeRms,
    });
    if (splitPoints.length === 0) {
      this.outcome = 'noop';
      this.createdCount = 0;
      return;
    }

    const ranges = buildSimpleAutoClipRanges(durationSec, splitPoints);
    if (ranges.length === 0) {
      this.outcome = 'noop';
      this.createdCount = 0;
      return;
    }

    const sourceStart = sourceCut.isClip && sourceCut.inPoint !== undefined && sourceCut.outPoint !== undefined
      ? Math.min(sourceCut.inPoint, sourceCut.outPoint)
      : 0;

    const createdCuts: Cut[] = ranges.map((range) => ({
      ...cloneCut(sourceCut),
      id: uuidv4(),
      assetId: sourceAsset.id,
      asset: sourceAsset,
      displayTime: range.end - range.start,
      inPoint: sourceStart + range.start,
      outPoint: sourceStart + range.end,
      isClip: true,
      isLipSync: false,
      lipSyncFrameCount: undefined,
      subtitle: undefined,
    }));

    const nextCuts = [...scene.cuts];
    nextCuts.splice(sourceIndex + 1, 0, ...createdCuts);
    const normalizedCuts = nextCuts.map((cut, index) => ({ ...cut, order: index }));

    this.previousScene = cloneScene(scene);
    this.nextScene = {
      ...scene,
      cuts: normalizedCuts,
      groups: scene.groups ? scene.groups.map((group) => ({ ...group, cutIds: [...group.cutIds] })) : [],
    };
    this.createdCount = createdCuts.length;
    this.outcome = this.createdCount > 0 ? 'created' : 'noop';

    replaceScene(this.sceneId, this.nextScene);
  }

  async undo(): Promise<void> {
    if (!this.previousScene) return;
    replaceScene(this.sceneId, this.previousScene);
  }
}

/**
 * バッチ表示時間更新コマンド
 */
export class BatchUpdateDisplayTimeCommand implements Command {
  type = 'BATCH_UPDATE_DISPLAY_TIME';
  description: string;

  private updates: Array<{ sceneId: string; cutId: string; newTime: number }>;
  private oldTimes: Map<string, number> = new Map();

  constructor(updates: Array<{ sceneId: string; cutId: string; newTime: number }>) {
    this.updates = updates;
    this.description = `Update ${updates.length} cuts display time`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();

    // 古い値を保存
    this.updates.forEach(({ sceneId, cutId }) => {
      const scene = store.scenes.find((s) => s.id === sceneId);
      const cut = scene?.cuts.find((c) => c.id === cutId);
      if (cut) {
        this.oldTimes.set(cutId, cut.displayTime);
      }
    });

    // 新しい値を適用
    this.updates.forEach(({ sceneId, cutId, newTime }) => {
      store.updateCutDisplayTime(sceneId, cutId, newTime);
    });
  }

  async undo(): Promise<void> {
    const store = useStore.getState();

    // 古い値に戻す
    this.updates.forEach(({ sceneId, cutId }) => {
      const oldTime = this.oldTimes.get(cutId);
      if (oldTime !== undefined) {
        store.updateCutDisplayTime(sceneId, cutId, oldTime);
      }
    });
  }
}

/**
 * カットペーストコマンド
 */
export class PasteCutsCommand implements Command {
  type = 'PASTE_CUTS';
  description: string;

  private targetSceneId: string;
  private targetIndex?: number;
  private pastedCutIds: string[] = [];

  constructor(targetSceneId: string, targetIndex?: number) {
    this.targetSceneId = targetSceneId;
    this.targetIndex = targetIndex;
    this.description = 'Paste cuts';
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    this.pastedCutIds = store.pasteCuts(this.targetSceneId, this.targetIndex);
    this.description = `Paste ${this.pastedCutIds.length} cuts`;
  }

  async undo(): Promise<void> {
    if (this.pastedCutIds.length === 0) return;

    const store = useStore.getState();

    // 貼り付けたカットを削除
    for (const cutId of this.pastedCutIds) {
      store.removeCut(this.targetSceneId, cutId);
    }
  }
}

/**
 * 複数カット一括移動コマンド
 */
export class MoveCutsToSceneCommand implements Command {
  type = 'MOVE_CUTS_TO_SCENE';
  description: string;

  private cutIds: string[];
  private toSceneId: string;
  private toIndex: number;
  private originalPositions: Array<{ cutId: string; sceneId: string; index: number }> = [];

  constructor(cutIds: string[], toSceneId: string, toIndex: number) {
    this.cutIds = cutIds;
    this.toSceneId = toSceneId;
    this.toIndex = toIndex;
    this.description = `Move ${cutIds.length} cuts`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();

    // 元の位置を保存（移動前に取得）
    this.originalPositions = [];
    for (const cutId of this.cutIds) {
      for (const scene of store.scenes) {
        const index = scene.cuts.findIndex((c) => c.id === cutId);
        if (index !== -1) {
          this.originalPositions.push({ cutId, sceneId: scene.id, index });
          break;
        }
      }
    }

    // 一括移動を実行
    store.moveCutsToScene(this.cutIds, this.toSceneId, this.toIndex);
  }

  async undo(): Promise<void> {
    if (this.originalPositions.length === 0) return;

    const store = useStore.getState();

    // 逆順で元の位置に戻す（インデックスの整合性を保つため）
    const sortedPositions = [...this.originalPositions].sort((a, b) => b.index - a.index);

    for (const { cutId, sceneId, index } of sortedPositions) {
      // 現在のシーンから取得
      let currentSceneId: string | null = null;
      for (const scene of store.scenes) {
        if (scene.cuts.some((c) => c.id === cutId)) {
          currentSceneId = scene.id;
          break;
        }
      }

      if (currentSceneId) {
        store.moveCutToScene(currentSceneId, sceneId, cutId, index);
      }
    }
  }
}

/**
 * グループ作成コマンド
 */
export class CreateGroupCommand implements Command {
  type = 'CREATE_GROUP';
  description: string;

  private sceneId: string;
  private cutIds: string[];
  private groupName?: string;
  private groupId?: string;

  constructor(sceneId: string, cutIds: string[], name?: string) {
    this.sceneId = sceneId;
    this.cutIds = cutIds;
    this.groupName = name;
    this.description = `Create group with ${cutIds.length} cuts`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    this.groupId = store.createGroup(this.sceneId, this.cutIds, this.groupName);
  }

  async undo(): Promise<void> {
    if (!this.groupId) return;

    const store = useStore.getState();
    store.deleteGroup(this.sceneId, this.groupId);
  }
}

/**
 * グループ削除（解除）コマンド
 */
export class DeleteGroupCommand implements Command {
  type = 'DELETE_GROUP';
  description: string;

  private sceneId: string;
  private groupId: string;
  private deletedGroup?: CutGroup;

  constructor(sceneId: string, groupId: string) {
    this.sceneId = sceneId;
    this.groupId = groupId;
    this.description = 'Dissolve group';
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    this.deletedGroup = store.deleteGroup(this.sceneId, this.groupId) || undefined;
  }

  async undo(): Promise<void> {
    if (!this.deletedGroup) return;

    const store = useStore.getState();
    // Recreate group with same ID and properties
    store.createGroup(this.sceneId, this.deletedGroup.cutIds, this.deletedGroup.name);
  }
}

/**
 * グループ名変更コマンド
 */
export class RenameGroupCommand implements Command {
  type = 'RENAME_GROUP';
  description: string;

  private sceneId: string;
  private groupId: string;
  private newName: string;
  private oldName?: string;

  constructor(sceneId: string, groupId: string, newName: string) {
    this.sceneId = sceneId;
    this.groupId = groupId;
    this.newName = newName;
    this.description = `Rename group to ${newName}`;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const group = scene?.groups?.find((g) => g.id === this.groupId);

    if (group) {
      this.oldName = group.name;
    }

    store.renameGroup(this.sceneId, this.groupId, this.newName);
  }

  async undo(): Promise<void> {
    if (!this.oldName) return;

    const store = useStore.getState();
    store.renameGroup(this.sceneId, this.groupId, this.oldName);
  }
}

/**
 * シーン単位のアタッチ音声設定コマンド
 * - scene metadata に音声を設定
 * - 同一シーン内の動画cutの attachAudio/useEmbeddedAudio を一括更新
 */
export class SetSceneAttachAudioCommand implements Command {
  type = 'SET_SCENE_ATTACH_AUDIO';
  description: string;

  private sceneId: string;
  private audioAsset: Asset | null;
  private previousSceneBinding?: SceneAudioBinding;
  private previousCuts: Array<{ cutId: string; audioBindings: Cut['audioBindings']; useEmbeddedAudio: boolean }> = [];

  constructor(sceneId: string, audioAsset: Asset | null) {
    this.sceneId = sceneId;
    this.audioAsset = audioAsset;
    this.description = audioAsset
      ? `Set scene audio: ${audioAsset.name}`
      : 'Clear scene audio';
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    if (!scene) return;

    this.previousSceneBinding = store.getSceneAudioBinding(this.sceneId);
    this.previousCuts = scene.cuts
      .filter((cut) => {
        const cutAsset = resolveCutAsset(store, cut);
        return cutAsset?.type === 'video';
      })
      .map((cut) => ({
        cutId: cut.id,
        audioBindings: cut.audioBindings?.map((binding) => ({ ...binding })) || [],
        useEmbeddedAudio: cut.useEmbeddedAudio ?? true,
      }));

    if (this.audioAsset) {
      store.cacheAsset(this.audioAsset);
      store.setSceneAudioBinding(this.sceneId, {
        id: this.previousSceneBinding?.id || crypto.randomUUID(),
        audioAssetId: this.audioAsset.id,
        sourceName: getAssetDisplayName(this.audioAsset),
        gain: this.previousSceneBinding?.gain ?? 1,
        enabled: true,
        kind: 'scene',
      });
    } else {
      store.setSceneAudioBinding(this.sceneId, null);
    }

    for (const previousCut of this.previousCuts) {
      store.setCutAudioBindings(this.sceneId, previousCut.cutId, []);
      store.setCutUseEmbeddedAudio(this.sceneId, previousCut.cutId, false);
    }
  }

  async undo(): Promise<void> {
    const store = useStore.getState();
    store.setSceneAudioBinding(this.sceneId, this.previousSceneBinding || null);

    for (const previousCut of this.previousCuts) {
      store.setCutAudioBindings(this.sceneId, previousCut.cutId, previousCut.audioBindings || []);
      store.setCutUseEmbeddedAudio(this.sceneId, previousCut.cutId, previousCut.useEmbeddedAudio);
    }
  }
}

/**
 * グループ内カット順更新コマンド
 */
export class UpdateGroupCutOrderCommand implements Command {
  type = 'UPDATE_GROUP_CUT_ORDER';
  description = 'Update group cut order';

  private sceneId: string;
  private groupId: string;
  private nextCutIds: string[];
  private prevCutIds?: string[];

  constructor(sceneId: string, groupId: string, nextCutIds: string[]) {
    this.sceneId = sceneId;
    this.groupId = groupId;
    this.nextCutIds = nextCutIds;
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const group = scene?.groups?.find((g) => g.id === this.groupId);
    if (!group) return;
    this.prevCutIds = [...group.cutIds];
    store.updateGroupCutOrder(this.sceneId, this.groupId, this.nextCutIds);
  }

  async undo(): Promise<void> {
    if (!this.prevCutIds) return;
    const store = useStore.getState();
    store.updateGroupCutOrder(this.sceneId, this.groupId, this.prevCutIds);
  }
}

/**
 * カットをグループから削除コマンド
 */
export class RemoveCutFromGroupCommand implements Command {
  type = 'REMOVE_CUT_FROM_GROUP';
  description: string;

  private sceneId: string;
  private groupId: string;
  private cutId: string;
  private originalIndex?: number;
  private originalGroupName?: string;
  private originalGroupCollapsed?: boolean;
  private originalGroupCutIds?: string[];

  constructor(sceneId: string, groupId: string, cutId: string) {
    this.sceneId = sceneId;
    this.groupId = groupId;
    this.cutId = cutId;
    this.description = 'Remove cut from group';
  }

  async execute(): Promise<void> {
    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const group = scene?.groups?.find((g) => g.id === this.groupId);

    if (group) {
      this.originalIndex = group.cutIds.indexOf(this.cutId);
      this.originalGroupName = group.name;
      this.originalGroupCollapsed = group.isCollapsed;
      this.originalGroupCutIds = [...group.cutIds];
    }

    store.removeCutFromGroup(this.sceneId, this.groupId, this.cutId);
  }

  async undo(): Promise<void> {
    if (this.originalIndex === undefined || this.originalIndex === -1) return;

    const store = useStore.getState();
    const scene = store.scenes.find((s) => s.id === this.sceneId);
    const group = scene?.groups?.find((g) => g.id === this.groupId);

    if (!group) {
      const restoredOrder = this.originalGroupCutIds && this.originalGroupCutIds.length > 0
        ? [...this.originalGroupCutIds]
        : [this.cutId];
      useStore.setState((state) => ({
        scenes: state.scenes.map((s) =>
          s.id === this.sceneId
            ? {
                ...s,
                groups: [
                  ...(s.groups || []),
                  {
                    id: this.groupId,
                    name: this.originalGroupName || `Group ${Date.now()}`,
                    cutIds: restoredOrder,
                    isCollapsed: this.originalGroupCollapsed ?? true,
                  },
                ],
              }
            : s
        ),
      }));
      return;
    }

    const currentWithout = group.cutIds.filter((id) => id !== this.cutId);
    const insertAt = Math.min(Math.max(this.originalIndex, 0), currentWithout.length);
    const restoredOrder = [...currentWithout];
    restoredOrder.splice(insertAt, 0, this.cutId);
    store.updateGroupCutOrder(this.sceneId, this.groupId, restoredOrder);
  }
}
