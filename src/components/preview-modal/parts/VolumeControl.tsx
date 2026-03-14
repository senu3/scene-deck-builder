import { Volume2, VolumeX } from 'lucide-react';

interface VolumeControlProps {
  isMuted: boolean;
  onMuteToggle: () => void;
}

export function VolumeControl({
  isMuted,
  onMuteToggle,
}: VolumeControlProps) {
  return (
    <button
      className={`preview-ctrl-btn ${isMuted ? 'is-active' : ''}`}
      onClick={onMuteToggle}
      title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
    >
      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}
