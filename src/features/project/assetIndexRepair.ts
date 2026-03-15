import type { Asset, AssetIndex, AssetIndexEntry, Scene } from '../../types';
import { resolveCutAssetId, resolveCutAssetSeed } from '../../utils/assetResolve';
import { getMediaType } from '../../utils/mediaType';
import { buildDerivedAssetIndexForSave } from '../../utils/projectSave';
import {
  calculateFileHashBridge,
  getFileInfoBridge,
  getRelativePathBridge,
  resolveVaultPathBridge,
  saveAssetIndexBridge,
  withSerializedAssetIndexMutationBridge,
  type AssetIndexReadResult,
} from '../platform/electronGateway';
import {
  evaluateProjectAssetIntegrity,
  planProjectAssetIndexAction,
  type ProjectAssetIndexAction,
  type ProjectAssetIntegrityEvaluation,
} from './assetIntegrity';

export interface ProjectAssetIndexRepairEntryDraft {
  assetId: string;
  filename: string;
  absolutePath: string;
  vaultRelativePath: string;
  originalName: string;
  originalPath: string;
  type: Asset['type'];
  fileSize: number;
  hash: string;
  importedAt: string;
}

export interface ProjectAssetIndexRepairContext {
  referencedAssetIds: string[];
  requiredAssetIds: string[];
  repairableEntries: ProjectAssetIndexRepairEntryDraft[];
  unrepairableAssetIds: string[];
  mismatchedIndexedAssetIds: string[];
  canRepairReferencedEntriesFromProject: boolean;
}

export interface PreparedProjectAssetIndexState {
  assetIndex: AssetIndexReadResult;
  integrity: ProjectAssetIntegrityEvaluation;
  repairContext: ProjectAssetIndexRepairContext;
  action: ProjectAssetIndexAction;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function cloneAssetIndexEntry(entry: AssetIndexEntry): AssetIndexEntry {
  return {
    ...entry,
    usageRefs: Array.isArray(entry.usageRefs)
      ? entry.usageRefs.map((usageRef) => ({ ...usageRef }))
      : undefined,
  };
}

function toAssetIndexEntry(entry: ProjectAssetIndexRepairEntryDraft): AssetIndexEntry {
  return {
    id: entry.assetId,
    hash: entry.hash,
    filename: entry.filename,
    originalName: entry.originalName,
    originalPath: entry.originalPath,
    type: entry.type,
    fileSize: entry.fileSize,
    importedAt: entry.importedAt,
  };
}

async function collectSeedRelativePaths(seed: Asset, vaultPath: string): Promise<string[]> {
  const candidates = new Set<string>();

  if (typeof seed.vaultRelativePath === 'string' && seed.vaultRelativePath.trim().length > 0) {
    const normalized = normalizeRelativePath(seed.vaultRelativePath);
    if (normalized.startsWith('assets/')) {
      candidates.add(normalized);
    }
  }

  if (typeof seed.path === 'string' && seed.path.trim().length > 0) {
    const normalized = normalizeRelativePath(seed.path);
    if (normalized.startsWith('assets/')) {
      candidates.add(normalized);
    } else {
      const derived = await getRelativePathBridge(vaultPath, seed.path);
      const relative = typeof derived === 'string' ? normalizeRelativePath(derived) : '';
      if (relative.startsWith('assets/')) {
        candidates.add(relative);
      }
    }
  }

  return [...candidates];
}

async function buildRepairEntryDraft(
  assetId: string,
  seeds: Asset[],
  vaultPath: string
): Promise<ProjectAssetIndexRepairEntryDraft | null> {
  for (const seed of seeds) {
    const relativePaths = await collectSeedRelativePaths(seed, vaultPath);
    for (const vaultRelativePath of relativePaths) {
      const resolved = await resolveVaultPathBridge(vaultPath, vaultRelativePath);
      if (!resolved.exists || !resolved.absolutePath) continue;

      const fileInfo = await getFileInfoBridge(resolved.absolutePath);
      const hash = await calculateFileHashBridge(resolved.absolutePath);
      const filename = basename(vaultRelativePath);
      const type = getMediaType(filename) || fileInfo?.type || seed.type;

      if (!fileInfo || !hash || !type || !Number.isFinite(fileInfo.size) || fileInfo.size <= 0) {
        continue;
      }

      return {
        assetId,
        filename,
        absolutePath: resolved.absolutePath,
        vaultRelativePath,
        originalName: seed.name || filename,
        originalPath: seed.originalPath || vaultRelativePath,
        type,
        fileSize: fileInfo.size,
        hash,
        importedAt: new Date().toISOString(),
      };
    }
  }

  return null;
}

export async function buildProjectAssetIndexRepairContext(input: {
  scenes: Scene[];
  vaultPath: string;
  assetIds: string[];
}): Promise<ProjectAssetIndexRepairContext> {
  const referencedAssetIds = [...new Set(input.assetIds)];
  if (referencedAssetIds.length === 0) {
    return {
      referencedAssetIds,
      requiredAssetIds: [],
      repairableEntries: [],
      unrepairableAssetIds: [],
      mismatchedIndexedAssetIds: [],
      canRepairReferencedEntriesFromProject: true,
    };
  }

  const seedMap = new Map<string, Asset[]>();
  for (const scene of input.scenes) {
    for (const cut of scene.cuts) {
      const assetId = resolveCutAssetId(cut, () => undefined);
      const seed = resolveCutAssetSeed(cut, () => undefined);
      if (!assetId || !seed) continue;
      const existing = seedMap.get(assetId) || [];
      existing.push(seed);
      seedMap.set(assetId, existing);
    }
  }

  const repairableEntries: ProjectAssetIndexRepairEntryDraft[] = [];
  const unrepairableAssetIds: string[] = [];

  for (const assetId of referencedAssetIds) {
    const draft = await buildRepairEntryDraft(assetId, seedMap.get(assetId) || [], input.vaultPath);
    if (draft) {
      repairableEntries.push(draft);
    } else {
      unrepairableAssetIds.push(assetId);
    }
  }

  return {
    referencedAssetIds,
    requiredAssetIds: referencedAssetIds,
    repairableEntries,
    unrepairableAssetIds,
    mismatchedIndexedAssetIds: [],
    canRepairReferencedEntriesFromProject: unrepairableAssetIds.length === 0,
  };
}

export async function prepareProjectAssetIndexState(input: {
  scenes: Scene[];
  sceneOrder?: string[];
  vaultPath: string;
  assetIndex: AssetIndexReadResult;
}): Promise<PreparedProjectAssetIndexState> {
  const currentIndex = input.assetIndex.kind === 'readable' ? input.assetIndex.index : null;
  const integrityBase = evaluateProjectAssetIntegrity(input.scenes, currentIndex, input.sceneOrder);
  const repairCandidates = await buildProjectAssetIndexRepairContext({
    scenes: input.scenes,
    vaultPath: input.vaultPath,
    assetIds: integrityBase.referencedAssetIds,
  });
  const repairEntryById = new Map(
    repairCandidates.repairableEntries.map((entry) => [entry.assetId, entry] as const)
  );
  const mismatchedIndexedAssetIds = currentIndex
    ? integrityBase.indexedReferencedAssetIds.filter((assetId) => {
        const indexEntry = currentIndex.assets.find((entry) => entry.id === assetId);
        const repairEntry = repairEntryById.get(assetId);
        if (!indexEntry || !repairEntry) return false;
        return repairEntry.vaultRelativePath !== `assets/${indexEntry.filename}`;
      })
    : [];
  const requiredAssetIds = currentIndex
    ? [...new Set([...integrityBase.unindexedReferencedAssetIds, ...mismatchedIndexedAssetIds])]
    : integrityBase.referencedAssetIds;
  const repairContext: ProjectAssetIndexRepairContext = {
    referencedAssetIds: repairCandidates.referencedAssetIds,
    requiredAssetIds,
    repairableEntries: repairCandidates.repairableEntries.filter((entry) => requiredAssetIds.includes(entry.assetId)),
    unrepairableAssetIds: requiredAssetIds.filter((assetId) => !repairEntryById.has(assetId)),
    mismatchedIndexedAssetIds,
    canRepairReferencedEntriesFromProject: requiredAssetIds.every((assetId) => repairEntryById.has(assetId)),
  };
  const integrity: ProjectAssetIntegrityEvaluation = {
    ...integrityBase,
    mismatchedIndexedAssetIds,
    status: integrityBase.unindexedReferencedAssetIds.length > 0 || mismatchedIndexedAssetIds.length > 0
      ? 'referenced-asset-mismatch'
      : integrityBase.status,
  };
  const action = planProjectAssetIndexAction({
    indexState: input.assetIndex.kind,
    integrity,
    canRepairReferencedEntriesFromProject: repairContext.canRepairReferencedEntriesFromProject,
  });

  return {
    assetIndex: input.assetIndex,
    integrity,
    repairContext,
    action,
  };
}

export function buildRepairedAssetIndexFromProject(input: {
  scenes: Scene[];
  sceneOrder?: string[];
  assetIndex: AssetIndexReadResult;
  repairContext: ProjectAssetIndexRepairContext;
}): AssetIndex {
  const baseIndex: AssetIndex = input.assetIndex.kind === 'readable'
    ? {
        version: input.assetIndex.index.version,
        assets: input.assetIndex.index.assets.map(cloneAssetIndexEntry),
      }
    : {
        version: 1,
        assets: [],
      };

  const replaceIds = new Set(input.repairContext.requiredAssetIds);
  const entryById = new Map(baseIndex.assets.map((entry) => [entry.id, entry] as const));
  for (const repairEntry of input.repairContext.repairableEntries) {
    if (replaceIds.has(repairEntry.assetId) || !entryById.has(repairEntry.assetId)) {
      entryById.set(repairEntry.assetId, toAssetIndexEntry(repairEntry));
    }
  }

  baseIndex.assets = Array.from(entryById.values());

  return buildDerivedAssetIndexForSave(baseIndex, input.scenes, input.sceneOrder);
}

export async function repairProjectAssetIndexFromProject(input: {
  scenes: Scene[];
  sceneOrder?: string[];
  vaultPath: string;
  assetIndex: AssetIndexReadResult;
  repairContext: ProjectAssetIndexRepairContext;
}): Promise<AssetIndex | null> {
  if (input.repairContext.unrepairableAssetIds.length > 0) {
    return null;
  }

  const repairedIndex = buildRepairedAssetIndexFromProject({
    scenes: input.scenes,
    sceneOrder: input.sceneOrder,
    assetIndex: input.assetIndex,
    repairContext: input.repairContext,
  });

  const saved = await withSerializedAssetIndexMutationBridge(async () =>
    saveAssetIndexBridge(input.vaultPath, repairedIndex)
  );
  return saved ? repairedIndex : null;
}
