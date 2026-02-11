import type { ExportSettings, EncodingQuality, RoundingMode } from './types';
import { DEFAULT_EXPORT_RESOLUTION } from '../../constants/export';

export const DEFAULT_EXPORT_FPS = 30;

export interface ResolutionInput {
  width: number;
  height: number;
}

export interface Mp4ExportPlan {
  format: 'mp4';
  outputPathHint: string;
  width: number;
  height: number;
  fps: number;
  quality: EncodingQuality;
}

export interface AviUtlExportPlan {
  format: 'aviutl';
  outputPathHint: string;
  roundingMode: RoundingMode;
  copyMedia: boolean;
}

export type ExportPlan = Mp4ExportPlan | AviUtlExportPlan;

function sanitizeDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
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
  const outputPathHint = (input.settings.outputPath || '').trim();

  if (input.settings.format === 'aviutl') {
    return {
      format: 'aviutl',
      outputPathHint,
      roundingMode: input.settings.aviutl.roundingMode,
      copyMedia: input.settings.aviutl.copyMedia,
    };
  }

  const { width, height } = resolveExportResolution(input.resolution);
  return {
    format: 'mp4',
    outputPathHint,
    width,
    height,
    fps: DEFAULT_EXPORT_FPS,
    quality: input.settings.mp4.quality,
  };
}
