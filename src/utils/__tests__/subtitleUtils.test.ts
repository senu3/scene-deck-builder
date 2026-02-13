import { describe, expect, it } from 'vitest';
import { normalizeSubtitleRange, resolveSubtitleVisibility } from '../subtitleUtils';

describe('subtitle utils', () => {
  it('shows subtitle for full range when range is omitted', () => {
    const subtitle = { text: 'hello' };
    expect(resolveSubtitleVisibility(subtitle, 0, 3)).toBe(true);
    expect(resolveSubtitleVisibility(subtitle, 2.9, 3)).toBe(true);
  });

  it('handles range boundaries as inclusive', () => {
    const subtitle = { text: 'hello', range: { start: 0.5, end: 1.5 } };
    expect(resolveSubtitleVisibility(subtitle, 0.5, 3)).toBe(true);
    expect(resolveSubtitleVisibility(subtitle, 1.5, 3)).toBe(true);
    expect(resolveSubtitleVisibility(subtitle, 1.51, 3)).toBe(false);
  });

  it('clamps and swaps invalid range values', () => {
    expect(normalizeSubtitleRange({ start: 3, end: -2 }, 2)).toEqual({ start: 0, end: 2 });
    expect(normalizeSubtitleRange({ start: 1.7, end: 0.3 }, 2)).toEqual({ start: 0.3, end: 1.7 });
  });

  it('returns false for empty text', () => {
    expect(resolveSubtitleVisibility({ text: '   ' }, 0.2, 1)).toBe(false);
  });
});
