import type { Asset, AssetIndexEntry, Scene } from '../../types';
import type { MissingAssetInfo, RecoveryDecision } from '../../components/MissingAssetRecoveryModal';
import { importFileToVault } from '../../utils/assetPath';
import { extractVideoMetadata } from '../../utils/videoUtils';
import { getAssetThumbnail } from '../thumbnails/api';
import { generateVideoClipThumbnail } from '../cut/clipThumbnail';
import { getCuttableMediaType } from '../../utils/mediaType';
import { cutAssetPathStartsWith, resolveCutAsset, resolveCutAssetId } from '../../utils/assetResolve';

export interface CutRelinkEventCandidate {
  sceneId: string;
  cutId: string;
  previousAssetId?: string;
  nextAssetId: string;
}

async function resolveAssetPath(asset: Asset, vaultPath: string): Promise<Asset> {
  if (asset.path.startsWith('assets/')) {
    const result = await window.electronAPI?.resolveVaultPath(vaultPath, asset.path);
    if (result?.exists) {
      return {
        ...asset,
        vaultRelativePath: asset.path,
        path: result.absolutePath || asset.path,
      };
    }
  }

  if (asset.vaultRelativePath && window.electronAPI) {
    const result = await window.electronAPI.resolveVaultPath(vaultPath, asset.vaultRelativePath);
    if (result?.exists) {
      return {
        ...asset,
        path: result.absolutePath || asset.path,
      };
    }
  }

  return asset;
}

export async function resolveScenesAssets(scenes: Scene[], vaultPath: string): Promise<{ scenes: Scene[]; missingAssets: MissingAssetInfo[] }> {
  const resolvedScenes: Scene[] = [];
  const missingAssets: MissingAssetInfo[] = [];
  const assetIndexById = new Map<string, AssetIndexEntry>();
  const hydratedAssetById = new Map<string, Asset>();

  if (window.electronAPI?.loadAssetIndex) {
    try {
      const index = await window.electronAPI.loadAssetIndex(vaultPath);
      for (const entry of index.assets || []) {
        if (entry?.id) {
          assetIndexById.set(entry.id, entry);
        }
      }
    } catch {
      // Keep best-effort path.
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
    if (window.electronAPI?.resolveVaultPath) {
      try {
        const resolved = await window.electronAPI.resolveVaultPath(vaultPath, vaultRelativePath);
        if (resolved?.exists && resolved.absolutePath) {
          absolutePath = resolved.absolutePath;
        }
      } catch {
        // Keep fallback path.
      }
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
        const currentAsset = resolveCutAsset(cut, () => undefined);
        const cutAssetId = resolveCutAssetId(cut, () => undefined);
        if (currentAsset || cutAssetId) {
          const baseAsset: Asset | undefined = currentAsset
            ? { ...currentAsset, id: cutAssetId || currentAsset.id }
            : (cutAssetId ? await hydrateAssetFromIndex(cutAssetId) : undefined);

          if (!baseAsset) return cut;

          let resolvedAsset = await resolveAssetPath(baseAsset, vaultPath);
          if ((!resolvedAsset.path || resolvedAsset.path.trim() === '') && cutAssetId) {
            resolvedAsset = (await hydrateAssetFromIndex(cutAssetId, resolvedAsset)) || resolvedAsset;
          }

          if (resolvedAsset.path && window.electronAPI) {
            const exists = await window.electronAPI.pathExists(resolvedAsset.path);
            if (!exists) {
              missingAssets.push({
                name: resolvedAsset.name || resolvedAsset.path,
                cutId: cut.id,
                sceneId: scene.id,
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

export function hasLegacyRelativeAssetPaths(scenes: Scene[]): boolean {
  return scenes.some((scene) =>
    scene.cuts?.some((cut) => cutAssetPathStartsWith(cut, () => undefined, 'assets/'))
  );
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

export function normalizeLoadedProjectVersion(version: number | undefined, scenes: Scene[]): { version: number; wasMissing: boolean } {
  if (Number.isFinite(version) && (version as number) > 0) {
    return { version: Math.floor(version as number), wasMissing: false };
  }
  return {
    version: hasLegacyRelativeAssetPaths(scenes) ? 2 : 3,
    wasMissing: true,
  };
}

export async function applyRecoveryDecisionsToScenes(
  scenes: Scene[],
  vaultPath: string,
  recoveryDecisions?: RecoveryDecision[]
): Promise<Scene[]> {
  let finalScenes = scenes;
  if (!recoveryDecisions || recoveryDecisions.length === 0) {
    return finalScenes;
  }

  for (const decision of recoveryDecisions) {
    if (decision.action === 'delete') {
      finalScenes = finalScenes.map((scene) => {
        if (scene.id === decision.sceneId) {
          return {
            ...scene,
            cuts: scene.cuts.filter((cut) => cut.id !== decision.cutId),
          };
        }
        return scene;
      });
      continue;
    }

    if (decision.action !== 'relink' || !decision.newPath) {
      continue;
    }

    finalScenes = await Promise.all(finalScenes.map(async (scene) => {
      if (scene.id !== decision.sceneId) return scene;
      const updatedCuts = await Promise.all(scene.cuts.map(async (cut) => {
        const currentAsset = resolveCutAsset(cut, () => undefined);
        if (cut.id !== decision.cutId || !currentAsset) {
          return cut;
        }

        const newPath = decision.newPath!;
        const newName = newPath.split(/[/\\]/).pop() || currentAsset.name;
        const newType = getCuttableMediaType(newName) || 'image';

        let thumbnail: string | undefined;
        let duration: number | undefined;
        let metadata: { width?: number; height?: number } | undefined;

        if (newType === 'video') {
          const videoMeta = await extractVideoMetadata(newPath);
          if (videoMeta) {
            duration = videoMeta.duration;
            metadata = { width: videoMeta.width, height: videoMeta.height };
          }
          const thumb = await getAssetThumbnail('timeline-card', {
            path: newPath,
            type: 'video',
            timeOffset: 0,
          });
          if (thumb) {
            thumbnail = thumb;
          }
        } else {
          const base64 = await getAssetThumbnail('timeline-card', {
            path: newPath,
            type: 'image',
          });
          if (base64) {
            thumbnail = base64;
          }
        }

        const importedAsset = await importFileToVault(
          newPath,
          vaultPath,
          resolveCutAssetId(cut, () => undefined) || currentAsset.id,
          {
            name: newName,
            type: newType,
            thumbnail,
            duration,
            metadata,
          }
        );

        if (importedAsset) {
          return {
            ...cut,
            asset: { ...importedAsset, thumbnail, duration, metadata },
            displayTime: newType === 'video' && duration ? duration : cut.displayTime,
          };
        }

        return {
          ...cut,
          asset: { ...currentAsset, path: newPath, name: newName, type: newType, thumbnail, duration, metadata },
          displayTime: newType === 'video' && duration ? duration : cut.displayTime,
        };
      }));
      return { ...scene, cuts: updatedCuts };
    }));
  }

  return finalScenes;
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
      const currentAsset = resolveCutAsset(cut, () => undefined);
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
