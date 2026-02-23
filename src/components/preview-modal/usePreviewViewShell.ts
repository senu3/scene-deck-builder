import type React from 'react';
import type { ResolutionPreset } from './types';
import { usePreviewFullscreen } from './usePreviewFullscreen';
import { usePreviewOverlayVisibility } from './usePreviewOverlayVisibility';
import { usePreviewViewport } from './usePreviewViewport';

interface UsePreviewViewShellInput {
  modalRef: React.RefObject<HTMLDivElement>;
  selectedResolution: ResolutionPreset;
  overlayHideDelayMs?: number;
}

export function usePreviewViewShell({
  modalRef,
  selectedResolution,
  overlayHideDelayMs = 300,
}: UsePreviewViewShellInput) {
  const { showOverlay, showOverlayNow, scheduleHideOverlay } = usePreviewOverlayVisibility({
    hideDelayMs: overlayHideDelayMs,
  });
  const { displayContainerRef, getViewportStyle } = usePreviewViewport(selectedResolution);
  const { isFullscreen, toggleFullscreen } = usePreviewFullscreen(modalRef);

  return {
    showOverlay,
    showOverlayNow,
    scheduleHideOverlay,
    displayContainerRef,
    getViewportStyle,
    isFullscreen,
    toggleFullscreen,
  };
}
