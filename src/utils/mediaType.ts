export type MediaType = 'image' | 'video' | 'audio';
export type CuttableMediaType = 'image' | 'video';
// TODO(rename-cleanup): Remove TimelineMediaType alias after all callers migrate to CuttableMediaType.
// Backward compatibility alias. Prefer CuttableMediaType for new code.
export type TimelineMediaType = CuttableMediaType;

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']);

function getExtension(filename: string): string {
  return filename.toLowerCase().split('.').pop() || '';
}

export function getMediaType(filename: string): MediaType | null {
  const ext = getExtension(filename);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return null;
}

export function getCuttableMediaType(filename: string): CuttableMediaType | null {
  const mediaType = getMediaType(filename);
  if (mediaType === 'image' || mediaType === 'video') {
    return mediaType;
  }
  return null;
}

// Backward compatibility alias. Prefer getCuttableMediaType for new code.
// TODO(rename-cleanup): Remove getTimelineMediaType alias after all callers migrate to getCuttableMediaType.
export function getTimelineMediaType(filename: string): TimelineMediaType | null {
  return getCuttableMediaType(filename);
}
