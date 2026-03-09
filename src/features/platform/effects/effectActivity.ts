import type { AppEffect } from './effects';

export type AppEffectActivityStage = 'issued' | 'start' | 'success' | 'failure';

export interface AppEffectActivityEntry {
  seq: number;
  stage: AppEffectActivityStage;
  at: string;
  effectType: AppEffect['type'];
  channel: AppEffect['channel'];
  orderingKey: string;
  commandId?: string;
  commandType?: string;
  reason?: string;
}

const MAX_ACTIVITY_ENTRIES = 200;
let nextSeq = 1;
const activityEntries: AppEffectActivityEntry[] = [];

export function recordEffectActivity(entry: Omit<AppEffectActivityEntry, 'seq' | 'at'>): void {
  if (!import.meta.env.DEV) return;

  activityEntries.push({
    seq: nextSeq++,
    at: new Date().toISOString(),
    ...entry,
  });

  if (activityEntries.length > MAX_ACTIVITY_ENTRIES) {
    activityEntries.splice(0, activityEntries.length - MAX_ACTIVITY_ENTRIES);
  }
}

export function getEffectActivityEntries(): AppEffectActivityEntry[] {
  return [...activityEntries];
}

export function __resetEffectActivityForTests(): void {
  activityEntries.length = 0;
  nextSeq = 1;
}
