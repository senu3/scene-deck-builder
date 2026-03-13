import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_FPS, resolveExportPlan, resolveExportResolution } from '../plan';

describe('export plan', () => {
  it.each([
    { input: { width: 0, height: 0 }, expected: { width: 1280, height: 720 } },
    { input: { width: Number.NaN, height: -1 }, expected: { width: 1280, height: 720 } },
  ])('normalizes free/invalid resolution to defaults: %o', ({ input, expected }) => {
    expect(resolveExportResolution(input)).toEqual(expected);
  });

  it('builds mp4 plan with normalized resolution', () => {
    const plan = resolveExportPlan({
      settings: {
        format: 'mp4',
        outputRootPath: 'C:/vault/export',
        outputFolderName: 'video_20260211_120000',
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        range: 'all',
        mp4: { quality: 'high' },
      },
      resolution: { width: 1920, height: 1080 },
    });

    expect(plan.format).toBe('mp4');
    expect(plan.width).toBe(1920);
    expect(plan.height).toBe(1080);
    expect(plan.fps).toBe(DEFAULT_EXPORT_FPS);
    expect(plan.quality).toBe('high');
    expect(plan.outputDir).toBe('C:/vault/export/video_20260211_120000');
    expect(plan.outputFilePath).toBe('C:/vault/export/video_20260211_120000/video.mp4');
    expect(plan.range).toBe('all');
  });

  it('keeps exportScope when provided', () => {
    const plan = resolveExportPlan({
      settings: {
        format: 'mp4',
        outputRootPath: 'C:/vault/export',
        outputFolderName: 'scenes/scene-1',
        resolution: { width: 1280, height: 720 },
        fps: 30,
        range: 'all',
        mp4: { quality: 'medium' },
      },
      resolution: { width: 1280, height: 720 },
      exportScope: { kind: 'scene', sceneId: 'scene-1' },
    });

    expect(plan.format).toBe('mp4');
    expect(plan.exportScope).toEqual({ kind: 'scene', sceneId: 'scene-1' });
  });
});
