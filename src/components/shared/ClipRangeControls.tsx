import { Save } from 'lucide-react';
import { formatTime } from '../../utils/timeUtils';
import './playback-controls.css';

interface ClipRangeControlsProps {
  inPoint: number | null;
  outPoint: number | null;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onClear: () => void;
  onSave?: () => void;
  showSaveButton?: boolean;
  showMilliseconds?: boolean;
}

export function ClipRangeControls({
  inPoint,
  outPoint,
  onSetInPoint,
  onSetOutPoint,
  onClear,
  onSave,
  showSaveButton = false,
  showMilliseconds = true,
}: ClipRangeControlsProps) {
  const hasInPoint = inPoint !== null;
  const hasRange = inPoint !== null && outPoint !== null;
  const clipDuration = hasRange ? Math.abs(outPoint - inPoint) : 0;

  return (
    <div className="clip-range-controls">
      {/* IN/OUT point buttons */}
      <button
        className={`control-btn edit-btn ${inPoint !== null ? 'active' : ''}`}
        onClick={onSetInPoint}
        title="Set IN point (I)"
      >
        IN
      </button>
      <button
        className={`control-btn edit-btn ${outPoint !== null ? 'active' : ''}`}
        onClick={onSetOutPoint}
        title="Set OUT point (O)"
      >
        OUT
      </button>

      {/* Show Save/Clear when IN point is set (not just when both are set) */}
      {hasInPoint && (
        <>
          {/* Duration only shown when both points are set */}
          {hasRange && (
            <span className="clip-duration">
              {formatTime(clipDuration, showMilliseconds)}
            </span>
          )}
          {showSaveButton && onSave && (
            <button
              className="control-btn save-clip-btn"
              onClick={onSave}
              title={hasRange ? "Save clip" : "Capture frame"}
            >
              <Save size={16} />
              <span>Save</span>
            </button>
          )}
          <button
            className="control-btn clear-btn"
            onClick={onClear}
            title="Clear IN/OUT points"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
