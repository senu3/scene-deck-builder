export type SceneDurationBarMode = 'relative' | 'target';
export const DURATION_TARGET_SETTINGS_CHANGED_EVENT = 'scene-duration-target-settings-changed';

export interface DurationTargetSettings {
  sceneDurationBarMode: SceneDurationBarMode;
}

const STORAGE_KEY = 'scene-deck.duration-target-settings.v1';

const DEFAULT_SETTINGS: DurationTargetSettings = {
  sceneDurationBarMode: 'relative',
};

function normalizeSec(value: unknown): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const num = Math.floor(Number(value));
  return num > 0 ? num : undefined;
}

export function resolveProjectTargetDurationSec(projectTargetSec?: number): number | undefined {
  return normalizeSec(projectTargetSec);
}

export function getDurationTargetSettings(): DurationTargetSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DurationTargetSettings>;
    const sceneDurationBarMode = parsed.sceneDurationBarMode === 'target' ? 'target' : 'relative';
    return {
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
    sceneDurationBarMode:
      partial.sceneDurationBarMode === 'target' ? 'target' : partial.sceneDurationBarMode === 'relative' ? 'relative' : current.sceneDurationBarMode,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(DURATION_TARGET_SETTINGS_CHANGED_EVENT, { detail: merged }));
  } catch {
    // ignore localStorage failures
  }

  return merged;
}
