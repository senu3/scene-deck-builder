export type SceneDurationBarMode = 'relative' | 'target';

export interface DurationTargetSettings {
  envDefaultTargetSec?: number;
  sceneDurationBarMode: SceneDurationBarMode;
}

const STORAGE_KEY = 'scene-deck.duration-target-settings.v1';

const DEFAULT_SETTINGS: DurationTargetSettings = {
  envDefaultTargetSec: undefined,
  sceneDurationBarMode: 'relative',
};

function normalizeSec(value: unknown): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const num = Math.floor(Number(value));
  return num > 0 ? num : undefined;
}

export function resolveEffectiveTargetDurationSec(
  projectTargetSec?: number,
  envDefaultTargetSec?: number
): number | undefined {
  return normalizeSec(projectTargetSec) ?? normalizeSec(envDefaultTargetSec);
}

export function getDurationTargetSettings(): DurationTargetSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DurationTargetSettings>;
    const sceneDurationBarMode = parsed.sceneDurationBarMode === 'target' ? 'target' : 'relative';
    return {
      envDefaultTargetSec: normalizeSec(parsed.envDefaultTargetSec),
      sceneDurationBarMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveDurationTargetSettings(
  partial: Partial<DurationTargetSettings>
): DurationTargetSettings {
  const current = getDurationTargetSettings();
  const merged: DurationTargetSettings = {
    envDefaultTargetSec:
      partial.envDefaultTargetSec === undefined
        ? current.envDefaultTargetSec
        : normalizeSec(partial.envDefaultTargetSec),
    sceneDurationBarMode:
      partial.sceneDurationBarMode === 'target' ? 'target' : partial.sceneDurationBarMode === 'relative' ? 'relative' : current.sceneDurationBarMode,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore localStorage failures
  }

  return merged;
}
