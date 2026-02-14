import { formatTimeCode } from '../hooks/useStoryTimelinePosition';
import styles from './DurationTargetGauge.module.css';

interface DurationTargetGaugeProps {
  totalSec: number;
  targetSec?: number;
}

function formatSignedOver(overSec: number): string {
  return `+${formatTimeCode(overSec)}`;
}

export default function DurationTargetGauge({ totalSec, targetSec }: DurationTargetGaugeProps) {
  const safeTarget = Number.isFinite(targetSec) && (targetSec as number) > 0 ? (targetSec as number) : 0;
  if (!safeTarget) return null;

  const ratioRaw = totalSec / safeTarget;
  const ratio = Math.max(0, Math.min(ratioRaw, 1));
  const percent = Math.round(ratioRaw * 100);
  const overSec = Math.max(0, totalSec - safeTarget);
  const remainingSec = Math.max(0, safeTarget - totalSec);
  const over = overSec > 0;
  const title = over
    ? `Total ${formatTimeCode(totalSec)} / Target ${formatTimeCode(safeTarget)} (${percent}%)\nOver ${formatSignedOver(overSec)}`
    : `Total ${formatTimeCode(totalSec)} / Target ${formatTimeCode(safeTarget)} (${percent}%)\nRemaining ${formatTimeCode(remainingSec)}`;

  return (
    <div
      className={styles.gaugeWrap}
      title={title}
      aria-label="Target duration progress"
      data-over={over ? 'true' : 'false'}
      data-ratio={ratioRaw.toFixed(4)}
    >
      <div className={styles.gauge} data-over={over ? 'true' : 'false'}>
        <div className={styles.fill} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
