export interface SceneExportScope {
  kind: 'scene';
  sceneId: string;
}

export interface SceneExportPathInput {
  vaultPath: string | null;
  projectName: string;
  sceneId: string;
  sceneName: string;
  sceneIndex: number;
}

export interface SceneExportPathResult {
  outputRootPath: string;
  outputFolderName: string;
  outputDir: string;
  outputFilePath: string;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

function sanitizePathPart(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return normalized || fallback;
}

function toShortSceneId(sceneId: string): string {
  const compact = sceneId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return (compact || 'scene').slice(0, 8);
}

export function buildSceneScopedExportPath(input: SceneExportPathInput): SceneExportPathResult {
  const safeProject = sanitizePathPart(input.projectName, 'project');
  const safeScene = sanitizePathPart(input.sceneName, 'scene');
  const safeIndex = Number.isFinite(input.sceneIndex) && input.sceneIndex >= 0
    ? String(input.sceneIndex + 1).padStart(2, '0')
    : '00';
  const shortSceneId = toShortSceneId(input.sceneId);
  const outputFolderName = `scene_${safeIndex}_${safeScene}-${shortSceneId}`;
  const rootBase = input.vaultPath ? normalizePath(input.vaultPath) : '.';
  const outputRootPath = `${rootBase}/export/${safeProject}/scenes`;
  const outputDir = `${outputRootPath}/${outputFolderName}`;
  return {
    outputRootPath,
    outputFolderName,
    outputDir,
    outputFilePath: `${outputDir}/video.mp4`,
  };
}
