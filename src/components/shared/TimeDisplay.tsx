import { formatTime } from '../../utils/timeUtils';
import './playback-controls.css';

interface TimeDisplayProps {
  currentTime: number;
  totalDuration: number;
  showMilliseconds?: boolean;
}

export function TimeDisplay({ currentTime, totalDuration, showMilliseconds = false }: TimeDisplayProps) {
  return (
    <span className="time-display">
      {formatTime(currentTime, showMilliseconds)} / {formatTime(totalDuration, showMilliseconds)}
    </span>
  );
}
