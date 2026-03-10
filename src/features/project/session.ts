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
import {
  hasLegacyRelativeAssetPaths,
  normalizeLoadedProjectVersion,
  resolveLoadedVaultPath,
  resolveScenesAssets,
} from './load';

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
  shouldResaveVersion?: boolean;
}

export type ProjectLoadOutcome =
  | { kind: 'pending'; payload: PendingProject; missingAssets: MissingAssetInfo[] }
  | { kind: 'ready'; payload: PendingProject };

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

export async function requestProjectSelection(): Promise<{ data: LoadedProjectData; path: string } | null> {
  const result = await loadProjectBridge();
  if (!result) return null;
  return {
    data: result.data as LoadedProjectData,
    path: result.path,
  };
}

export async function requestProjectFromPath(projectPath: string): Promise<{ data: LoadedProjectData; path: string } | null> {
  const result = await loadProjectFromPathBridge(projectPath);
  if (!result) return null;
  return {
    data: result.data as LoadedProjectData,
    path: result.path,
  };
}

export async function projectPathExists(projectPath: string): Promise<boolean> {
  return pathExistsBridge(projectPath);
}

export async function buildProjectLoadOutcome(
  projectData: LoadedProjectData,
  projectPath: string,
  fallbackName: string
): Promise<ProjectLoadOutcome> {
  const loadedVaultPath = resolveLoadedVaultPath(projectData.vaultPath, projectPath);
  let scenes = projectData.scenes || [];
  let foundMissingAssets: MissingAssetInfo[] = [];
  const normalizedVersion = normalizeLoadedProjectVersion(projectData.version, scenes);

  if (
    normalizedVersion.version >= 2 ||
    hasLegacyRelativeAssetPaths(scenes)
  ) {
    const resolved = await resolveScenesAssets(scenes, loadedVaultPath);
    scenes = resolved.scenes;
    foundMissingAssets = resolved.missingAssets;
  }

  const payload: PendingProject = {
    name: projectData.name || fallbackName,
    vaultPath: loadedVaultPath,
    scenes,
    sceneOrder: projectData.sceneOrder,
    targetTotalDurationSec: projectData.targetTotalDurationSec,
    cutRuntimeById: normalizePersistedCutRuntimeById(projectData.cutRuntimeById, scenes),
    sourcePanelState: projectData.sourcePanel,
    projectPath,
    shouldResaveVersion: normalizedVersion.wasMissing,
  };

  if (foundMissingAssets.length > 0) {
    return { kind: 'pending', payload, missingAssets: foundMissingAssets };
  }
  return { kind: 'ready', payload };
}
