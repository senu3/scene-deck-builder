import { describe, expect, it } from 'vitest';
import { computeNextRangeForSetIn, computeNextRangeForSetOut } from '../clipRangeOps';

describe('clipRangeOps', () => {
  it('clears opposite marker by default when range crosses', () => {
    expect(computeNextRangeForSetIn({
      playheadTime: 6,
      duration: 10,
      inPoint: 2,
      outPoint: 5,
    })).toEqual({ inPoint: 6, outPoint: null });

    expect(computeNextRangeForSetOut({
      playheadTime: 2,
      duration: 10,
      inPoint: 4,
      outPoint: 8,
    })).toEqual({ inPoint: null, outPoint: 2 });
  });

  it('keeps opposite marker when keepOppositeWhenCrossed is enabled', () => {
    expect(computeNextRangeForSetIn({
      playheadTime: 6,
      duration: 10,
      inPoint: 2,
      outPoint: 5,
      keepOppositeWhenCrossed: true,
    })).toEqual({ inPoint: 5, outPoint: 5 });

    expect(computeNextRangeForSetOut({
      playheadTime: 2,
      duration: 10,
      inPoint: 4,
      outPoint: 8,
      keepOppositeWhenCrossed: true,
    })).toEqual({ inPoint: 4, outPoint: 4 });
  });
});
