import type { MissingAssetInfo } from '../../components/MissingAssetRecoveryModal';
import type { FileItem, Scene, SourcePanelState } from '../../types';
import { loadMetadataStoreWithReport } from '../../utils/metadataStore';
import {
  type PersistedCutRuntimeById,
  normalizePersistedCutRuntimeById,
} from '../../utils/projectSave';
import {
  createVaultBridge,
  ensureAssetsFolderBridge,
  getFolderContentsBridge,
  getRecentProjectsBridge,
  loadAssetIndexBridge,
  loadProjectBridge,
  loadProjectFromPathBridge,
  pathExistsBridge,
  selectVaultBridge,
} from '../platform/electronGateway';
import type { ProjectLoadFailure } from './loadFailure';
import {
  createRecoveryAssessment,
  type RecoveryAssessment,
  type RecoveryNormalizationFlags,
} from './recoveryAssessment';
import { resolveLoadedVaultPath, resolveScenesAssets } from './load';

function normalizeLoadedScenesInput(scenes: LoadedProjectData['scenes']): { scenes: Scene[]; normalized: boolean } {
  if (!Array.isArray(scenes)) {
    return {
      scenes: [],
      normalized: scenes !== undefined,
    };
  }

  let normalized = false;
  const normalizedScenes = scenes.map((scene) => {
    const isValidScene = scene && typeof scene === 'object';
    const candidate = (isValidScene ? scene : {}) as Scene;
    if (!isValidScene) {
      normalized = true;
    }

    const cuts = Array.isArray(candidate.cuts)
      ? candidate.cuts.map((cut, index) => {
          const hasOrder = typeof cut?.order === 'number';
          const hasAudioBindings = cut?.audioBindings === undefined || Array.isArray(cut.audioBindings);
          if (!hasOrder || !hasAudioBindings) {
            normalized = true;
          }
          return {
            ...cut,
            order: hasOrder ? cut.order : index,
            audioBindings: Array.isArray(cut?.audioBindings) ? cut.audioBindings : undefined,
          };
        })
      : [];
    if (!Array.isArray(candidate.cuts)) {
      normalized = true;
    }

    let groups: Scene['groups'];
    if (Array.isArray(candidate.groups)) {
      groups = candidate.groups.map((group) => {
        const nextCutIds = Array.isArray(group?.cutIds)
          ? group.cutIds.filter((cutId): cutId is string => typeof cutId === 'string')
          : [];
        if (!Array.isArray(group?.cutIds) || nextCutIds.length !== (group?.cutIds?.length ?? 0)) {
          normalized = true;
        }
        return {
          ...group,
          cutIds: nextCutIds,
        };
      });
    } else {
      groups = undefined;
      if (candidate.groups !== undefined) {
        normalized = true;
      }
    }

    if (!Array.isArray(candidate.notes)) {
      normalized = true;
    }

    return {
      ...candidate,
      cuts,
      notes: Array.isArray(candidate.notes) ? candidate.notes : [],
      groups,
    };
  });

  return {
    scenes: normalizedScenes,
    normalized,
  };
}

function normalizeLoadedSceneOrder(sceneOrder: LoadedProjectData['sceneOrder']): string[] | undefined {
  if (!Array.isArray(sceneOrder)) return undefined;
  return sceneOrder.filter((sceneId): sceneId is string => typeof sceneId === 'string');
}

function isLoadedProjectRoot(projectData: unknown): projectData is LoadedProjectData {
  return typeof projectData === 'object' && projectData !== null;
}

function createProjectLoadFailure(
  code: ProjectLoadFailure['code'],
  projectPath: string,
  schemaVersion?: number
): ProjectLoadFailure {
  return {
    code,
    projectPath,
    schemaVersion,
  };
}

export interface RecentProjectEntry {
  name: string;
  path: string;
  date: string;
}

export interface LoadedProjectData {
  name?: string;
  vaultPath?: string;
  scenes?: Scene[];
  sceneOrder?: string[];
  version?: number;
  targetTotalDurationSec?: number;
  cutRuntimeById?: unknown;
  sourcePanel?: SourcePanelState;
}

export interface PendingProject {
  name: string;
  vaultPath: string;
  scenes: Scene[];
  sceneOrder?: string[];
  targetTotalDurationSec?: number;
  cutRuntimeById?: PersistedCutRuntimeById;
  sourcePanelState?: SourcePanelState;
  projectPath: string;
}

export type ProjectSelectionResult =
  | { kind: 'success'; data: LoadedProjectData; path: string }
  | { kind: 'canceled' }
  | { kind: 'failure'; failure: ProjectLoadFailure };

export type ProjectLoadOutcome =
  | { kind: 'pending'; payload: PendingProject; missingAssets: MissingAssetInfo[]; assessment: RecoveryAssessment }
  | { kind: 'ready'; payload: PendingProject; assessment: RecoveryAssessment }
  | { kind: 'corrupted'; failure: ProjectLoadFailure };

export interface ProjectStateAssessmentResult {
  scenes: Scene[];
  missingAssets: MissingAssetInfo[];
  assessment: RecoveryAssessment;
}

export interface CreateProjectBootstrapResult {
  vaultPath: string;
  projectFilePath: string;
  defaultScenes: Scene[];
  defaultSceneOrder: string[];
  projectData: string;
  structure: FileItem[];
}

export async function loadRecentProjectsWithCleanup(
  persistRecentProjects?: (projects: RecentProjectEntry[]) => Promise<void> | void
): Promise<RecentProjectEntry[]> {
  const projects = await getRecentProjectsBridge();
  const validProjects: RecentProjectEntry[] = [];
  for (const project of projects) {
    const exists = await pathExistsBridge(project.path);
    if (exists) {
      validProjects.push(project);
    }
  }

  if (persistRecentProjects && validProjects.length !== projects.length) {
    await persistRecentProjects(validProjects);
  }

  return validProjects;
}

export async function selectProjectVaultPath(): Promise<string | null> {
  return selectVaultBridge();
}

export async function createProjectBootstrap(
  baseVaultPath: string,
  projectName: string
): Promise<CreateProjectBootstrapResult | null> {
  const vault = await createVaultBridge(baseVaultPath, projectName);
  if (!vault) return null;

  await ensureAssetsFolderBridge(vault.path);

  const defaultScenes: Scene[] = [
    { id: crypto.randomUUID(), name: 'Scene 1', cuts: [], notes: [] },
    { id: crypto.randomUUID(), name: 'Scene 2', cuts: [], notes: [] },
    { id: crypto.randomUUID(), name: 'Scene 3', cuts: [], notes: [] },
  ];
  const defaultSceneOrder = defaultScenes.map((scene) => scene.id);
  const projectData = JSON.stringify({
    version: 3,
    name: projectName,
    vaultPath: vault.path,
    scenes: defaultScenes,
    sceneOrder: defaultSceneOrder,
    targetTotalDurationSec: undefined,
    sourcePanel: undefined,
    savedAt: new Date().toISOString(),
  });

  return {
    vaultPath: vault.path,
    projectFilePath: `${vault.path}/project.sdp`,
    defaultScenes,
    defaultSceneOrder,
    projectData,
    structure: (await getFolderContentsBridge(vault.path)) || [],
  };
}

export async function requestProjectSelection(): Promise<ProjectSelectionResult> {
  const result = await loadProjectBridge();
  if (result.kind === 'canceled') {
    return { kind: 'canceled' };
  }
  if (result.kind === 'error') {
    return {
      kind: 'failure',
      failure: createProjectLoadFailure(result.code, result.path),
    };
  }
  return {
    kind: 'success',
    data: result.data as LoadedProjectData,
    path: result.path,
  };
}

export async function requestProjectFromPath(projectPath: string): Promise<ProjectSelectionResult> {
  const result = await loadProjectFromPathBridge(projectPath);
  if (result.kind === 'canceled') {
    return { kind: 'canceled' };
  }
  if (result.kind === 'error') {
    return {
      kind: 'failure',
      failure: createProjectLoadFailure(result.code, result.path),
    };
  }
  return {
    kind: 'success',
    data: result.data as LoadedProjectData,
    path: result.path,
  };
}

export async function projectPathExists(projectPath: string): Promise<boolean> {
  return pathExistsBridge(projectPath);
}

export async function assessProjectState(
  scenes: Scene[],
  vaultPath: string,
  options?: {
    rescuedCutCount?: number;
    projectSchemaVersion?: number;
    normalizationFlags?: Partial<RecoveryNormalizationFlags>;
  }
): Promise<ProjectStateAssessmentResult> {
  const resolved = await resolveScenesAssets(scenes, vaultPath);
  const assetIndex = await loadAssetIndexBridge(vaultPath).catch(() => null);
  const metadataAssessment = await loadMetadataStoreWithReport(vaultPath, {
    sceneIds: resolved.scenes.map((scene) => scene.id),
    assetIds: assetIndex ? assetIndex.assets.map((entry) => entry.id) : undefined,
  });
  const issues = [];
  if (resolved.missingAssets.length > 0) {
    issues.push({
      severity: 'warning' as const,
      code: 'missing-assets',
      message: `${resolved.missingAssets.length} asset reference(s) could not be restored during load.`,
    });
  }
  if (metadataAssessment.report.skippedMetadataCount > 0) {
    issues.push({
      severity: 'warning' as const,
      code: 'skipped-metadata',
      message: `${metadataAssessment.report.skippedMetadataCount} metadata item(s) were skipped during load.`,
    });
  }
  if (metadataAssessment.report.orphanMetadataCount > 0) {
    issues.push({
      severity: 'warning' as const,
      code: 'orphan-metadata',
      message: `${metadataAssessment.report.orphanMetadataCount} orphan metadata item(s) were detected.`,
    });
  }
  const assessment = createRecoveryAssessment({
    readableSceneCount: resolved.scenes.length,
    missingAssetCount: resolved.missingAssets.length,
    skippedMetadataCount: metadataAssessment.report.skippedMetadataCount,
    rescuedCutCount: options?.rescuedCutCount ?? 0,
    orphanMetadataCount: metadataAssessment.report.orphanMetadataCount,
    projectSchemaVersion: options?.projectSchemaVersion ?? 3,
    metadataSchemaVersion: metadataAssessment.report.metadataSchemaVersion,
    normalizationFlags: {
      sceneIdsAssigned: options?.normalizationFlags?.sceneIdsAssigned ?? false,
      sceneOrderNormalized: options?.normalizationFlags?.sceneOrderNormalized ?? false,
      sceneStructureNormalized: options?.normalizationFlags?.sceneStructureNormalized ?? false,
      metadataNormalized:
        options?.normalizationFlags?.metadataNormalized ?? metadataAssessment.report.normalized,
    },
  }, issues);

  return {
    scenes: resolved.scenes,
    missingAssets: resolved.missingAssets,
    assessment,
  };
}

export async function buildProjectLoadOutcome(
  projectData: unknown,
  projectPath: string,
  fallbackName: string
): Promise<ProjectLoadOutcome> {
  if (!isLoadedProjectRoot(projectData)) {
    return {
      kind: 'corrupted',
      failure: createProjectLoadFailure('invalid-project-structure', projectPath),
    };
  }

  if (projectData.version !== 3) {
    return {
      kind: 'corrupted',
      failure: createProjectLoadFailure('unsupported-schema', projectPath, projectData.version),
    };
  }

  const loadedVaultPath = resolveLoadedVaultPath(projectData.vaultPath, projectPath);
  const normalizedScenes = normalizeLoadedScenesInput(projectData.scenes);
  const stateAssessment = await assessProjectState(normalizedScenes.scenes, loadedVaultPath, {
    projectSchemaVersion: 3,
    normalizationFlags: {
      sceneStructureNormalized: normalizedScenes.normalized,
    },
  });

  const payload: PendingProject = {
    name: projectData.name || fallbackName,
    vaultPath: loadedVaultPath,
    scenes: stateAssessment.scenes,
    sceneOrder: normalizeLoadedSceneOrder(projectData.sceneOrder),
    targetTotalDurationSec: typeof projectData.targetTotalDurationSec === 'number' ? projectData.targetTotalDurationSec : undefined,
    cutRuntimeById: normalizePersistedCutRuntimeById(projectData.cutRuntimeById, stateAssessment.scenes),
    sourcePanelState: projectData.sourcePanel,
    projectPath,
  };

  if (stateAssessment.missingAssets.length > 0) {
    return { kind: 'pending', payload, missingAssets: stateAssessment.missingAssets, assessment: stateAssessment.assessment };
  }
  return { kind: 'ready', payload, assessment: stateAssessment.assessment };
}
