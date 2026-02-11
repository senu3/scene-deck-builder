import type { CSSProperties } from 'react';
import {
  DEFAULT_FRAMING_ANCHOR,
  DEFAULT_FRAMING_MODE,
  getFramingObjectPosition,
  resolveFramingAnchor,
  resolveFramingMode,
} from '../../electron/framing';
import type { CutFraming } from '../types';

export interface PreviewViewportFramingStyle extends CSSProperties {
  '--preview-framing-fit'?: string;
  '--preview-framing-position'?: string;
}

export function resolveCutFramingForPreview(framing?: CutFraming): { mode: 'cover' | 'fit'; anchor: string } {
  return {
    mode: resolveFramingMode(framing?.mode ?? DEFAULT_FRAMING_MODE),
    anchor: resolveFramingAnchor(framing?.anchor ?? DEFAULT_FRAMING_ANCHOR),
  };
}

export function buildPreviewViewportFramingStyle(framing?: CutFraming): PreviewViewportFramingStyle {
  const resolved = resolveCutFramingForPreview(framing);
  return {
    '--preview-framing-fit': resolved.mode,
    '--preview-framing-position': getFramingObjectPosition(resolved.anchor),
  };
}
