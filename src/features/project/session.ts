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
  loadProjectBridge,
  loadProjectFromPathBridge,
  pathExistsBridge,
  readAssetIndexBridge,
  selectVaultBridge,
  type AssetIndexReadResult,
} from '../platform/electronGateway';
import type { ProjectLoadFailure } from './loadFailure';
import { type RecoveryAssessment, type RecoveryNormalizationFlags } from './recoveryAssessment';
import { createProjectIntegrityAssessment } from './integrity';
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

function normalizeLoadedProjectName(name: LoadedProjectData['name'], fallbackName: string): string {
  if (typeof name !== 'string') return fallbackName;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallbackName;
}

function deriveProjectFallbackName(projectPath: string, fallbackName: string): string {
  const normalized = projectPath.replace(/\\/g, '/');
  const lastSegment = normalized.split('/').filter(Boolean).pop();
  if (!lastSegment) return fallbackName;
  const withoutExtension = lastSegment.replace(/\.sdp$/i, '');
  return withoutExtension || fallbackName;
}

function normalizeLoadedSourcePanelState(sourcePanel: LoadedProjectData['sourcePanel']): SourcePanelState | undefined {
  if (!sourcePanel || typeof sourcePanel !== 'object') {
    return undefined;
  }

  const candidate = sourcePanel as unknown as Record<string, unknown>;
  const folders = Array.isArray(candidate.folders)
    ? candidate.folders.filter((folder): folder is SourcePanelState['folders'][number] => {
      if (!folder || typeof folder !== 'object') return false;
      const folderRecord = folder as { path?: unknown; name?: unknown };
      return typeof folderRecord.path === 'string' && typeof folderRecord.name === 'string';
    })
    : [];
  const expandedPaths = Array.isArray(candidate.expandedPaths)
    ? candidate.expandedPaths.filter((path): path is string => typeof path === 'string')
    : [];
  const viewMode = candidate.viewMode === 'grid' ? 'grid' : 'list';

  return {
    folders,
    expandedPaths,
    viewMode,
  };
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

export interface ProjectOpenInputs {
  scenes: Scene[];
  missingAssets: MissingAssetInfo[];
  assetIndex: AssetIndexReadResult;
  metadataAssessment: Awaited<ReturnType<typeof loadMetadataStoreWithReport>>;
}

export interface ProjectOpenDiagnosis extends ProjectStateAssessmentResult {
  assetIndex: AssetIndexReadResult;
  severity: 'none' | 'warning' | 'fatal';
  recommendedAction: 'open' | 'recover' | 'abort';
}

export type ProjectOpenRequestResult =
  | ProjectLoadOutcome
  | { kind: 'canceled' }
  | { kind: 'failure'; failure: ProjectLoadFailure };

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

export async function readProjectOpenInputs(
  scenes: Scene[],
  vaultPath: string,
): Promise<ProjectOpenInputs> {
  const assetIndex = await readAssetIndexBridge(vaultPath).catch(() => ({
    kind: 'unreadable' as const,
    cause: 'read-asset-index-failed',
  }));
  const resolved = await resolveScenesAssets(scenes, vaultPath, {
    assetIndex: assetIndex.kind === 'readable' ? assetIndex.index : null,
  });
  const metadataAssessment = await loadMetadataStoreWithReport(vaultPath, {
    sceneIds: resolved.scenes.map((scene) => scene.id),
    assetIds: assetIndex.kind === 'readable' ? assetIndex.index.assets.map((entry) => entry.id) : undefined,
  });

  return {
    scenes: resolved.scenes,
    missingAssets: resolved.missingAssets,
    assetIndex,
    metadataAssessment,
  };
}

export function diagnoseProjectOpen(
  inputs: ProjectOpenInputs,
  options?: {
    rescuedCutCount?: number;
    projectSchemaVersion?: number;
    normalizationFlags?: Partial<RecoveryNormalizationFlags>;
  }
): ProjectOpenDiagnosis {
  const assessment = createProjectIntegrityAssessment({
    readableSceneCount: inputs.scenes.length,
    missingAssetCount: inputs.missingAssets.length,
    assetIndexState: inputs.assetIndex.kind,
    metadataReport: inputs.metadataAssessment.report,
    rescuedCutCount: options?.rescuedCutCount ?? 0,
    projectSchemaVersion: options?.projectSchemaVersion ?? 3,
    normalizationFlags: options?.normalizationFlags,
  });
  const severity = assessment.mode === 'corrupted'
    ? 'fatal'
    : (assessment.mode === 'repairable' ? 'warning' : 'none');
  const recommendedAction = severity === 'fatal'
    ? 'abort'
    : (inputs.missingAssets.length > 0 ? 'recover' : 'open');

  return {
    scenes: inputs.scenes,
    missingAssets: inputs.missingAssets,
    assessment,
    assetIndex: inputs.assetIndex,
    severity,
    recommendedAction,
  };
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
  const inputs = await readProjectOpenInputs(scenes, vaultPath);
  const diagnosis = diagnoseProjectOpen(inputs, options);

  return {
    scenes: diagnosis.scenes,
    missingAssets: diagnosis.missingAssets,
    assessment: diagnosis.assessment,
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
  if (!Array.isArray(projectData.scenes)) {
    return {
      kind: 'corrupted',
      failure: createProjectLoadFailure('invalid-project-structure', projectPath),
    };
  }

  try {
    const loadedVaultPath = resolveLoadedVaultPath(projectData.vaultPath, projectPath);
    const normalizedScenes = normalizeLoadedScenesInput(projectData.scenes);
    const openInputs = await readProjectOpenInputs(normalizedScenes.scenes, loadedVaultPath);
    const diagnosis = diagnoseProjectOpen(openInputs, {
      projectSchemaVersion: 3,
      normalizationFlags: {
        sceneStructureNormalized: normalizedScenes.normalized,
      },
    });

    const payload: PendingProject = {
      name: normalizeLoadedProjectName(projectData.name, fallbackName),
      vaultPath: loadedVaultPath,
      scenes: diagnosis.scenes,
      sceneOrder: normalizeLoadedSceneOrder(projectData.sceneOrder),
      targetTotalDurationSec: typeof projectData.targetTotalDurationSec === 'number' ? projectData.targetTotalDurationSec : undefined,
      cutRuntimeById: normalizePersistedCutRuntimeById(projectData.cutRuntimeById, diagnosis.scenes),
      sourcePanelState: normalizeLoadedSourcePanelState(projectData.sourcePanel),
      projectPath,
    };

    if (diagnosis.missingAssets.length > 0) {
      return { kind: 'pending', payload, missingAssets: diagnosis.missingAssets, assessment: diagnosis.assessment };
    }
    return { kind: 'ready', payload, assessment: diagnosis.assessment };
  } catch (error) {
    console.error('[ProjectLoad] Failed to build load outcome for project.', {
      projectPath,
      error,
    });
    return {
      kind: 'corrupted',
      failure: createProjectLoadFailure('invalid-project-structure', projectPath),
    };
  }
}

export async function buildProjectOpenRequestResult(
  selection: ProjectSelectionResult,
  fallbackName: string
): Promise<ProjectOpenRequestResult> {
  if (selection.kind === 'canceled') {
    return selection;
  }
  if (selection.kind === 'failure') {
    return selection;
  }
  return buildProjectLoadOutcome(
    selection.data,
    selection.path,
    deriveProjectFallbackName(selection.path, fallbackName)
  );
}

export async function openSelectedProject(
  fallbackName = 'Loaded Project'
): Promise<ProjectOpenRequestResult> {
  const selection = await requestProjectSelection();
  return buildProjectOpenRequestResult(selection, fallbackName);
}

export async function openProjectAtPath(
  projectPath: string,
  fallbackName: string
): Promise<ProjectOpenRequestResult> {
  const selection = await requestProjectFromPath(projectPath);
  return buildProjectOpenRequestResult(selection, fallbackName);
}
