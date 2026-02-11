import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_FPS, resolveExportPlan, resolveExportResolution } from '../plan';

describe('export plan', () => {
  it('normalizes free/invalid resolution to defaults', () => {
    expect(resolveExportResolution({ width: 0, height: 0 })).toEqual({ width: 1280, height: 720 });
    expect(resolveExportResolution({ width: Number.NaN, height: -1 })).toEqual({ width: 1280, height: 720 });
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
        aviutl: { roundingMode: 'round', copyMedia: true },
        mp4: { quality: 'high' },
      },
      resolution: { width: 1920, height: 1080 },
    });

    expect(plan.format).toBe('mp4');
    if (plan.format === 'mp4') {
      expect(plan.width).toBe(1920);
      expect(plan.height).toBe(1080);
      expect(plan.fps).toBe(DEFAULT_EXPORT_FPS);
      expect(plan.quality).toBe('high');
      expect(plan.outputDir).toBe('C:/vault/export/video_20260211_120000');
      expect(plan.outputFilePath).toBe('C:/vault/export/video_20260211_120000/video.mp4');
      expect(plan.range).toBe('all');
    }
  });

  it('builds aviutl plan', () => {
    const plan = resolveExportPlan({
      settings: {
        format: 'aviutl',
        outputRootPath: 'C:/vault/export',
        outputFolderName: 'aviutl_20260211_120000',
        resolution: { width: 1280, height: 720 },
        fps: 30,
        range: 'all',
        aviutl: { roundingMode: 'ceil', copyMedia: false },
        mp4: { quality: 'medium' },
      },
      resolution: { width: 1280, height: 720 },
    });

    expect(plan).toEqual({
      format: 'aviutl',
      outputDir: 'C:/vault/export/aviutl_20260211_120000',
      roundingMode: 'ceil',
      copyMedia: false,
    });
  });
});
