export type ExportFormat = 'aviutl' | 'mp4';
export type RoundingMode = 'round' | 'floor' | 'ceil';
export type EncodingQuality = 'low' | 'medium' | 'high';

export interface ExportSettings {
  format: ExportFormat;
  outputPath: string;
  aviutl: {
    roundingMode: RoundingMode;
    copyMedia: boolean;
  };
  mp4: {
    quality: EncodingQuality;
  };
}
