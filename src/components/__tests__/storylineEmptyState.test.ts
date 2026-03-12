import { describe, expect, it } from 'vitest';
import { getSceneEmptyStateVariant } from '../Storyline';

describe('getSceneEmptyStateVariant', () => {
  it('uses a primary hint only for the first empty scene when all scenes are empty', () => {
    expect(getSceneEmptyStateVariant(0, 0, true)).toBe('primary');
    expect(getSceneEmptyStateVariant(0, 1, true)).toBe('secondary');
    expect(getSceneEmptyStateVariant(0, 2, true)).toBe('secondary');
  });

  it('uses a compact hint for empty scenes after the first cut exists elsewhere', () => {
    expect(getSceneEmptyStateVariant(0, 0, false)).toBe('secondary');
    expect(getSceneEmptyStateVariant(0, 3, false)).toBe('secondary');
  });

  it('does not show an empty-state hint when the scene already has cuts', () => {
    expect(getSceneEmptyStateVariant(1, 0, false)).toBeNull();
    expect(getSceneEmptyStateVariant(4, 2, true)).toBeNull();
  });
});
