// Utility functions for video metadata extraction

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

/**
 * Convert a local file path to a media:// protocol URL for use in Electron
 * This works correctly on both Windows and Linux/Mac
 */
export function getMediaUrl(filePath: string): string {
  // Normalize path separators to forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Use encodeURI (NOT encodeURIComponent) to preserve path structure
  // encodeURIComponent breaks the URL by encoding colons and slashes
  return `media:///${encodeURI(normalizedPath)}`;
}

function revokeIfBlob(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

let sharedVideo: HTMLVideoElement | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let videoTaskQueue: Promise<void> = Promise.resolve();

function getSharedVideo(): HTMLVideoElement {
  if (!sharedVideo) {
    sharedVideo = document.createElement('video');
    sharedVideo.preload = 'metadata';
    sharedVideo.crossOrigin = 'anonymous';
  }
  return sharedVideo;
}

function getSharedCanvas(): HTMLCanvasElement {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
  }
  return sharedCanvas;
}

function enqueueVideoTask<T>(task: () => Promise<T>): Promise<T> {
  const run = videoTaskQueue.then(task, task);
  videoTaskQueue = run.then(() => undefined, () => undefined);
  return run;
}

function waitForEvent(target: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked' | 'error', timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeoutMs);

    const onEvent = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      target.removeEventListener(eventName, onEvent);
    };

    target.addEventListener(eventName, onEvent, { once: true });
  });
}

async function loadVideoForProcessing(videoUrl: string): Promise<HTMLVideoElement> {
  const video = getSharedVideo();
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.src = videoUrl;
  await waitForEvent(video, 'loadedmetadata', 15000);
  return video;
}

function cleanupVideo(video: HTMLVideoElement, videoUrl: string): void {
  revokeIfBlob(videoUrl);
  video.pause();
  video.removeAttribute('src');
  video.load();
}

/**
 * Create a streaming URL for a video file
 * Uses the media:// protocol to avoid loading the entire file into memory
 */
export async function createVideoObjectUrl(filePath: string): Promise<string | null> {
  try {
    return getMediaUrl(filePath);
  } catch (error) {
    console.error('Failed to create video object URL:', error);
    return null;
  }
}

/**
 * Extract video metadata (duration, dimensions) by loading it in a video element
 */
export async function extractVideoMetadata(filePath: string): Promise<VideoMetadata | null> {
  if (window.electronAPI?.getVideoMetadata) {
    try {
      const meta = await window.electronAPI.getVideoMetadata(filePath);
      if (meta?.duration !== undefined && meta?.width !== undefined && meta?.height !== undefined) {
        return {
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
        };
      }
    } catch {
      // Fall back to renderer-side extraction
    }
  }

  // Fallback: renderer-side extraction using shared video element
  const objectUrl = await createVideoObjectUrl(filePath);
  if (!objectUrl) {
    return null;
  }

  return enqueueVideoTask(async () => {
    try {
      const video = await loadVideoForProcessing(objectUrl);
      const metadata: VideoMetadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanupVideo(video, objectUrl);
      return metadata;
    } catch {
      cleanupVideo(getSharedVideo(), objectUrl);
      return null;
    }
  });
}

/**
 * Generate a thumbnail for a video file
 */
export async function generateVideoThumbnail(filePath: string, timeOffset: number = 1): Promise<string | null> {
  if (window.electronAPI?.generateThumbnail) {
    try {
      const result = await window.electronAPI.generateThumbnail(filePath, 'video', {
        timeOffset,
        profile: 'timeline-card',
      });
      if (result?.success && result.thumbnail) {
        return result.thumbnail;
      }
      if (result?.error) {
        console.warn('Failed to generate thumbnail:', result.error);
      }
    } catch {
      // Fall back to renderer-side extraction
    }
  }

  // Fallback: renderer-side extraction using shared video element
  const objectUrl = await createVideoObjectUrl(filePath);
  if (!objectUrl) {
    return null;
  }

  return enqueueVideoTask(async () => {
    try {
      const video = await loadVideoForProcessing(objectUrl);
      video.currentTime = Math.min(timeOffset, video.duration);
      await waitForEvent(video, 'seeked', 15000);

      const canvas = getSharedCanvas();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanupVideo(video, objectUrl);
        return null;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      cleanupVideo(video, objectUrl);
      return thumbnail;
    } catch {
      cleanupVideo(getSharedVideo(), objectUrl);
      return null;
    }
  });
}
