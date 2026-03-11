import type { MissingAssetInfo } from '../../components/MissingAssetRecoveryModal';
import type { FileItem, Scene, SourcePanelState } from '../../types';
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
  selectVaultBridge,
} from '../platform/electronGateway';
import type { ProjectLoadFailure } from './loadFailure';
import { resolveLoadedVaultPath, resolveScenesAssets } from './load';

function normalizeLoadedScenesInput(scenes: LoadedProjectData['scenes']): Scene[] {
  if (!Array.isArray(scenes)) return [];

  return scenes.map((scene) => {
    const candidate = (scene && typeof scene === 'object' ? scene : {}) as Scene;
    return {
      ...candidate,
      cuts: Array.isArray(candidate.cuts)
        ? candidate.cuts.map((cut, index) => ({
            ...cut,
            order: typeof cut?.order === 'number' ? cut.order : index,
            audioBindings: Array.isArray(cut?.audioBindings) ? cut.audioBindings : undefined,
          }))
        : [],
      notes: Array.isArray(candidate.notes) ? candidate.notes : [],
      groups: Array.isArray(candidate.groups)
        ? candidate.groups.map((group) => ({
            ...group,
            cutIds: Array.isArray(group?.cutIds)
              ? group.cutIds.filter((cutId): cutId is string => typeof cutId === 'string')
              : [],
          }))
        : undefined,
    };
  });
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
  | { kind: 'pending'; payload: PendingProject; missingAssets: MissingAssetInfo[] }
  | { kind: 'ready'; payload: PendingProject }
  | { kind: 'corrupted'; failure: ProjectLoadFailure };

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
  const scenes = normalizeLoadedScenesInput(projectData.scenes);
  const resolved = await resolveScenesAssets(scenes, loadedVaultPath);

  const payload: PendingProject = {
    name: projectData.name || fallbackName,
    vaultPath: loadedVaultPath,
    scenes: resolved.scenes,
    sceneOrder: normalizeLoadedSceneOrder(projectData.sceneOrder),
    targetTotalDurationSec: typeof projectData.targetTotalDurationSec === 'number' ? projectData.targetTotalDurationSec : undefined,
    cutRuntimeById: normalizePersistedCutRuntimeById(projectData.cutRuntimeById, resolved.scenes),
    sourcePanelState: projectData.sourcePanel,
    projectPath,
  };

  if (resolved.missingAssets.length > 0) {
    return { kind: 'pending', payload, missingAssets: resolved.missingAssets };
  }
  return { kind: 'ready', payload };
}
