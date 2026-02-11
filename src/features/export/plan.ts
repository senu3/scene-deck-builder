import type { ExportSettings, EncodingQuality, ExportRange, RoundingMode } from './types';
import { DEFAULT_EXPORT_RESOLUTION } from '../../constants/export';

export const DEFAULT_EXPORT_FPS = 30;

export interface ResolutionInput {
  width: number;
  height: number;
}

export interface Mp4ExportPlan {
  format: 'mp4';
  outputDir: string;
  outputFilePath: string;
  width: number;
  height: number;
  fps: number;
  quality: EncodingQuality;
  range: ExportRange;
}

export interface AviUtlExportPlan {
  format: 'aviutl';
  outputDir: string;
  roundingMode: RoundingMode;
  copyMedia: boolean;
}

export type ExportPlan = Mp4ExportPlan | AviUtlExportPlan;

function sanitizeDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
}

function joinPathNormalized(...parts: string[]): string {
  const merged = parts
    .map((part) => part.replace(/\\/g, '/').trim())
    .filter((part) => part.length > 0)
    .join('/');
  return merged.replace(/\/{2,}/g, '/');
}

export function resolveExportResolution(input: ResolutionInput): { width: number; height: number } {
  return {
    width: sanitizeDimension(input.width, DEFAULT_EXPORT_RESOLUTION.width),
    height: sanitizeDimension(input.height, DEFAULT_EXPORT_RESOLUTION.height),
  };
}

export function resolveExportPlan(input: {
  settings: ExportSettings;
  resolution: ResolutionInput;
}): ExportPlan {
  const outputRootPath = (input.settings.outputRootPath || '').trim();
  const outputFolderName = (input.settings.outputFolderName || '').trim();
  const outputDir = outputRootPath && outputFolderName
    ? joinPathNormalized(outputRootPath, outputFolderName)
    : outputRootPath || outputFolderName;

  if (input.settings.format === 'aviutl') {
    return {
      format: 'aviutl',
      outputDir,
      roundingMode: input.settings.aviutl.roundingMode,
      copyMedia: input.settings.aviutl.copyMedia,
    };
  }

  const { width, height } = resolveExportResolution(input.settings.resolution ?? input.resolution);
  const fps = Number.isFinite(input.settings.fps) && input.settings.fps > 0
    ? Math.max(1, Math.floor(input.settings.fps))
    : DEFAULT_EXPORT_FPS;
  return {
    format: 'mp4',
    outputDir,
    outputFilePath: joinPathNormalized(outputDir || '.', 'video.mp4'),
    width,
    height,
    fps,
    quality: input.settings.mp4.quality,
    range: input.settings.range,
  };
}
