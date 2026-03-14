import { useEffect, useState, type RefObject } from 'react';

export type FloatingDirection = 'top' | 'bottom' | 'left' | 'right';
export type PortalContainer = Element | DocumentFragment | null;

interface FloatingCoords {
  x: number;
  y: number;
}

interface AnchoredPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  floatingRef: RefObject<HTMLElement | null>;
  position: FloatingDirection;
  gap?: number;
  viewportPadding?: number;
}

interface FixedPointPositionOptions {
  open: boolean;
  floatingRef: RefObject<HTMLElement | null>;
  position: FloatingCoords;
  viewportPadding?: number;
}

const DEFAULT_COORDS: FloatingCoords = { x: 0, y: 0 };

function clampToViewport(value: number, size: number, viewportSize: number, viewportPadding: number) {
  return Math.max(viewportPadding, Math.min(value, viewportSize - size - viewportPadding));
}

function getViewportBounds() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function resolvePortalContainer(portalContainer?: PortalContainer) {
  return portalContainer ?? document.body;
}

export function calculateAnchoredPosition(
  anchorRect: DOMRect,
  floatingRect: DOMRect,
  position: FloatingDirection,
  gap = 8,
  viewportPadding = 8
): FloatingCoords {
  let x = 0;
  let y = 0;

  switch (position) {
    case 'top':
      x = anchorRect.left + anchorRect.width / 2 - floatingRect.width / 2;
      y = anchorRect.top - floatingRect.height - gap;
      break;
    case 'bottom':
      x = anchorRect.left + anchorRect.width / 2 - floatingRect.width / 2;
      y = anchorRect.bottom + gap;
      break;
    case 'left':
      x = anchorRect.left - floatingRect.width - gap;
      y = anchorRect.top + anchorRect.height / 2 - floatingRect.height / 2;
      break;
    case 'right':
      x = anchorRect.right + gap;
      y = anchorRect.top + anchorRect.height / 2 - floatingRect.height / 2;
      break;
  }

  const viewport = getViewportBounds();

  return {
    x: clampToViewport(x, floatingRect.width, viewport.width, viewportPadding),
    y: clampToViewport(y, floatingRect.height, viewport.height, viewportPadding),
  };
}

export function calculateFixedPointPosition(
  point: FloatingCoords,
  floatingRect: DOMRect,
  viewportPadding = 8
): FloatingCoords {
  const viewport = getViewportBounds();

  return {
    x: clampToViewport(point.x, floatingRect.width, viewport.width, viewportPadding),
    y: clampToViewport(point.y, floatingRect.height, viewport.height, viewportPadding),
  };
}

export function useAnchoredPosition({
  open,
  anchorRef,
  floatingRef,
  position,
  gap = 8,
  viewportPadding = 8,
}: AnchoredPositionOptions) {
  const [coords, setCoords] = useState<FloatingCoords>(DEFAULT_COORDS);

  useEffect(() => {
    if (!open || !anchorRef.current || !floatingRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current || !floatingRef.current) {
        return;
      }

      setCoords(
        calculateAnchoredPosition(
          anchorRef.current.getBoundingClientRect(),
          floatingRef.current.getBoundingClientRect(),
          position,
          gap,
          viewportPadding
        )
      );
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, anchorRef, floatingRef, position, gap, viewportPadding]);

  return coords;
}

export function useFixedPointPosition({
  open,
  floatingRef,
  position,
  viewportPadding = 8,
}: FixedPointPositionOptions) {
  const [coords, setCoords] = useState<FloatingCoords>(position);

  useEffect(() => {
    if (!open || !floatingRef.current) {
      setCoords(position);
      return;
    }

    const updatePosition = () => {
      if (!floatingRef.current) {
        return;
      }

      setCoords(
        calculateFixedPointPosition(
          position,
          floatingRef.current.getBoundingClientRect(),
          viewportPadding
        )
      );
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, floatingRef, position, viewportPadding]);

  return coords;
}
