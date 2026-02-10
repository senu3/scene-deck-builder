import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { FfmpegController } from './ffmpegController';

export type ThumbnailMediaType = 'image' | 'video';
export type ThumbnailProfile = 'timeline-card' | 'asset-grid' | 'sequence-preview' | 'details-panel';

export interface GenerateThumbnailRequest {
  filePath: string;
  type: ThumbnailMediaType;
  timeOffset?: number;
  profile?: ThumbnailProfile;
}

export interface GenerateThumbnailResponse {
  success: boolean;
  thumbnail?: string;
  error?: string;
  cachePath?: string;
}

interface ThumbnailProfileSpec {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

const THUMBNAIL_PROFILES: Record<ThumbnailProfile, ThumbnailProfileSpec> = {
  'timeline-card': {
    maxWidth: 320,
    maxHeight: 320,
    quality: 6,
  },
  'asset-grid': {
    maxWidth: 256,
    maxHeight: 256,
    quality: 7,
  },
  'sequence-preview': {
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 3,
  },
  'details-panel': {
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 3,
  },
};

function getProfileSpec(profile?: ThumbnailProfile): ThumbnailProfileSpec {
  return THUMBNAIL_PROFILES[profile || 'timeline-card'];
}

function createCacheKey(request: GenerateThumbnailRequest): string {
  const stats = fs.statSync(request.filePath);
  const profile = request.profile || 'timeline-card';
  const payload = JSON.stringify({
    path: request.filePath,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    type: request.type,
    timeOffset: request.timeOffset ?? 0,
    profile,
  });
  return crypto.createHash('sha1').update(payload).digest('hex');
}

function toDataUrl(jpegPath: string): string {
  const buffer = fs.readFileSync(jpegPath);
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

function buildScaleFilter(profile: ThumbnailProfileSpec): string {
  return [
    `scale=w=${profile.maxWidth}:h=${profile.maxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    `pad=${profile.maxWidth}:${profile.maxHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'format=yuv420p',
  ].join(',');
}

export function createThumbnailService(
  controller: FfmpegController,
  options?: {
    getStderrMaxBytes?: () => number;
  }
) {
  const cacheDir = path.join(os.tmpdir(), 'ai-scene-deck', 'thumb-cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  const generateThumbnail = async (request: GenerateThumbnailRequest): Promise<GenerateThumbnailResponse> => {
    try {
      const profileSpec = getProfileSpec(request.profile);
      const cacheKey = createCacheKey(request);
      const outputPath = path.join(cacheDir, `${cacheKey}.jpg`);
      if (fs.existsSync(outputPath)) {
        return {
          success: true,
          thumbnail: toDataUrl(outputPath),
          cachePath: outputPath,
        };
      }

      const safeTime = Math.max(0, request.timeOffset ?? 0);
      const filter = buildScaleFilter(profileSpec);
      const args: string[] = ['-hide_banner'];

      if (request.type === 'video') {
        args.push('-ss', String(safeTime));
      }

      args.push(
        '-i',
        request.filePath,
        '-frames:v',
        '1',
        '-vf',
        filter,
        '-q:v',
        String(profileSpec.quality),
        '-y',
        outputPath
      );

      const stderrMaxBytes = Math.max(1024, options?.getStderrMaxBytes?.() ?? 128 * 1024);
      const result = await controller.runLight(args, { stderrMaxBytes });
      if (result.code !== 0 || !fs.existsSync(outputPath)) {
        return {
          success: false,
          error: result.stderr || `ffmpeg exited with code ${result.code}`,
        };
      }

      return {
        success: true,
        thumbnail: toDataUrl(outputPath),
        cachePath: outputPath,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'thumbnail generation failed',
      };
    }
  };

  return {
    generateThumbnail,
  };
}
