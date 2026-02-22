import type { ResolutionPreset } from './types';
import { asCanonicalDurationSec } from '../../utils/storyTiming';

// Lazy-load and playback guard constants.
export const PLAY_SAFE_AHEAD = 2.0; // seconds - minimum buffer required for playback
export const PRELOAD_AHEAD = 30.0; // seconds - preload this much ahead for smoother playback
export const INITIAL_PRELOAD_ITEMS = 5; // number of items to preload initially
export const FRAME_DURATION = 1 / 30;
export const FALLBACK_CANONICAL_DURATION_SEC = asCanonicalDurationSec(1.0);

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { name: 'Free', width: 0, height: 0 },
  { name: 'FHD', width: 1920, height: 1080 },
  { name: 'HD', width: 1280, height: 720 },
  { name: '4K', width: 3840, height: 2160 },
  { name: 'SD', width: 640, height: 480 },
];
