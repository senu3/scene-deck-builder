import { useCallback, useState } from 'react';
import type React from 'react';

export function usePreviewFullscreen(modalRef: React.RefObject<HTMLDivElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && modalRef.current) {
      void modalRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, [modalRef]);

  return {
    isFullscreen,
    toggleFullscreen,
  };
}
