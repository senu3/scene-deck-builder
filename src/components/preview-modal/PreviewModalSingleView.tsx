import { Camera, Maximize, Pause, Play, Repeat, Scissors, SkipBack, SkipForward, X } from 'lucide-react';
import type React from 'react';
import type { Asset } from '../../types';
import { PlaybackRangeMarkers, TimeDisplay, VolumeControl } from '../shared';
import type { FocusedMarker } from '../shared';
import { PreviewResolutionPicker } from './PreviewResolutionPicker';
import { RESOLUTION_PRESETS } from './constants';
import type { ResolutionPreset } from './types';

interface PreviewModalSingleViewProps {
  modalRef: React.RefObject<HTMLDivElement>;
  displayContainerRef: React.RefObject<HTMLDivElement>;
  progressBarRef: React.RefObject<HTMLDivElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  onClose: () => void;
  onContainerMouseDown: (e: React.MouseEvent) => void;
  previewDisplayClassName: string;
  showOverlayNow: () => void;
  scheduleHideOverlay: () => void;
  asset: Asset;
  isAssetOnlyPreview: boolean;
  isLoading: boolean;
  isSingleModeVideo: boolean;
  isSingleModeImage: boolean;
  videoObjectUrl: { assetId: string; url: string } | null;
  sequenceMediaElement: JSX.Element | null;
  singleModeImageData: string | null;
  getViewportStyle: () => { width: number; height: number; scale: number } | null;
  currentFraming: React.CSSProperties;
  selectedResolution: ResolutionPreset;
  onResolutionSelect: (preset: ResolutionPreset) => void;
  previewResolutionLabel: string | null;
  showOverlay: boolean;
  inPoint: number | null;
  outPoint: number | null;
  singleModePlaybackDuration: number;
  singleModeProgressPercent: number;
  singleModePlaybackTime: number;
  focusedMarker: FocusedMarker;
  onMarkerFocus: (marker: FocusedMarker) => void;
  onMarkerDrag: (marker: 'in' | 'out', newTime: number) => void;
  onMarkerDragEnd: () => void;
  handleSingleModeProgressClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  isPlaying: boolean;
  skipBack: () => void;
  skipForward: () => void;
  togglePlay: () => void;
  handleSetInPoint: () => void;
  handleSetOutPoint: () => void;
  showSingleModeClipButton: boolean;
  isSingleModeClipEnabled: boolean;
  onClipPrimaryAction: () => void;
  isSingleModeClipPending: boolean;
  onFrameCapture?: () => void;
  isLooping: boolean;
  toggleLooping: () => void;
  globalVolume: number;
  globalMuted: boolean;
  setGlobalVolume: (volume: number) => void;
  toggleGlobalMute: () => void;
  playbackSpeed: number;
  cycleSpeedUp: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  miniToastElement: React.ReactNode;
  handleSingleModeTimeUpdate: () => void;
  handleSingleModeLoadedMetadata: () => void;
  onSingleModeVideoPlay: () => void;
  onSingleModeVideoPause: () => void;
  handleSingleModeVideoEnded: () => void;
}

export function PreviewModalSingleView({
  modalRef,
  displayContainerRef,
  progressBarRef,
  videoRef,
  onClose,
  onContainerMouseDown,
  previewDisplayClassName,
  showOverlayNow,
  scheduleHideOverlay,
  asset,
  isAssetOnlyPreview,
  isLoading,
  isSingleModeVideo,
  isSingleModeImage,
  videoObjectUrl,
  sequenceMediaElement,
  singleModeImageData,
  getViewportStyle,
  currentFraming,
  selectedResolution,
  onResolutionSelect,
  previewResolutionLabel,
  showOverlay,
  inPoint,
  outPoint,
  singleModePlaybackDuration,
  singleModeProgressPercent,
  singleModePlaybackTime,
  focusedMarker,
  onMarkerFocus,
  onMarkerDrag,
  onMarkerDragEnd,
  handleSingleModeProgressClick,
  isPlaying,
  skipBack,
  skipForward,
  togglePlay,
  handleSetInPoint,
  handleSetOutPoint,
  showSingleModeClipButton,
  isSingleModeClipEnabled,
  onClipPrimaryAction,
  isSingleModeClipPending,
  onFrameCapture,
  isLooping,
  toggleLooping,
  globalVolume,
  globalMuted,
  setGlobalVolume,
  toggleGlobalMute,
  playbackSpeed,
  cycleSpeedUp,
  isFullscreen,
  toggleFullscreen,
  miniToastElement,
  handleSingleModeTimeUpdate,
  handleSingleModeLoadedMetadata,
  onSingleModeVideoPlay,
  onSingleModeVideoPause,
  handleSingleModeVideoEnded,
}: PreviewModalSingleViewProps) {
  const viewportStyle = getViewportStyle();
  const loadingLabel = isSingleModeVideo ? 'video' : 'image';
  let mediaContent: JSX.Element;

  if (isLoading) {
    mediaContent = (
      <div className="preview-placeholder">
        <div className="loading-spinner" />
        <p>Loading {loadingLabel}...</p>
      </div>
    );
  } else if (isSingleModeVideo && videoObjectUrl?.url) {
    const videoNode = (
      <video
        ref={videoRef}
        src={videoObjectUrl.url}
        className="preview-media"
        onClick={togglePlay}
        onTimeUpdate={handleSingleModeTimeUpdate}
        onLoadedMetadata={handleSingleModeLoadedMetadata}
        onPlay={onSingleModeVideoPlay}
        onPause={onSingleModeVideoPause}
        onEnded={handleSingleModeVideoEnded}
      />
    );
    mediaContent = viewportStyle ? videoNode : (
      <>
        {videoNode}
        {!isPlaying && !isLoading && (
          <div className="play-overlay" onClick={togglePlay}>
            <Play size={40} />
          </div>
        )}
      </>
    );
  } else if (isSingleModeImage && singleModeImageData) {
    const imageNode = sequenceMediaElement ?? (
      <img
        src={singleModeImageData}
        alt={asset.name || 'Preview'}
        className="preview-media"
      />
    );
    mediaContent = imageNode;
  } else {
    mediaContent = (
      <div className="preview-placeholder">
        <p>Failed to load {loadingLabel}</p>
      </div>
    );
  }

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
              <span className="preview-title">{asset.name}</span>
              {isAssetOnlyPreview && (
                <span className="preview-badge">Asset Preview</span>
              )}
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
              {mediaContent}
            </div>
          ) : mediaContent}

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
              </div>
            </div>

            <div className="preview-overlay-row preview-overlay-row--bottom">
              {(isSingleModeVideo || isSingleModeImage) && (
                <div className="preview-progress">
                  <div
                    className="preview-progress-bar preview-progress-bar--scrub"
                    ref={progressBarRef}
                    onClick={handleSingleModeProgressClick}
                  >
                    <PlaybackRangeMarkers
                      inPoint={inPoint}
                      outPoint={outPoint}
                      duration={singleModePlaybackDuration}
                      showMilliseconds={isSingleModeVideo}
                      focusedMarker={focusedMarker}
                      onMarkerFocus={onMarkerFocus}
                      onMarkerDrag={onMarkerDrag}
                      onMarkerDragEnd={onMarkerDragEnd}
                      progressBarRef={progressBarRef}
                    />
                    <div className="preview-progress-fill" style={{ width: `${singleModeProgressPercent}%` }} />
                    <div className="preview-progress-handle" style={{ left: `${singleModeProgressPercent}%` }} />
                  </div>
                  <div className="preview-progress-info">
                    <TimeDisplay
                      currentTime={singleModePlaybackTime}
                      totalDuration={singleModePlaybackDuration}
                      showMilliseconds={isSingleModeVideo}
                    />
                  </div>
                </div>
              )}

              <div className="preview-controls-row">
                <button
                  className="preview-ctrl-btn"
                  onClick={skipBack}
                  title="Rewind 5s (←)"
                >
                  <SkipBack size={18} />
                </button>
                <button
                  className="preview-ctrl-btn preview-ctrl-btn--primary"
                  onClick={togglePlay}
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button
                  className="preview-ctrl-btn"
                  onClick={skipForward}
                  title="Forward 5s (→)"
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
                {isSingleModeVideo && showSingleModeClipButton && (
                  <button
                    className={`preview-ctrl-btn ${isSingleModeClipEnabled ? 'is-active' : ''}`}
                    onClick={onClipPrimaryAction}
                    title={isSingleModeClipEnabled ? 'Clear clip' : 'Save clip'}
                    disabled={isSingleModeClipPending}
                  >
                    <Scissors size={18} />
                  </button>
                )}
                <div className="preview-ctrl-divider" />
                {isSingleModeVideo && onFrameCapture && (
                  <button
                    className="preview-ctrl-btn"
                    onClick={onFrameCapture}
                    title="Capture frame"
                  >
                    <Camera size={18} />
                  </button>
                )}
                <button
                  className={`preview-ctrl-btn ${isLooping ? 'is-active' : ''}`}
                  onClick={toggleLooping}
                  title={`Loop (L) - ${isLooping ? 'On' : 'Off'}`}
                >
                  <Repeat size={16} />
                </button>
                <VolumeControl
                  volume={globalVolume}
                  isMuted={globalMuted}
                  onVolumeChange={setGlobalVolume}
                  onMuteToggle={toggleGlobalMute}
                />
                {isSingleModeVideo && (
                  <button
                    className="preview-ctrl-btn preview-ctrl-btn--text"
                    onClick={cycleSpeedUp}
                    title="Cycle speed"
                  >
                    {playbackSpeed.toFixed(1)}x
                  </button>
                )}
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
