export type SubtitlePosition = 'bottom' | 'center';

export interface SubtitleStyleSettings {
  fontSizePx: number;
  fontColor: string;
  backgroundEnabled: boolean;
  backgroundOpacity: number;
  position: SubtitlePosition;
  outlineEnabled: boolean;
  shadowEnabled: boolean;
}

const STORAGE_KEY = 'scene-deck.subtitle-style-settings.v1';

const DEFAULT_SUBTITLE_STYLE_SETTINGS: SubtitleStyleSettings = {
  fontSizePx: 36,
  fontColor: '#ffffff',
  backgroundEnabled: true,
  backgroundOpacity: 0.5,
  position: 'bottom',
  outlineEnabled: true,
  shadowEnabled: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeHexColor(value: string | undefined): string {
  if (!value) return DEFAULT_SUBTITLE_STYLE_SETTINGS.fontColor;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return DEFAULT_SUBTITLE_STYLE_SETTINGS.fontColor;
}

export function sanitizeSubtitleStyleSettings(
  input?: Partial<SubtitleStyleSettings> | null
): SubtitleStyleSettings {
  return {
    fontSizePx: clamp(Math.round(input?.fontSizePx ?? DEFAULT_SUBTITLE_STYLE_SETTINGS.fontSizePx), 12, 96),
    fontColor: normalizeHexColor(input?.fontColor),
    backgroundEnabled: input?.backgroundEnabled ?? DEFAULT_SUBTITLE_STYLE_SETTINGS.backgroundEnabled,
    backgroundOpacity: clamp(input?.backgroundOpacity ?? DEFAULT_SUBTITLE_STYLE_SETTINGS.backgroundOpacity, 0, 1),
    position: input?.position === 'center' ? 'center' : 'bottom',
    outlineEnabled: input?.outlineEnabled ?? DEFAULT_SUBTITLE_STYLE_SETTINGS.outlineEnabled,
    shadowEnabled: input?.shadowEnabled ?? DEFAULT_SUBTITLE_STYLE_SETTINGS.shadowEnabled,
  };
}

export function loadEnvironmentSubtitleStyleSettings(): SubtitleStyleSettings {
  if (typeof window === 'undefined') return DEFAULT_SUBTITLE_STYLE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUBTITLE_STYLE_SETTINGS;
    return sanitizeSubtitleStyleSettings(JSON.parse(raw) as Partial<SubtitleStyleSettings>);
  } catch {
    return DEFAULT_SUBTITLE_STYLE_SETTINGS;
  }
}

export function saveEnvironmentSubtitleStyleSettings(settings: Partial<SubtitleStyleSettings>): SubtitleStyleSettings {
  const normalized = sanitizeSubtitleStyleSettings(settings);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore persistence failures
    }
  }
  return normalized;
}

export function getSubtitleStyleSettings(options?: {
  project?: Partial<SubtitleStyleSettings> | null;
  environment?: Partial<SubtitleStyleSettings> | null;
}): SubtitleStyleSettings {
  if (options?.project) {
    return sanitizeSubtitleStyleSettings(options.project);
  }

  if (options?.environment) {
    return sanitizeSubtitleStyleSettings(options.environment);
  }

  return loadEnvironmentSubtitleStyleSettings();
}

export function getDefaultSubtitleStyleSettings(): SubtitleStyleSettings {
  return DEFAULT_SUBTITLE_STYLE_SETTINGS;
}
