import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateThumbnailBridge,
  readFileAsBase64Bridge,
} from '../../platform/electronGateway';
import { generateVideoThumbnail } from '../../../utils/videoUtils';
import { resolveThumbnailData } from '../provider';

vi.mock('../../platform/electronGateway', () => ({
  generateThumbnailBridge: vi.fn(),
  readFileAsBase64Bridge: vi.fn(),
}));

vi.mock('../../../utils/videoUtils', () => ({
  generateVideoThumbnail: vi.fn(),
}));

describe('thumbnail provider bridge routing', () => {
  beforeEach(() => {
    vi.mocked(generateThumbnailBridge).mockReset();
    vi.mocked(readFileAsBase64Bridge).mockReset();
    vi.mocked(generateVideoThumbnail).mockReset();
  });

  it('uses thumbnail ipc bridge when available', async () => {
    vi.mocked(generateThumbnailBridge).mockResolvedValueOnce({
      success: true,
      thumbnail: 'data:image/jpeg;base64,thumb',
    });

    const result = await resolveThumbnailData('C:/vault/assets/clip.mp4', 'video', {
      profile: 'timeline-card',
      timeOffset: 1.25,
    });

    expect(result).toBe('data:image/jpeg;base64,thumb');
    expect(generateThumbnailBridge).toHaveBeenCalledWith('C:/vault/assets/clip.mp4', 'video', {
      profile: 'timeline-card',
      timeOffset: 1.25,
    });
    expect(generateVideoThumbnail).not.toHaveBeenCalled();
  });

  it('falls back to file read bridge for images when thumbnail ipc misses', async () => {
    vi.mocked(generateThumbnailBridge).mockResolvedValueOnce(null);
    vi.mocked(readFileAsBase64Bridge).mockResolvedValueOnce('data:image/png;base64,image');

    const result = await resolveThumbnailData('C:/vault/assets/image.png', 'image', {
      profile: 'asset-grid',
    });

    expect(result).toBe('data:image/png;base64,image');
    expect(readFileAsBase64Bridge).toHaveBeenCalledWith('C:/vault/assets/image.png');
  });

  it('falls back to renderer video thumbnail generation when ipc misses for videos', async () => {
    vi.mocked(generateThumbnailBridge).mockResolvedValueOnce({
      success: false,
      error: 'unavailable',
    });
    vi.mocked(generateVideoThumbnail).mockResolvedValueOnce('data:image/jpeg;base64,fallback');

    const result = await resolveThumbnailData('C:/vault/assets/clip.mp4', 'video', {
      profile: 'timeline-card',
      timeOffset: 2.5,
    });

    expect(result).toBe('data:image/jpeg;base64,fallback');
    expect(generateVideoThumbnail).toHaveBeenCalledWith('C:/vault/assets/clip.mp4', 2.5);
    expect(readFileAsBase64Bridge).not.toHaveBeenCalled();
  });
});
