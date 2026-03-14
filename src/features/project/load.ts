import type { Asset, AssetIndex, AssetIndexEntry, Cut, Scene } from '../../types';
import type { MissingAssetInfo, RecoveryDecision } from '../../components/MissingAssetRecoveryModal';
import { registerAssetFile } from '../asset/write';
import { readCanonicalAssetMetadataForPath } from '../metadata/provider';
import { getAssetThumbnail } from '../thumbnails/api';
import { generateVideoClipThumbnail } from '../cut/clipThumbnail';
import { getCuttableMediaType } from '../../utils/mediaType';
import {
  resolveCutAssetId,
  resolveCutAssetSeed,
  resolveCutAssetSnapshot,
} from '../../utils/assetResolve';
import {
  readAssetIndexBridge,
  pathExistsBridge,
  resolveVaultPathBridge,
} from '../platform/electronGateway';

export interface CutRelinkEventCandidate {
  sceneId: string;
  cutId: string;
  previousAssetId?: string;
  nextAssetId: string;
}

export interface RecoveryRelinkPlan {
  relinkToken: string;
  sceneId: string;
  cutId: string;
  newPath: string;
}

export interface PlannedRecoverySceneChanges {
  scenes: Scene[];
  relinks: RecoveryRelinkPlan[];
}

export interface CommittedRecoveryRelink {
  relinkToken: string;
  sceneId: string;
  cutId: string;
  assetId: string;
  asset: Asset;
}

export interface FailedRecoveryRelink {
  relinkToken: string;
  sceneId: string;
  cutId: string;
  assetId?: string;
  reason: 'cut-missing' | 'asset-seed-missing' | 'draft-failed' | 'register-failed';
  message: string;
}

export interface CommitRecoverySceneChangesResult {
  status: 'success' | 'partial' | 'failed';
  scenes: Scene[];
  committedRelinks: CommittedRecoveryRelink[];
  failedRelinks: FailedRecoveryRelink[];
  errors: FailedRecoveryRelink[];
}

function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function inferRecoveryAssetType(cut: Cut, fallback?: Asset, pathHint?: string): Asset['type'] {
  const hinted = getCuttableMediaType(pathHint || fallback?.name || '');
  if (hinted) return hinted;
  if (fallback?.type) return fallback.type;
  return cut.isClip ? 'video' : 'image';
}

function buildRecoveryAssetSeed(
  cut: Cut,
  assetId: string,
  fallback?: Asset,
  pathHint?: string,
): Asset {
  const hintedName = pathHint ? getFileName(pathHint) : '';
  return {
    ...(fallback || {}),
    id: assetId,
    name: fallback?.name || hintedName || assetId,
    path: fallback?.path || '',
    type: inferRecoveryAssetType(cut, fallback, pathHint),
  };
}

async function resolveAssetPath(asset: Asset, vaultPath: string): Promise<Asset> {
  if (asset.path.startsWith('assets/')) {
    const result = await resolveVaultPathBridge(vaultPath, asset.path);
    if (result?.exists) {
      return {
        ...asset,
        vaultRelativePath: asset.path,
        path: result.absolutePath || asset.path,
      };
    }
  }

  if (asset.vaultRelativePath) {
    const result = await resolveVaultPathBridge(vaultPath, asset.vaultRelativePath);
    if (result?.exists) {
      return {
        ...asset,
        path: result.absolutePath || asset.path,
      };
    }
  }

  return asset;
}

export async function resolveScenesAssets(
  scenes: Scene[],
  vaultPath: string,
  options: { assetIndex?: AssetIndex | null } = {}
): Promise<{ scenes: Scene[]; missingAssets: MissingAssetInfo[] }> {
  const resolvedScenes: Scene[] = [];
  const missingAssets: MissingAssetInfo[] = [];
  const assetIndexById = new Map<string, AssetIndexEntry>();
  const hydratedAssetById = new Map<string, Asset>();

  let index = options.assetIndex;
  if (index === undefined) {
    const readResult = await readAssetIndexBridge(vaultPath).catch(() => ({
      kind: 'unreadable' as const,
    }));
    index = readResult.kind === 'readable' ? readResult.index : null;
  }

  for (const entry of index?.assets || []) {
    if (entry?.id) {
      assetIndexById.set(entry.id, entry);
    }
  }

  const hydrateAssetFromIndex = async (assetId: string, fallback?: Asset): Promise<Asset | undefined> => {
    if (!assetId) return fallback;
    const cached = hydratedAssetById.get(assetId);
    if (cached) return cached;

    const indexEntry = assetIndexById.get(assetId);
    if (!indexEntry) return fallback;

    const vaultRelativePath = `assets/${indexEntry.filename}`;
    let absolutePath = fallback?.path || '';
    try {
      const resolved = await resolveVaultPathBridge(vaultPath, vaultRelativePath);
      if (resolved?.exists && resolved.absolutePath) {
        absolutePath = resolved.absolutePath;
      }
    } catch {
      // Keep fallback path.
    }

    const hydrated: Asset = {
      ...(fallback || {}),
      id: assetId,
      name: fallback?.name || indexEntry.originalName || indexEntry.filename || assetId,
      path: absolutePath || vaultRelativePath,
      type: fallback?.type || indexEntry.type,
      vaultRelativePath,
      originalPath: fallback?.originalPath || indexEntry.originalPath,
      hash: fallback?.hash || indexEntry.hash,
      fileSize: fallback?.fileSize ?? indexEntry.fileSize,
    };

    hydratedAssetById.set(assetId, hydrated);
    return hydrated;
  };

  for (const scene of scenes) {
    const resolvedCuts = await Promise.all(
      scene.cuts.map(async (cut) => {
        const currentAsset = resolveCutAssetSeed(cut, () => undefined);
        const cutAssetId = resolveCutAssetId(cut, () => undefined);
        if (currentAsset || cutAssetId) {
          const baseAsset: Asset | undefined = currentAsset
            ? { ...currentAsset, id: cutAssetId || currentAsset.id }
            : (cutAssetId ? await hydrateAssetFromIndex(cutAssetId) : undefined);

          if (!baseAsset) {
            if (!cutAssetId) return cut;
            const unresolvedAsset = buildRecoveryAssetSeed(cut, cutAssetId, currentAsset ?? undefined);
            missingAssets.push({
              name: unresolvedAsset.name || cutAssetId,
              cutId: cut.id,
              sceneId: scene.id,
              sceneName: scene.name,
              asset: unresolvedAsset,
            });
            return {
              ...cut,
              assetId: cutAssetId,
              asset: unresolvedAsset,
            };
          }

          let resolvedAsset = await resolveAssetPath(baseAsset, vaultPath);
          if ((!resolvedAsset.path || resolvedAsset.path.trim() === '') && cutAssetId) {
            resolvedAsset = (await hydrateAssetFromIndex(cutAssetId, resolvedAsset)) || resolvedAsset;
          }

          if (!resolvedAsset.path || resolvedAsset.path.trim() === '') {
            missingAssets.push({
              name: resolvedAsset.name || cutAssetId || cut.id,
              cutId: cut.id,
              sceneId: scene.id,
              sceneName: scene.name,
              asset: resolvedAsset,
            });
          } else {
            const exists = await pathExistsBridge(resolvedAsset.path);
            if (!exists) {
              missingAssets.push({
                name: resolvedAsset.name || resolvedAsset.path,
                cutId: cut.id,
                sceneId: scene.id,
                sceneName: scene.name,
                asset: resolvedAsset,
              });
            }
          }

          return {
            ...cut,
            assetId: cutAssetId || resolvedAsset.id,
            asset: resolvedAsset,
          };
        }
        return cut;
      })
    );

    resolvedScenes.push({
      ...scene,
      cuts: resolvedCuts,
    });
  }

  return { scenes: resolvedScenes, missingAssets };
}

function getVaultPathFromProjectFile(projectPath: string): string {
  return projectPath
    .replace(/[/\\]project\.sdp$/, '')
    .replace(/[/\\][^/\\]+\.sdp$/, '');
}

function normalizePathForCompare(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function resolveLoadedVaultPath(projectVaultPath: string | undefined, projectPath: string): string {
  const fromProjectFile = getVaultPathFromProjectFile(projectPath);
  if (!projectVaultPath) return fromProjectFile;
  if (normalizePathForCompare(projectVaultPath) !== normalizePathForCompare(fromProjectFile)) {
    console.warn('[ProjectLoad] vaultPath mismatch. Using project file directory.', {
      embeddedVaultPath: projectVaultPath,
      projectFileDir: fromProjectFile,
      projectPath,
    });
    return fromProjectFile;
  }
  return projectVaultPath;
}

export async function applyRecoveryDecisionsToScenes(
  scenes: Scene[],
  vaultPath: string,
  recoveryDecisions?: RecoveryDecision[]
): Promise<Scene[]> {
  const plan = await planRecoverySceneChanges(scenes, recoveryDecisions);
  const commit = await commitRecoverySceneChanges(plan, vaultPath);
  return commit.scenes;
}

async function buildRecoveryRelinkAssetDraft(newPath: string, currentAsset: Asset): Promise<Asset> {
  const newName = newPath.split(/[/\\]/).pop() || currentAsset.name;
  const newType = getCuttableMediaType(newName) || 'image';
  const canonicalMetadata = await readCanonicalAssetMetadataForPath(newPath, newType, {
    duration: currentAsset.duration,
    fileSize: currentAsset.fileSize,
    metadata: currentAsset.metadata,
  });

  let thumbnail: string | undefined;
  if (newType === 'video') {
    thumbnail = await getAssetThumbnail('timeline-card', {
      path: newPath,
      type: 'video',
      timeOffset: 0,
    }) || undefined;
  } else {
    thumbnail = await getAssetThumbnail('timeline-card', {
      path: newPath,
      type: 'image',
    }) || undefined;
  }

  return {
    ...currentAsset,
    name: newName,
    path: newPath,
    type: newType,
    thumbnail,
    duration: canonicalMetadata.duration,
    metadata: canonicalMetadata.metadata,
    fileSize: canonicalMetadata.fileSize,
    originalPath: newPath,
  };
}

function cloneRecoveryAsset(asset: Asset | undefined): Asset | undefined {
  if (!asset) return undefined;
  return {
    ...asset,
    metadata: asset.metadata ? { ...asset.metadata } : undefined,
  };
}

function cloneRecoveryCut(cut: Cut): Cut {
  return {
    ...cut,
    asset: cloneRecoveryAsset(resolveCutAssetSnapshot(cut) ?? undefined),
    framing: cut.framing ? { ...cut.framing } : undefined,
    audioBindings: Array.isArray(cut.audioBindings)
      ? cut.audioBindings.map((binding) => ({ ...binding }))
      : undefined,
  };
}

function cloneRecoveryScene(scene: Scene): Scene {
  return {
    ...scene,
    notes: Array.isArray(scene.notes) ? scene.notes.map((note) => ({ ...note })) : [],
    cuts: Array.isArray(scene.cuts) ? scene.cuts.map(cloneRecoveryCut) : [],
    groups: Array.isArray(scene.groups)
      ? scene.groups.map((group) => ({
          ...group,
          cutIds: Array.isArray(group.cutIds) ? [...group.cutIds] : [],
        }))
      : undefined,
  };
}

export async function planRecoverySceneChanges(
  scenes: Scene[],
  recoveryDecisions?: RecoveryDecision[]
): Promise<PlannedRecoverySceneChanges> {
  let plannedScenes = scenes.map(cloneRecoveryScene);
  const relinks: RecoveryRelinkPlan[] = [];

  if (!recoveryDecisions || recoveryDecisions.length === 0) {
    return { scenes: plannedScenes, relinks };
  }

  for (const decision of recoveryDecisions) {
    if (decision.action === 'delete') {
      plannedScenes = plannedScenes.map((scene) => {
        if (scene.id !== decision.sceneId) return scene;
        return {
          ...scene,
          cuts: scene.cuts.filter((cut) => cut.id !== decision.cutId),
        };
      });
      continue;
    }

    if (decision.action !== 'relink' || !decision.newPath) {
      continue;
    }

    plannedScenes = plannedScenes.map((scene) => {
      if (scene.id !== decision.sceneId) return scene;
      const updatedCuts = scene.cuts.map((cut) => {
        if (cut.id !== decision.cutId) {
          return cut;
        }
        relinks.push({
          relinkToken: `${scene.id}::${cut.id}::${relinks.length}`,
          sceneId: scene.id,
          cutId: cut.id,
          newPath: decision.newPath!,
        });
        return cut;
      });
      return { ...scene, cuts: updatedCuts };
    });
  }

  return {
    scenes: plannedScenes,
    relinks,
  };
}

export async function commitRecoverySceneChanges(
  plan: PlannedRecoverySceneChanges,
  vaultPath: string
): Promise<CommitRecoverySceneChangesResult> {
  let committedScenes = plan.scenes.map(cloneRecoveryScene);

  if (plan.relinks.length === 0) {
    return {
      status: 'success',
      scenes: committedScenes,
      committedRelinks: [],
      failedRelinks: [],
      errors: [],
    };
  }
  const committedRelinks: CommittedRecoveryRelink[] = [];
  const failedRelinks: FailedRecoveryRelink[] = [];

  for (const relink of plan.relinks) {
    const cut = findCutInScenes(committedScenes, relink.sceneId, relink.cutId);
    if (!cut) {
      failedRelinks.push({
        relinkToken: relink.relinkToken,
        sceneId: relink.sceneId,
        cutId: relink.cutId,
        reason: 'cut-missing',
        message: 'Target cut was not found during recovery commit.',
      });
      continue;
    }

    const currentAsset = resolveCutAssetSeed(cut, () => undefined);
    const assetId = resolveCutAssetId(cut, () => undefined) || currentAsset?.id || cut.assetId;
    if (!assetId) {
      failedRelinks.push({
        relinkToken: relink.relinkToken,
        sceneId: relink.sceneId,
        cutId: relink.cutId,
        reason: 'asset-seed-missing',
        message: 'Recovery relink requires a resolvable assetId.',
      });
      continue;
    }
    const recoverySeed = currentAsset ?? buildRecoveryAssetSeed(cut, assetId, undefined, relink.newPath);

    let draftedAsset: Asset;
    try {
      draftedAsset = {
        ...(await buildRecoveryRelinkAssetDraft(relink.newPath, recoverySeed)),
        id: assetId,
      };
    } catch (error) {
      failedRelinks.push({
        relinkToken: relink.relinkToken,
        sceneId: relink.sceneId,
        cutId: relink.cutId,
        assetId,
        reason: 'draft-failed',
        message: error instanceof Error
          ? error.message
          : `Failed to prepare recovery draft asset for ${relink.newPath}.`,
      });
      continue;
    }

    let registered: Awaited<ReturnType<typeof registerAssetFile>>;
    try {
      registered = await registerAssetFile({
        sourcePath: relink.newPath,
        vaultPath,
        assetId,
        existingAsset: draftedAsset,
      });
    } catch (error) {
      failedRelinks.push({
        relinkToken: relink.relinkToken,
        sceneId: relink.sceneId,
        cutId: relink.cutId,
        assetId,
        reason: 'register-failed',
        message: error instanceof Error
          ? error.message
          : `Failed to register recovery asset from ${relink.newPath}.`,
      });
      continue;
    }

    if (!registered?.asset) {
      failedRelinks.push({
        relinkToken: relink.relinkToken,
        sceneId: relink.sceneId,
        cutId: relink.cutId,
        assetId,
        reason: 'register-failed',
        message: `Failed to register recovery asset from ${relink.newPath}.`,
      });
      continue;
    }

    const finalAsset = cloneRecoveryAsset(registered.asset);
    if (!finalAsset) {
      failedRelinks.push({
        relinkToken: relink.relinkToken,
        sceneId: relink.sceneId,
        cutId: relink.cutId,
        assetId,
        reason: 'register-failed',
        message: `Recovery asset registration returned an empty asset for ${relink.newPath}.`,
      });
      continue;
    }

    committedScenes = committedScenes.map((scene) => {
      if (scene.id !== relink.sceneId) return scene;
      return {
        ...scene,
        cuts: scene.cuts.map((candidate) => {
          if (candidate.id !== relink.cutId) return candidate;
          return {
            ...candidate,
            assetId: finalAsset.id,
            asset: cloneRecoveryAsset(finalAsset),
            displayTime:
              finalAsset.type === 'video' && finalAsset.duration
                ? finalAsset.duration
                : candidate.displayTime,
          };
        }),
      };
    });
    committedRelinks.push({
      relinkToken: relink.relinkToken,
      sceneId: relink.sceneId,
      cutId: relink.cutId,
      assetId,
      asset: cloneRecoveryAsset(finalAsset) as Asset,
    });
  }

  return {
    status:
      failedRelinks.length === 0
        ? 'success'
        : committedRelinks.length > 0
          ? 'partial'
          : 'failed',
    scenes: committedScenes,
    committedRelinks,
    failedRelinks,
    errors: failedRelinks,
  };
}

function findCutInScenes(scenes: Scene[], sceneId: string, cutId: string): Cut | undefined {
  return scenes.find((scene) => scene.id === sceneId)?.cuts.find((cut) => cut.id === cutId);
}

export function collectRecoveryRelinkEventCandidates(
  beforeScenes: Scene[],
  afterScenes: Scene[],
  recoveryDecisions?: RecoveryDecision[]
): CutRelinkEventCandidate[] {
  if (!recoveryDecisions || recoveryDecisions.length === 0) {
    return [];
  }

  const beforeAssetIdByCut = new Map<string, string | undefined>();
  const afterAssetIdByCut = new Map<string, string | undefined>();

  const toKey = (sceneId: string, cutId: string) => `${sceneId}::${cutId}`;

  for (const scene of beforeScenes) {
    for (const cut of scene.cuts) {
      beforeAssetIdByCut.set(toKey(scene.id, cut.id), resolveCutAssetId(cut, () => undefined) ?? undefined);
    }
  }

  for (const scene of afterScenes) {
    for (const cut of scene.cuts) {
      afterAssetIdByCut.set(toKey(scene.id, cut.id), resolveCutAssetId(cut, () => undefined) ?? undefined);
    }
  }

  const candidates: CutRelinkEventCandidate[] = [];
  for (const decision of recoveryDecisions) {
    if (decision.action !== 'relink') {
      continue;
    }
    const key = toKey(decision.sceneId, decision.cutId);
    const previousAssetId = beforeAssetIdByCut.get(key);
    const nextAssetId = afterAssetIdByCut.get(key);
    if (!nextAssetId || previousAssetId === nextAssetId) {
      continue;
    }
    candidates.push({
      sceneId: decision.sceneId,
      cutId: decision.cutId,
      previousAssetId,
      nextAssetId,
    });
  }

  return candidates;
}

export async function regenerateCutClipThumbnails(scenes: Scene[]): Promise<Scene[]> {
  return Promise.all(scenes.map(async (scene) => {
    const updatedCuts = await Promise.all(scene.cuts.map(async (cut) => {
      const currentAsset = resolveCutAssetSeed(cut, () => undefined);
      if (cut.isClip && cut.inPoint !== undefined && currentAsset?.type === 'video' && currentAsset.path) {
        const newThumbnail = await generateVideoClipThumbnail(
          cut.id,
          currentAsset.path,
          cut.inPoint,
          cut.outPoint
        );
        if (newThumbnail) {
          return {
            ...cut,
            asset: { ...currentAsset, thumbnail: newThumbnail },
          };
        }
      }
      return cut;
    }));
    return { ...scene, cuts: updatedCuts };
  }));
}
