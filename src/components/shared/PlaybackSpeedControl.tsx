import { cyclePlaybackSpeed } from '../../utils/timeUtils';
import './playback-controls.css';

interface PlaybackSpeedControlProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function PlaybackSpeedControl({ speed, onSpeedChange }: PlaybackSpeedControlProps) {
  const handleClick = () => {
    onSpeedChange(cyclePlaybackSpeed(speed, 1));
  };

  return (
    <span
      className="speed-display"
      onClick={handleClick}
      title="Click or press ] to increase, [ to decrease"
    >
      {speed}x
    </span>
  );
}
