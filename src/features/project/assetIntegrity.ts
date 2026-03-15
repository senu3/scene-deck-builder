import type { AssetIndex, AssetUsageRef, Scene } from '../../types';
import { resolveCutAssetId } from '../../utils/assetResolve';
import { buildDerivedAssetIndexForSave } from '../../utils/projectSave';
import type { AssetIndexReadResult } from '../platform/electronGateway';

export type AssetIndexState = AssetIndexReadResult['kind'];

export type ProjectAssetIntegrityStatus =
  | 'ok'
  | 'usage-mismatch-only'
  | 'referenced-asset-mismatch';

export type ProjectAssetIndexActionReason =
  | 'ok'
  | 'index-missing-rebuildable'
  | 'index-missing-unrebuildable'
  | 'index-unreadable'
  | 'index-invalid-schema'
  | 'usage-mismatch-only'
  | 'referenced-asset-mismatch'
  | 'project-vault-link-broken';

export type ProjectAssetIndexAction =
  | {
      kind: 'load';
      reason: 'ok';
    }
  | {
      kind: 'repair-silent';
      reason: 'index-missing-rebuildable' | 'usage-mismatch-only';
    }
  | {
      kind: 'repair-confirm';
      reason: 'index-unreadable' | 'index-invalid-schema' | 'referenced-asset-mismatch';
    }
  | {
      kind: 'block';
      reason: 'index-missing-unrebuildable' | 'index-unreadable' | 'index-invalid-schema' | 'project-vault-link-broken';
    };

export interface ProjectAssetIntegrityEvaluation {
  status: ProjectAssetIntegrityStatus;
  referencedAssetIds: string[];
  indexedReferencedAssetIds: string[];
  unindexedReferencedAssetIds: string[];
  mismatchedIndexedAssetIds: string[];
  usageMismatchAssetIds: string[];
  orderMismatch: boolean;
  expectedDerivedIndex: AssetIndex | null;
}

function collectReferencedAssetIds(scenes: Scene[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const scene of scenes) {
    for (const cut of scene.cuts) {
      const assetId = resolveCutAssetId(cut, () => undefined);
      if (!assetId || seen.has(assetId)) continue;
      seen.add(assetId);
      ordered.push(assetId);
    }
  }

  return ordered;
}

function normalizeUsageRefs(usageRefs: AssetUsageRef[] | undefined): AssetUsageRef[] {
  if (!Array.isArray(usageRefs)) return [];
  return usageRefs.map((ref) => ({
    sceneId: ref.sceneId,
    sceneName: ref.sceneName,
    sceneOrder: ref.sceneOrder,
    cutId: ref.cutId,
    cutOrder: ref.cutOrder,
    cutIndex: ref.cutIndex,
  }));
}

function usageRefsEqual(left: AssetUsageRef[] | undefined, right: AssetUsageRef[] | undefined): boolean {
  const leftRefs = normalizeUsageRefs(left);
  const rightRefs = normalizeUsageRefs(right);
  if (leftRefs.length !== rightRefs.length) return false;

  for (let index = 0; index < leftRefs.length; index += 1) {
    const current = leftRefs[index];
    const expected = rightRefs[index];
    if (
      current.sceneId !== expected.sceneId
      || current.sceneName !== expected.sceneName
      || current.sceneOrder !== expected.sceneOrder
      || current.cutId !== expected.cutId
      || current.cutOrder !== expected.cutOrder
      || current.cutIndex !== expected.cutIndex
    ) {
      return false;
    }
  }

  return true;
}

function assetOrderEqual(left: AssetIndex, right: AssetIndex): boolean {
  if (left.assets.length !== right.assets.length) return false;
  for (let index = 0; index < left.assets.length; index += 1) {
    if (left.assets[index]?.id !== right.assets[index]?.id) {
      return false;
    }
  }
  return true;
}

export function evaluateProjectAssetIntegrity(
  scenes: Scene[],
  assetIndex: AssetIndex | null | undefined,
  sceneOrder?: string[]
): ProjectAssetIntegrityEvaluation {
  const referencedAssetIds = collectReferencedAssetIds(scenes);
  const indexedAssetIds = new Set(
    (assetIndex?.assets || [])
      .map((entry) => entry?.id)
      .filter((assetId): assetId is string => typeof assetId === 'string' && assetId.length > 0)
  );
  const indexedReferencedAssetIds = referencedAssetIds.filter((assetId) => indexedAssetIds.has(assetId));
  const unindexedReferencedAssetIds = referencedAssetIds.filter((assetId) => !indexedAssetIds.has(assetId));

  const expectedDerivedIndex = assetIndex
    ? buildDerivedAssetIndexForSave(assetIndex, scenes, sceneOrder)
    : null;
  const expectedEntryById = new Map(
    (expectedDerivedIndex?.assets || []).map((entry) => [entry.id, entry] as const)
  );
  const usageMismatchAssetIds = (assetIndex?.assets || [])
    .filter((entry) => !usageRefsEqual(entry.usageRefs, expectedEntryById.get(entry.id)?.usageRefs))
    .map((entry) => entry.id);
  const orderMismatch = !!assetIndex && !!expectedDerivedIndex && !assetOrderEqual(assetIndex, expectedDerivedIndex);

  const status: ProjectAssetIntegrityStatus = unindexedReferencedAssetIds.length > 0
    ? 'referenced-asset-mismatch'
    : (usageMismatchAssetIds.length > 0 || orderMismatch)
        ? 'usage-mismatch-only'
        : 'ok';

  return {
    status,
    referencedAssetIds,
    indexedReferencedAssetIds,
    unindexedReferencedAssetIds,
    mismatchedIndexedAssetIds: [],
    usageMismatchAssetIds,
    orderMismatch,
    expectedDerivedIndex,
  };
}

export function planProjectAssetIndexAction(input: {
  indexState: AssetIndexState;
  integrity: ProjectAssetIntegrityEvaluation;
  canRepairReferencedEntriesFromProject: boolean;
}): ProjectAssetIndexAction {
  const { indexState, integrity, canRepairReferencedEntriesFromProject } = input;

  if (indexState === 'missing') {
    if (integrity.referencedAssetIds.length === 0 || canRepairReferencedEntriesFromProject) {
      return { kind: 'repair-silent', reason: 'index-missing-rebuildable' };
    }
    return { kind: 'block', reason: 'index-missing-unrebuildable' };
  }

  if (indexState === 'unreadable') {
    if (integrity.referencedAssetIds.length === 0 || canRepairReferencedEntriesFromProject) {
      return { kind: 'repair-confirm', reason: 'index-unreadable' };
    }
    return { kind: 'block', reason: 'index-unreadable' };
  }

  if (indexState === 'invalid-schema') {
    if (integrity.referencedAssetIds.length === 0 || canRepairReferencedEntriesFromProject) {
      return { kind: 'repair-confirm', reason: 'index-invalid-schema' };
    }
    return { kind: 'block', reason: 'index-invalid-schema' };
  }

  if (integrity.status === 'usage-mismatch-only') {
    return { kind: 'repair-silent', reason: 'usage-mismatch-only' };
  }

  if (integrity.status === 'referenced-asset-mismatch') {
    if (canRepairReferencedEntriesFromProject) {
      return { kind: 'repair-confirm', reason: 'referenced-asset-mismatch' };
    }
    return { kind: 'block', reason: 'project-vault-link-broken' };
  }

  return { kind: 'load', reason: 'ok' };
}

export function formatProjectAssetIntegrityMessage(
  evaluation: ProjectAssetIntegrityEvaluation
): string {
  if (evaluation.status === 'referenced-asset-mismatch') {
    if (evaluation.mismatchedIndexedAssetIds.length > 0) {
      return `${evaluation.mismatchedIndexedAssetIds.length} referenced asset ID(s) point to different vault files than \`assets/.index.json\`.`;
    }
    if (evaluation.indexedReferencedAssetIds.length === 0) {
      return 'None of the asset IDs referenced by cuts exist in `assets/.index.json`.';
    }
    return `${evaluation.unindexedReferencedAssetIds.length} referenced asset ID(s) are missing from \`assets/.index.json\`.`;
  }
  if (evaluation.status === 'usage-mismatch-only') {
    if (evaluation.orderMismatch) {
      return '`assets/.index.json` usage/order data is stale and can be repaired from the project.';
    }
    return '`assets/.index.json` usage data is stale and can be repaired from the project.';
  }
  return 'Project asset references are consistent with `assets/.index.json`.';
}

export function buildProjectAssetIndexRepairMessage(
  action: Extract<ProjectAssetIndexAction, { kind: 'repair-confirm' }>,
  context: 'load' | 'save'
): {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'info' | 'warning';
} {
  if (action.reason === 'index-unreadable') {
    return {
      title: context === 'load' ? 'Repair Asset Index?' : 'Repair Asset Index Before Save?',
      message: 'The asset index could not be read. Repair it from the project and continue?',
      confirmLabel: context === 'load' ? 'Repair And Open' : 'Repair And Save',
      cancelLabel: 'Cancel',
      variant: 'warning',
    };
  }

  if (action.reason === 'index-invalid-schema') {
    return {
      title: context === 'load' ? 'Repair Asset Index?' : 'Repair Asset Index Before Save?',
      message: 'The asset index is damaged. Repair it from the project and continue?',
      confirmLabel: context === 'load' ? 'Repair And Open' : 'Repair And Save',
      cancelLabel: 'Cancel',
      variant: 'warning',
    };
  }

  return {
    title: context === 'load' ? 'Repair Asset Index?' : 'Repair Asset Index Before Save?',
    message: 'The project file and asset index do not match. Repair the asset index and continue?',
    confirmLabel: context === 'load' ? 'Repair And Open' : 'Repair And Save',
    cancelLabel: 'Cancel',
    variant: 'info',
  };
}
