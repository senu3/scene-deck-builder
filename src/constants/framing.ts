import type { FramingAnchor, FramingMode } from '../types';

export interface FramingDefaults {
  mode: FramingMode;
  anchor: FramingAnchor;
}

export const EXPORT_FRAMING_DEFAULTS: FramingDefaults = {
  mode: 'cover',
  anchor: 'center',
};
