import type { MutableRefObject } from 'react';

export type MediaSourceKind = 'video' | 'image';

export interface MediaSource {
  kind: MediaSourceKind;
  element: JSX.Element;
  play(): void;
  pause(): void;
  seek(localTimeSec: number): void;
  setRate(rate: number): void;
  getCurrentTime(): number;
  dispose(): void;
}

interface BaseMediaSourceOptions {
  className: string;
  onTimeUpdate?: (localTimeSec: number) => void;
  onEnded?: () => void;
}

interface VideoMediaSourceOptions extends BaseMediaSourceOptions {
  src: string;
  muted: boolean;
  refObject?: MutableRefObject<HTMLVideoElement | null>;
  key?: string;
  inPoint?: number;
  outPoint?: number;
}

interface VideoHoldMediaSourceOptions extends BaseMediaSourceOptions {
  src: string;
  muted: boolean;
  duration: number;
  frameTimeSec: number;
  refObject?: MutableRefObject<HTMLVideoElement | null>;
  key?: string;
}

interface ImageMediaSourceOptions extends BaseMediaSourceOptions {
  src: string;
  alt: string;
  duration: number;
}

class PreviewClock {
  private duration: number;
  private currentTimeSec: number;
  private rate: number;
  private isPlaying: boolean;
  private intervalId: number | null;
  private lastTickMs: number;
  private onTimeUpdate?: (t: number) => void;
  private onEnded?: () => void;

  constructor(duration: number, onTimeUpdate?: (t: number) => void, onEnded?: () => void) {
    this.duration = Math.max(0, duration);
    this.currentTimeSec = 0;
    this.rate = 1;
    this.isPlaying = false;
    this.intervalId = null;
    this.lastTickMs = 0;
    this.onTimeUpdate = onTimeUpdate;
    this.onEnded = onEnded;
  }

  play() {
    if (this.isPlaying) return;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPlaying = true;
    this.lastTickMs = Date.now();
    this.intervalId = window.setInterval(this.tick, 50);
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  seek(timeSec: number) {
    const clamped = Math.max(0, Math.min(this.duration, timeSec));
    this.currentTimeSec = clamped;
    this.onTimeUpdate?.(this.currentTimeSec);
  }

  setRate(rate: number) {
    this.rate = rate;
  }

  getCurrentTime() {
    return this.currentTimeSec;
  }

  dispose() {
    this.pause();
  }

  private tick = () => {
    // Hotpath rule (Gate 10): time progression only, no heavy processing.
    if (!this.isPlaying) return;

    const nowMs = Date.now();
    const deltaSec = ((nowMs - this.lastTickMs) / 1000) * this.rate;
    this.lastTickMs = nowMs;
    this.currentTimeSec = Math.min(this.duration, this.currentTimeSec + deltaSec);
    this.onTimeUpdate?.(this.currentTimeSec);

    if (this.currentTimeSec >= this.duration) {
      this.isPlaying = false;
      if (this.intervalId !== null) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.onEnded?.();
      return;
    }

  };
}

export function createVideoMediaSource(options: VideoMediaSourceOptions): MediaSource {
  let videoEl: HTMLVideoElement | null = null;
  let endedCalled = false;
  let normalizedInPoint = options.inPoint ?? 0;
  let normalizedOutPoint: number | undefined = options.outPoint;
  let shouldPlay = false;
  let pendingRate = 1;
  let pendingSeek: number | null = null;
  let metadataLoaded = false;

  const setVideoEl = (el: HTMLVideoElement | null) => {
    videoEl = el;
    if (options.refObject) {
      options.refObject.current = el;
    }
    if (!videoEl) return;
    // When React reuses a loaded <video>, onLoadedMetadata may not fire again.
    if (videoEl.readyState >= 1) {
      metadataLoaded = true;
      const duration = videoEl.duration || 0;
      normalizedInPoint = Math.max(0, Math.min(duration, options.inPoint ?? 0));
      if (typeof options.outPoint === 'number') {
        normalizedOutPoint = Math.max(normalizedInPoint, Math.min(options.outPoint, duration));
      } else {
        normalizedOutPoint = undefined;
      }
      if (pendingSeek !== null) {
        const nextSeek = pendingSeek;
        pendingSeek = null;
        applySeek(nextSeek);
      } else if (normalizedInPoint > 0) {
        videoEl.currentTime = normalizedInPoint;
      }
    }
    videoEl.playbackRate = pendingRate;
    if (shouldPlay) {
      videoEl.play().catch(() => {});
    }
  };

  const getLocalTime = () => {
    if (!videoEl) return 0;
    const inPoint = options.inPoint ?? 0;
    return Math.max(0, videoEl.currentTime - inPoint);
  };

  const applySeek = (localTimeSec: number) => {
    if (!videoEl) {
      pendingSeek = localTimeSec;
      return;
    }
    const duration = videoEl.duration || 0;
    const inPoint = Math.max(0, Math.min(duration, normalizedInPoint));
    const outPoint = typeof normalizedOutPoint === 'number'
      ? Math.max(inPoint, Math.min(normalizedOutPoint, duration))
      : duration;
    const target = inPoint + localTimeSec;
    if (target < outPoint - 0.05) {
      endedCalled = false;
    }
    videoEl.currentTime = Math.max(inPoint, Math.min(outPoint, target));
  };

  const handleTimeUpdate = () => {
    if (!videoEl) return;
    const duration = videoEl.duration || 0;
    const inPoint = Math.max(0, Math.min(duration, normalizedInPoint));
    const outPoint = typeof normalizedOutPoint === 'number'
      ? Math.max(inPoint, Math.min(normalizedOutPoint, duration))
      : undefined;
    const localTime = Math.max(0, videoEl.currentTime - inPoint);
    options.onTimeUpdate?.(localTime);

    if (typeof outPoint === 'number') {
      if (videoEl.currentTime >= outPoint - 0.001) {
        if (!endedCalled) {
          endedCalled = true;
          options.onEnded?.();
        }
      } else if (videoEl.currentTime < outPoint - 0.05 && endedCalled) {
        endedCalled = false;
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoEl) return;
    metadataLoaded = true;
    const duration = videoEl.duration || 0;
    normalizedInPoint = Math.max(0, Math.min(duration, options.inPoint ?? 0));
    if (typeof options.outPoint === 'number') {
      normalizedOutPoint = Math.max(normalizedInPoint, Math.min(options.outPoint, duration));
    } else {
      normalizedOutPoint = undefined;
    }
    if (pendingSeek !== null) {
      const nextSeek = pendingSeek;
      pendingSeek = null;
      applySeek(nextSeek);
      return;
    }
    if (normalizedInPoint > 0) {
      videoEl.currentTime = normalizedInPoint;
    }
  };

  const handleEnded = () => {
    if (!endedCalled) {
      endedCalled = true;
      options.onEnded?.();
    }
  };

  return {
    kind: 'video',
    element: (
      <video
        ref={setVideoEl}
        key={options.key ?? options.src}
        src={options.src}
        className={options.className}
        muted={options.muted}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
    ),
    play() {
      shouldPlay = true;
      videoEl?.play().catch(() => {});
    },
    pause() {
      shouldPlay = false;
      videoEl?.pause();
    },
    seek(localTimeSec: number) {
      if (!metadataLoaded) {
        pendingSeek = localTimeSec;
        return;
      }
      applySeek(localTimeSec);
    },
    setRate(rate: number) {
      pendingRate = rate;
      if (videoEl) {
        videoEl.playbackRate = rate;
      }
    },
    getCurrentTime() {
      return getLocalTime();
    },
    dispose() {
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      videoEl = null;
    },
  };
}

export function createImageMediaSource(options: ImageMediaSourceOptions): MediaSource {
  const clock = new PreviewClock(options.duration, options.onTimeUpdate, options.onEnded);

  return {
    kind: 'image',
    element: (
      <img
        src={options.src}
        alt={options.alt}
        className={options.className}
      />
    ),
    play() {
      clock.play();
    },
    pause() {
      clock.pause();
    },
    seek(localTimeSec: number) {
      clock.seek(localTimeSec);
    },
    setRate(rate: number) {
      clock.setRate(rate);
    },
    getCurrentTime() {
      return clock.getCurrentTime();
    },
    dispose() {
      clock.dispose();
    },
  };
}

export function createVideoHoldMediaSource(options: VideoHoldMediaSourceOptions): MediaSource {
  const clock = new PreviewClock(options.duration, options.onTimeUpdate, options.onEnded);
  let videoEl: HTMLVideoElement | null = null;
  let metadataLoaded = false;
  let shouldPlay = false;
  let pendingRate = 1;

  const syncFrame = () => {
    if (!videoEl || !metadataLoaded) return;
    const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    const target = Math.max(0, Math.min(duration, options.frameTimeSec));
    if (Math.abs(videoEl.currentTime - target) > 0.001) {
      videoEl.currentTime = target;
    }
  };

  const setVideoEl = (el: HTMLVideoElement | null) => {
    videoEl = el;
    if (options.refObject) {
      options.refObject.current = el;
    }
    if (!videoEl) return;
    videoEl.playbackRate = pendingRate;
    if (videoEl.readyState >= 1) {
      metadataLoaded = true;
      syncFrame();
      videoEl.pause();
    }
    if (shouldPlay) {
      clock.play();
    }
  };

  return {
    kind: 'video',
    element: (
      <video
        ref={setVideoEl}
        key={options.key ?? options.src}
        src={options.src}
        className={options.className}
        muted={options.muted}
        onLoadedMetadata={() => {
          metadataLoaded = true;
          syncFrame();
        }}
        onSeeked={syncFrame}
      />
    ),
    play() {
      shouldPlay = true;
      clock.play();
      videoEl?.pause();
      syncFrame();
    },
    pause() {
      shouldPlay = false;
      clock.pause();
      videoEl?.pause();
    },
    seek(localTimeSec: number) {
      clock.seek(localTimeSec);
      syncFrame();
    },
    setRate(rate: number) {
      pendingRate = rate;
      clock.setRate(rate);
      if (videoEl) {
        videoEl.playbackRate = rate;
      }
    },
    getCurrentTime() {
      return clock.getCurrentTime();
    },
    dispose() {
      clock.dispose();
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      videoEl = null;
    },
  };
}
