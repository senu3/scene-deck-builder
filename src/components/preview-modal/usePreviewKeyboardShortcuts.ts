import { useEffect } from 'react';
import { isEditableTarget } from './helpers';

interface UsePreviewKeyboardShortcutsInput {
  onClose: () => void;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedDown: () => void;
  onSpeedUp: () => void;
  onToggleFullscreen: () => void;
  onToggleLooping: () => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onToggleMute: () => void;
}

export function usePreviewKeyboardShortcuts({
  onClose,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onStepBack,
  onStepForward,
  onSpeedDown,
  onSpeedUp,
  onToggleFullscreen,
  onToggleLooping,
  onSetInPoint,
  onSetOutPoint,
  onToggleMute,
}: UsePreviewKeyboardShortcutsInput) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case ' ':
          e.preventDefault();
          onPlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onSkipBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          onSkipForward();
          break;
        case ',':
          e.preventDefault();
          onStepBack();
          break;
        case '.':
          e.preventDefault();
          onStepForward();
          break;
        case '[':
          e.preventDefault();
          onSpeedDown();
          break;
        case ']':
          e.preventDefault();
          onSpeedUp();
          break;
        case 'f':
          onToggleFullscreen();
          break;
        case 'l':
          onToggleLooping();
          break;
        case 'i':
          onSetInPoint();
          break;
        case 'o':
          onSetOutPoint();
          break;
        case 'm':
          onToggleMute();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onClose,
    onPlayPause,
    onSkipBack,
    onSkipForward,
    onStepBack,
    onStepForward,
    onSpeedDown,
    onSpeedUp,
    onToggleFullscreen,
    onToggleLooping,
    onSetInPoint,
    onSetOutPoint,
    onToggleMute,
  ]);
}
