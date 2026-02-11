export type FramingMode = 'cover' | 'fit';

export type FramingAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export const DEFAULT_FRAMING_MODE: FramingMode = 'cover';
export const DEFAULT_FRAMING_ANCHOR: FramingAnchor = 'center';

export function resolveFramingMode(mode?: string): FramingMode {
  return mode === 'fit' ? 'fit' : 'cover';
}

export function resolveFramingAnchor(anchor?: string): FramingAnchor {
  switch (anchor) {
    case 'top-left':
    case 'top':
    case 'top-right':
    case 'left':
    case 'center':
    case 'right':
    case 'bottom-left':
    case 'bottom':
    case 'bottom-right':
      return anchor;
    default:
      return DEFAULT_FRAMING_ANCHOR;
  }
}

export function getFramingAnchorFactors(anchor?: string): { x: number; y: number } {
  switch (resolveFramingAnchor(anchor)) {
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top':
      return { x: 0.5, y: 0 };
    case 'top-right':
      return { x: 1, y: 0 };
    case 'left':
      return { x: 0, y: 0.5 };
    case 'right':
      return { x: 1, y: 0.5 };
    case 'bottom-left':
      return { x: 0, y: 1 };
    case 'bottom':
      return { x: 0.5, y: 1 };
    case 'bottom-right':
      return { x: 1, y: 1 };
    case 'center':
    default:
      return { x: 0.5, y: 0.5 };
  }
}

export function getFramingObjectPosition(anchor?: string): string {
  switch (resolveFramingAnchor(anchor)) {
    case 'top-left':
      return 'left top';
    case 'top':
      return 'center top';
    case 'top-right':
      return 'right top';
    case 'left':
      return 'left center';
    case 'right':
      return 'right center';
    case 'bottom-left':
      return 'left bottom';
    case 'bottom':
      return 'center bottom';
    case 'bottom-right':
      return 'right bottom';
    case 'center':
    default:
      return 'center center';
  }
}

export function buildFramingVideoFilter(params: {
  width: number;
  height: number;
  mode?: string;
  anchor?: string;
}): string {
  const mode = resolveFramingMode(params.mode);
  const anchor = getFramingAnchorFactors(params.anchor);
  const width = Math.max(1, Math.floor(params.width));
  const height = Math.max(1, Math.floor(params.height));

  if (mode === 'fit') {
    return [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:x='(ow-iw)*${anchor.x}':y='(oh-ih)*${anchor.y}':color=black`,
      'format=yuv420p',
    ].join(',');
  }

  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}:x='(in_w-out_w)*${anchor.x}':y='(in_h-out_h)*${anchor.y}'`,
    'format=yuv420p',
  ].join(',');
}
