import { Maximize2, Minimize2 } from 'lucide-react';
import './playback-controls.css';

interface FullscreenToggleProps {
  isFullscreen: boolean;
  onToggle: () => void;
}

export function FullscreenToggle({ isFullscreen, onToggle }: FullscreenToggleProps) {
  return (
    <button
      className="control-btn icon-btn"
      onClick={onToggle}
      title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
    >
      {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
    </button>
  );
}
