import { useRef, useCallback, useState } from 'react';
import { formatTime } from '../../../utils/timeUtils';
import '../styles/playback-controls.css';

export type FocusedMarker = 'in' | 'out' | null;

interface PlaybackRangeMarkersProps {
  inPoint: number | null;
  outPoint: number | null;
  duration: number;
  showMilliseconds?: boolean;
  focusedMarker?: FocusedMarker;
  onMarkerFocus?: (marker: FocusedMarker) => void;
  onMarkerDrag?: (marker: 'in' | 'out', newTime: number) => void;
  onMarkerDragEnd?: () => void;
  progressBarRef?: React.RefObject<HTMLDivElement>;
}

export function PlaybackRangeMarkers({
  inPoint,
  outPoint,
  duration,
  showMilliseconds = true,
  focusedMarker,
  onMarkerFocus,
  onMarkerDrag,
  onMarkerDragEnd,
  progressBarRef,
}: PlaybackRangeMarkersProps) {
  const draggingMarkerRef = useRef<'in' | 'out' | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [hoveredMarker, setHoveredMarker] = useState<'in' | 'out' | null>(null);

  const calculateTimeFromMouseEvent = useCallback((e: MouseEvent | React.MouseEvent): number => {
    if (!progressBarRef?.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    return percent * duration;
  }, [progressBarRef, duration]);

  const handleMarkerMouseDown = useCallback((marker: 'in' | 'out', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    draggingMarkerRef.current = marker;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
    onMarkerFocus?.(marker);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingMarkerRef.current) return;
      const dragStart = dragStartRef.current;
      if (!didDragRef.current && dragStart) {
        const movedX = Math.abs(moveEvent.clientX - dragStart.x);
        const movedY = Math.abs(moveEvent.clientY - dragStart.y);
        if (movedX > 2 || movedY > 2) {
          didDragRef.current = true;
        }
      }
      if (!didDragRef.current) return;
      const newTime = calculateTimeFromMouseEvent(moveEvent);
      onMarkerDrag?.(draggingMarkerRef.current, newTime);
    };

    const handleMouseUp = () => {
      const didDrag = didDragRef.current;
      draggingMarkerRef.current = null;
      dragStartRef.current = null;
      didDragRef.current = false;
      if (didDrag) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        onMarkerDragEnd?.();
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [onMarkerFocus, onMarkerDrag, onMarkerDragEnd, calculateTimeFromMouseEvent]);

  const handleMarkerClick = useCallback((marker: 'in' | 'out', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (suppressClickRef.current) return;
    // Toggle focus on click (if already focused, stay focused for consistency)
    onMarkerFocus?.(marker);
  }, [onMarkerFocus]);

  if (duration <= 0) return null;

  const inPointPercent = inPoint !== null ? (inPoint / duration) * 100 : null;
  const outPointPercent = outPoint !== null ? (outPoint / duration) * 100 : null;

  const showInTooltip = inPoint !== null && (hoveredMarker === 'in' || focusedMarker === 'in');
  const showOutTooltip = outPoint !== null && (hoveredMarker === 'out' || focusedMarker === 'out');

  return (
    <>
      {/* IN point marker */}
      {inPointPercent !== null && (
        <div
          className={`timeline-marker in-marker ${focusedMarker === 'in' ? 'focused' : ''}`}
          style={{ left: `${inPointPercent}%` }}
          onClick={(e) => handleMarkerClick('in', e)}
          onMouseDown={(e) => handleMarkerMouseDown('in', e)}
          onMouseEnter={() => setHoveredMarker('in')}
          onMouseLeave={() => setHoveredMarker(null)}
        >
          {showInTooltip && (
            <span className="marker-tooltip in-tooltip">
              IN {formatTime(inPoint!, showMilliseconds)}
            </span>
          )}
        </div>
      )}

      {/* OUT point marker */}
      {outPointPercent !== null && (
        <div
          className={`timeline-marker out-marker ${focusedMarker === 'out' ? 'focused' : ''}`}
          style={{ left: `${outPointPercent}%` }}
          onClick={(e) => handleMarkerClick('out', e)}
          onMouseDown={(e) => handleMarkerMouseDown('out', e)}
          onMouseEnter={() => setHoveredMarker('out')}
          onMouseLeave={() => setHoveredMarker(null)}
        >
          {showOutTooltip && (
            <span className="marker-tooltip out-tooltip">
              OUT {formatTime(outPoint!, showMilliseconds)}
            </span>
          )}
        </div>
      )}

      {/* Selected region */}
      {inPointPercent !== null && outPointPercent !== null && (
        <div
          className="timeline-selection"
          style={{
            left: `${Math.min(inPointPercent, outPointPercent)}%`,
            width: `${Math.abs(outPointPercent - inPointPercent)}%`,
          }}
        />
      )}
    </>
  );
}
