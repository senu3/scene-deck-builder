import type { CSSProperties } from 'react';
import {
  DEFAULT_FRAMING_ANCHOR,
  DEFAULT_FRAMING_MODE,
  getFramingObjectPosition,
  resolveFramingAnchor,
  resolveFramingMode,
} from '../../electron/framing';
import type { CutFraming } from '../types';
import type { FramingDefaults } from '../constants/framing';

export interface PreviewViewportFramingStyle extends CSSProperties {
  '--preview-framing-fit'?: string;
  '--preview-framing-position'?: string;
}

export function resolveCutFramingForPreview(
  framing?: CutFraming,
  defaults?: Partial<FramingDefaults>
): { mode: 'cover' | 'fit'; anchor: string } {
  const modeFallback = defaults?.mode ?? DEFAULT_FRAMING_MODE;
  const anchorFallback = defaults?.anchor ?? DEFAULT_FRAMING_ANCHOR;
  return {
    mode: resolveFramingMode(framing?.mode ?? modeFallback),
    anchor: resolveFramingAnchor(framing?.anchor ?? anchorFallback),
  };
}

export function buildPreviewViewportFramingStyle(
  framing?: CutFraming,
  defaults?: Partial<FramingDefaults>
): PreviewViewportFramingStyle {
  const resolved = resolveCutFramingForPreview(framing, defaults);
  return {
    '--preview-framing-fit': resolved.mode,
    '--preview-framing-position': getFramingObjectPosition(resolved.anchor),
  };
}
