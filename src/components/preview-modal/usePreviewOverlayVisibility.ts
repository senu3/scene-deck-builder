import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePreviewOverlayVisibilityOptions {
  hideDelayMs?: number;
}

export function usePreviewOverlayVisibility(options: UsePreviewOverlayVisibilityOptions = {}) {
  const { hideDelayMs = 300 } = options;
  const [showOverlay, setShowOverlay] = useState(true);
  const overlayTimeoutRef = useRef<number | null>(null);

  const showOverlayNow = useCallback(() => {
    if (overlayTimeoutRef.current !== null) {
      window.clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }
    setShowOverlay(true);
  }, []);

  const scheduleHideOverlay = useCallback(() => {
    if (overlayTimeoutRef.current !== null) {
      window.clearTimeout(overlayTimeoutRef.current);
    }
    overlayTimeoutRef.current = window.setTimeout(() => {
      setShowOverlay(false);
      overlayTimeoutRef.current = null;
    }, hideDelayMs);
  }, [hideDelayMs]);

  useEffect(() => {
    return () => {
      if (overlayTimeoutRef.current !== null) {
        window.clearTimeout(overlayTimeoutRef.current);
      }
    };
  }, []);

  return {
    showOverlay,
    showOverlayNow,
    scheduleHideOverlay,
  };
}
