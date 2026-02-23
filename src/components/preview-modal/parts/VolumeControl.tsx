import { Volume2, VolumeX } from 'lucide-react';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
}: VolumeControlProps) {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseFloat(e.target.value));
  };

  return (
    <div className="preview-volume-control">
      <button
        className="preview-ctrl-btn"
        onClick={onMuteToggle}
        title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
      >
        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <div className="preview-volume-popup">
        <input
          type="range"
          className="preview-volume-slider"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={handleSliderChange}
          title="Volume (↑/↓)"
        />
      </div>
    </div>
  );
}
