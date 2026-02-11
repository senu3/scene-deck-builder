import { describe, expect, it } from 'vitest';
import { buildPreviewViewportFramingStyle } from '../previewFraming';
import { buildFramingVideoFilter, getFramingAnchorFactors } from '../../../electron/framing';

const anchors = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;

const expectedObjectPosition: Record<(typeof anchors)[number], string> = {
  'top-left': 'left top',
  top: 'center top',
  'top-right': 'right top',
  left: 'left center',
  center: 'center center',
  right: 'right center',
  'bottom-left': 'left bottom',
  bottom: 'center bottom',
  'bottom-right': 'right bottom',
};

describe('framing parity (preview <-> export)', () => {
  it('maps anchors to same preview object-position semantics', () => {
    for (const anchor of anchors) {
      const style = buildPreviewViewportFramingStyle({ mode: 'cover', anchor });
      expect(style['--preview-framing-position']).toBe(expectedObjectPosition[anchor]);
    }
  });

  it('uses matching mode/anchor parameters for ffmpeg filter generation', () => {
    for (const mode of ['cover', 'fit'] as const) {
      for (const anchor of anchors) {
        const style = buildPreviewViewportFramingStyle({ mode, anchor });
        const factors = getFramingAnchorFactors(anchor);
        const filter = buildFramingVideoFilter({
          width: 1280,
          height: 720,
          mode,
          anchor,
        });

        expect(style['--preview-framing-fit']).toBe(mode);
        if (mode === 'cover') {
          expect(filter).toContain('force_original_aspect_ratio=increase');
          expect(filter).toContain(`crop=1280:720:x='(in_w-out_w)*${factors.x}'`);
          expect(filter).toContain(`y='(in_h-out_h)*${factors.y}'`);
        } else {
          expect(filter).toContain('force_original_aspect_ratio=decrease');
          expect(filter).toContain(`pad=1280:720:x='(ow-iw)*${factors.x}'`);
          expect(filter).toContain(`y='(oh-ih)*${factors.y}'`);
        }
      }
    }
  });

  it('falls back to cover+center for invalid framing values', () => {
    const style = buildPreviewViewportFramingStyle({
      mode: 'unknown' as never,
      anchor: 'unknown' as never,
    });
    const filter = buildFramingVideoFilter({
      width: 1280,
      height: 720,
      mode: 'unknown',
      anchor: 'unknown',
    });

    expect(style['--preview-framing-fit']).toBe('cover');
    expect(style['--preview-framing-position']).toBe('center center');
    expect(filter).toContain('force_original_aspect_ratio=increase');
    expect(filter).toContain(`crop=1280:720:x='(in_w-out_w)*0.5'`);
    expect(filter).toContain(`y='(in_h-out_h)*0.5'`);
  });
});
