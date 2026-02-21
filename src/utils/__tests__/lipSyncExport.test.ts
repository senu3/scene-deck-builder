import { describe, expect, it } from 'vitest';
import { createLipSyncConcatList, validateLipSyncExportPayload } from '../../../electron/lipSyncExport';

describe('lipSyncExport helpers', () => {
  it('validates payload shape', () => {
    const error = validateLipSyncExportPayload({
      framePaths: [],
      rms: [0.1],
      rmsFps: 30,
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      audioOffsetSec: 0,
    });
    expect(error).toMatch(/framePaths is empty/);
  });

  it.each([
    {
      label: 'builds concat list with variant frame selection from RMS and thresholds',
      audioOffsetSec: 0,
      durationSec: 4 / 30,
      expectedFrames: ['/tmp/f0.png', '/tmp/f1.png', '/tmp/f2.png', '/tmp/f3.png'],
    },
    {
      label: 'applies audio offset when resolving RMS frames',
      audioOffsetSec: 1 / 30,
      durationSec: 1 / 30,
      expectedFrames: ['/tmp/f1.png'],
    },
  ])('$label', ({ audioOffsetSec, durationSec, expectedFrames }) => {
    const text = createLipSyncConcatList({
      framePaths: ['/tmp/f0.png', '/tmp/f1.png', '/tmp/f2.png', '/tmp/f3.png'],
      rms: [0.05, 0.12, 0.22, 0.35],
      rmsFps: 30,
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      audioOffsetSec,
    }, durationSec, 30);

    const lines = text.split('\n').filter((line) => line.startsWith("file '"));
    expectedFrames.forEach((framePath, index) => {
      expect(lines[index]).toContain(framePath);
    });
  });
});
