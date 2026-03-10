import { useEffect, useMemo, useState } from 'react';
import type { DevOverlayPanel } from '../DevOverlayHost';
import {
  getEffectActivityEntries,
  subscribeEffectActivity,
} from '../../features/platform/effects/effectActivity';

const MAX_VISIBLE_ENTRIES = 8;

function formatEntryLine(
  entry: ReturnType<typeof getEffectActivityEntries>[number]
): string {
  const commandLabel = entry.commandType || entry.commandId || 'direct';
  const suffix = entry.reason ? ` reason=${entry.reason}` : '';
  return `#${entry.seq} ${entry.stage} ${entry.effectType} ${entry.channel} key=${entry.orderingKey} cmd=${commandLabel}${suffix}`;
}

export function useEffectActivityDebugModule(): DevOverlayPanel | null {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return subscribeEffectActivity(() => {
      setVersion((value) => value + 1);
    });
  }, []);

  const lines = useMemo(() => {
    const entries = getEffectActivityEntries();
    if (entries.length === 0) return ['no effect activity'];
    return entries
      .slice(-MAX_VISIBLE_ENTRIES)
      .reverse()
      .map((entry) => formatEntryLine(entry));
  }, [version]);

  return {
    id: 'effect-activity-debug',
    title: '[EFFECT ACTIVITY]',
    lines,
  };
}
