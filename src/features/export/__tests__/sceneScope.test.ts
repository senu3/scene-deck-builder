import { describe, expect, it } from 'vitest';
import { buildSceneScopedExportPath } from '../sceneScope';

describe('scene scoped export path', () => {
  it('builds scoped path under project/scenes', () => {
    const result = buildSceneScopedExportPath({
      vaultPath: 'C:/vault/projectA',
      projectName: 'Project A',
      sceneId: 'scene-12345678',
      sceneName: 'Intro Scene',
      sceneIndex: 0,
    });

    expect(result.outputRootPath).toBe('C:/vault/projectA/export/project-a/scenes');
    expect(result.outputFolderName).toBe('scene_01_intro-scene-scene123');
    expect(result.outputDir).toBe('C:/vault/projectA/export/project-a/scenes/scene_01_intro-scene-scene123');
    expect(result.outputFilePath).toBe('C:/vault/projectA/export/project-a/scenes/scene_01_intro-scene-scene123/video.mp4');
  });

  it('avoids collisions for duplicate scene titles by sceneId suffix', () => {
    const first = buildSceneScopedExportPath({
      vaultPath: 'C:/vault/p',
      projectName: 'P',
      sceneId: 'scene-alpha',
      sceneName: 'Scene',
      sceneIndex: 1,
    });
    const second = buildSceneScopedExportPath({
      vaultPath: 'C:/vault/p',
      projectName: 'P',
      sceneId: 'scene-beta',
      sceneName: 'Scene',
      sceneIndex: 1,
    });

    expect(first.outputFolderName).not.toBe(second.outputFolderName);
  });
});
