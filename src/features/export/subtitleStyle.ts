import { getSubtitleStyleSettings, sanitizeSubtitleStyleSettings, type SubtitleStyleSettings } from '../../utils/subtitleStyleSettings';

export interface SubtitleStyleForExportInput {
  subtitleStyle?: Partial<SubtitleStyleSettings> | null;
}

export function getSubtitleStyleForExport(
  input?: SubtitleStyleForExportInput
): SubtitleStyleSettings {
  if (input?.subtitleStyle) {
    return sanitizeSubtitleStyleSettings(input.subtitleStyle);
  }
  return sanitizeSubtitleStyleSettings(getSubtitleStyleSettings());
}
