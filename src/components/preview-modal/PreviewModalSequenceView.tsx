import { Download, Loader2, Maximize, Pause, Play, Repeat, SkipBack, SkipForward, X } from 'lucide-react';
import type React from 'react';
import type { Asset, Cut } from '../../types';
import { PlaybackRangeMarkers } from './parts/PlaybackRangeMarkers';
import type { FocusedMarker } from './parts/PlaybackRangeMarkers';
import { TimeDisplay } from './parts/TimeDisplay';
import { VolumeControl } from './parts/VolumeControl';
import { PreviewResolutionPicker } from './PreviewResolutionPicker';
import { RESOLUTION_PRESETS } from './constants';
import type { PreviewItem, ResolutionPreset } from './types';

interface PreviewModalSequenceViewProps {
  modalRef: React.RefObject<HTMLDivElement>;
  displayContainerRef: React.RefObject<HTMLDivElement>;
  progressBarRef: React.RefObject<HTMLDivElement>;
  progressFillRef: React.RefObject<HTMLDivElement>;
  progressHandleRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onContainerMouseDown: (e: React.MouseEvent) => void;
  showOverlayNow: () => void;
  scheduleHideOverlay: () => void;
  previewDisplayClassName: string;
  items: PreviewItem[];
  missingFocusedCut: boolean;
  currentIndex: number;
  currentItem?: PreviewItem;
  sequenceMediaElement: JSX.Element | null;
  resolveAssetForCut: (cut: Cut | null | undefined) => Asset | null;
  getViewportStyle: () => { width: number; height: number; scale: number } | null;
  currentFraming: React.CSSProperties;
  selectedResolution: ResolutionPreset;
  onResolutionSelect: (preset: ResolutionPreset) => void;
  previewResolutionLabel: string | null;
  onExportFull: () => void;
  isExporting: boolean;
  isBuffering: boolean;
  showOverlay: boolean;
  inPoint: number | null;
  outPoint: number | null;
  sequenceTotalDuration: number;
  focusedMarker: FocusedMarker;
  onMarkerFocus: (marker: FocusedMarker) => void;
  onMarkerDrag: (marker: 'in' | 'out', newTime: number) => void;
  onMarkerDragEnd: () => void;
  onProgressBarMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onProgressBarHover: (e: React.MouseEvent<HTMLDivElement>) => void;
  onProgressBarLeave: () => void;
  hoverTime: string | null;
  sequenceCurrentTime: number;
  goToPrev: () => void;
  handlePlayPause: () => void;
  isPlaying: boolean;
  goToNext: () => void;
  handleSetInPoint: () => void;
  handleSetOutPoint: () => void;
  isLooping: boolean;
  toggleLooping: () => void;
  globalMuted: boolean;
  toggleGlobalMute: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  miniToastElement: React.ReactNode;
}

export function PreviewModalSequenceView({
  modalRef,
  displayContainerRef,
  progressBarRef,
  progressFillRef,
  progressHandleRef,
  onClose,
  onContainerMouseDown,
  showOverlayNow,
  scheduleHideOverlay,
  previewDisplayClassName,
  items,
  missingFocusedCut,
  currentIndex,
  currentItem,
  sequenceMediaElement,
  resolveAssetForCut,
  getViewportStyle,
  currentFraming,
  selectedResolution,
  onResolutionSelect,
  previewResolutionLabel,
  onExportFull,
  isExporting,
  isBuffering,
  showOverlay,
  inPoint,
  outPoint,
  sequenceTotalDuration,
  focusedMarker,
  onMarkerFocus,
  onMarkerDrag,
  onMarkerDragEnd,
  onProgressBarMouseDown,
  onProgressBarHover,
  onProgressBarLeave,
  hoverTime,
  sequenceCurrentTime,
  goToPrev,
  handlePlayPause,
  isPlaying,
  goToNext,
  handleSetInPoint,
  handleSetOutPoint,
  isLooping,
  toggleLooping,
  globalMuted,
  toggleGlobalMute,
  isFullscreen,
  toggleFullscreen,
  miniToastElement,
}: PreviewModalSequenceViewProps) {
  if (items.length === 0) {
    return (
      <div className="preview-modal" ref={modalRef}>
        <div className="preview-backdrop" onClick={onClose} />
        <div className="preview-container">
          <div className="preview-header preview-header--static">
            <span>Preview</span>
            <button className="preview-close-btn" onClick={onClose} title="Close (Esc)">
              <X size={20} />
            </button>
          </div>
          <div className="preview-empty">
            {missingFocusedCut ? (
              <>
                <p>Selected cut is no longer available</p>
                <p className="hint">The cut may have been deleted or moved.</p>
              </>
            ) : (
              <>
                <p>No cuts to preview</p>
                <p className="hint">Add some images or videos to your timeline first.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const viewportStyle = getViewportStyle();
  const content = sequenceMediaElement ?? (() => {
    const currentAsset = currentItem ? resolveAssetForCut(currentItem.cut) : undefined;
    if (currentAsset?.type === 'video') {
      return (
        <div className="preview-placeholder">
          <p>Loading video...</p>
        </div>
      );
    }
    return (
      <div className="preview-placeholder">
        <p>No preview available</p>
      </div>
    );
  })();

  return (
    <div className="preview-modal" ref={modalRef} onMouseDown={onContainerMouseDown}>
      <div className="preview-backdrop" onClick={onClose} />
      <div className="preview-container preview-container--compact">
        <div
          className={previewDisplayClassName}
          ref={displayContainerRef}
          onMouseEnter={showOverlayNow}
          onMouseMove={showOverlayNow}
          onMouseLeave={scheduleHideOverlay}
        >
          <div className="preview-header preview-header--compact">
            <div className="preview-header-left">
              <span className="preview-badge">{currentIndex + 1}/{items.length}</span>
              <span className="preview-title">{currentItem?.sceneName}</span>
              <span className="preview-cut-label">Cut {(currentItem?.cutIndex || 0) + 1}</span>
            </div>
            <div className="preview-header-right">
              <button className="preview-close-btn" onClick={onClose} title="Close (Esc)">
                <X size={20} />
              </button>
            </div>
          </div>

          {viewportStyle ? (
            <div
              className="resolution-viewport"
              style={{
                width: viewportStyle.width,
                height: viewportStyle.height,
                ...currentFraming,
              }}
            >
              <div className="resolution-label">
                {selectedResolution.name} ({selectedResolution.width}×{selectedResolution.height})
              </div>
              {content}
              {isBuffering && (
                <div className="buffering-overlay">
                  <Loader2 size={48} className="buffering-spinner" />
                  <span>Loading...</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {content}
              {isBuffering && (
                <div className="buffering-overlay">
                  <Loader2 size={48} className="buffering-spinner" />
                  <span>Loading...</span>
                </div>
              )}
            </>
          )}

          <div
            className={`preview-overlay ${showOverlay ? 'is-visible' : ''}`}
            onMouseEnter={showOverlayNow}
            onMouseLeave={scheduleHideOverlay}
          >
            <div className="preview-overlay-row preview-overlay-row--top">
              <div className="preview-overlay-left">
                {previewResolutionLabel && (
                  <span className="preview-resolution-badge">{previewResolutionLabel}</span>
                )}
              </div>
              <div className="preview-overlay-right">
                <PreviewResolutionPicker
                  selectedResolutionName={selectedResolution.name}
                  presets={RESOLUTION_PRESETS}
                  onSelect={onResolutionSelect}
                />
                <button
                  className="preview-icon-btn"
                  onClick={onExportFull}
                  disabled={isExporting || items.length === 0}
                  title="Export full sequence to MP4"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>

            <div className="preview-overlay-row preview-overlay-row--bottom">
              <div className="preview-progress">
                <div
                  className="preview-progress-bar preview-progress-bar--scrub"
                  ref={progressBarRef}
                  onMouseDown={onProgressBarMouseDown}
                  onMouseMove={onProgressBarHover}
                  onMouseLeave={onProgressBarLeave}
                >
                  <PlaybackRangeMarkers
                    inPoint={inPoint}
                    outPoint={outPoint}
                    duration={sequenceTotalDuration}
                    showMilliseconds={false}
                    focusedMarker={focusedMarker}
                    onMarkerFocus={onMarkerFocus}
                    onMarkerDrag={onMarkerDrag}
                    onMarkerDragEnd={onMarkerDragEnd}
                    progressBarRef={progressBarRef}
                  />
                  <div ref={progressFillRef} className="preview-progress-fill" />
                  <div ref={progressHandleRef} className="preview-progress-handle" />
                  {hoverTime && (
                    <div className="preview-progress-tooltip">
                      {hoverTime}
                    </div>
                  )}
                </div>
                <div className="preview-progress-info">
                  <TimeDisplay currentTime={sequenceCurrentTime} totalDuration={sequenceTotalDuration} />
                </div>
              </div>

              <div className="preview-controls-row">
                <button
                  className="preview-ctrl-btn"
                  onClick={goToPrev}
                  disabled={currentIndex === 0}
                  title="Previous Cut"
                >
                  <SkipBack size={18} />
                </button>
                <button
                  className="preview-ctrl-btn preview-ctrl-btn--primary"
                  onClick={handlePlayPause}
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button
                  className="preview-ctrl-btn"
                  onClick={goToNext}
                  disabled={currentIndex >= items.length - 1}
                  title="Next Cut"
                >
                  <SkipForward size={18} />
                </button>
                <div className="preview-ctrl-divider" />
                <button
                  className={`preview-ctrl-btn preview-ctrl-btn--text ${inPoint !== null ? 'is-active' : ''}`}
                  onClick={handleSetInPoint}
                  title="Set IN point (I)"
                >
                  I
                </button>
                <button
                  className={`preview-ctrl-btn preview-ctrl-btn--text ${outPoint !== null ? 'is-active' : ''}`}
                  onClick={handleSetOutPoint}
                  title="Set OUT point (O)"
                >
                  O
                </button>
                <div className="preview-ctrl-divider" />
                <button
                  className={`preview-ctrl-btn ${isLooping ? 'is-active' : ''}`}
                  onClick={toggleLooping}
                  title={`Loop (L) - ${isLooping ? 'On' : 'Off'}`}
                >
                  <Repeat size={16} />
                </button>
                <VolumeControl
                  isMuted={globalMuted}
                  onMuteToggle={toggleGlobalMute}
                />
                <button
                  className="preview-ctrl-btn"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
                >
                  <Maximize size={16} />
                </button>
                {miniToastElement}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
