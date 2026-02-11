export type ExportFormat = 'aviutl' | 'mp4';
export type RoundingMode = 'round' | 'floor' | 'ceil';
export type EncodingQuality = 'low' | 'medium' | 'high';
export type ExportRange = 'all' | 'selection';

export interface ExportSettings {
  format: ExportFormat;
  outputRootPath: string;
  outputFolderName: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  range: ExportRange;
  aviutl: {
    roundingMode: RoundingMode;
    copyMedia: boolean;
  };
  mp4: {
    quality: EncodingQuality;
  };
}
