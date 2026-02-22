import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ResolutionPreset } from './types';

export function usePreviewViewport(selectedResolution: ResolutionPreset) {
  const displayContainerRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const updateDisplaySize = () => {
      if (!displayContainerRef.current) return;
      const rect = displayContainerRef.current.getBoundingClientRect();
      setDisplaySize({ width: rect.width, height: rect.height });
    };

    updateDisplaySize();
    window.addEventListener('resize', updateDisplaySize);
    return () => window.removeEventListener('resize', updateDisplaySize);
  }, [selectedResolution]);

  const getViewportStyle = useCallback(() => {
    if (selectedResolution.width === 0) return null;

    const targetWidth = selectedResolution.width;
    const targetHeight = selectedResolution.height;
    const containerWidth = displaySize.width > 0 ? displaySize.width : 800;
    const containerHeight = displaySize.height > 0 ? displaySize.height : 600;

    const scaleX = containerWidth / targetWidth;
    const scaleY = containerHeight / targetHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9;

    return {
      width: targetWidth * scale,
      height: targetHeight * scale,
      scale,
    };
  }, [selectedResolution, displaySize]);

  return {
    displayContainerRef,
    getViewportStyle,
  };
}
