export type EncodingQuality = 'low' | 'medium' | 'high';
export type ExportRange = 'all' | 'selection';

export interface ExportSettings {
  format: 'mp4';
  outputRootPath: string;
  outputFolderName: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  range: ExportRange;
  mp4: {
    quality: EncodingQuality;
  };
}
