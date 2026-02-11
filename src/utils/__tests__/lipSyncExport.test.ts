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

  it('builds concat list with variant frame selection from RMS and thresholds', () => {
    const text = createLipSyncConcatList({
      framePaths: ['/tmp/f0.png', '/tmp/f1.png', '/tmp/f2.png', '/tmp/f3.png'],
      rms: [0.05, 0.12, 0.22, 0.35],
      rmsFps: 30,
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      audioOffsetSec: 0,
    }, 4 / 30, 30);

    const lines = text.split('\n').filter((line) => line.startsWith("file '"));
    expect(lines[0]).toContain('/tmp/f0.png');
    expect(lines[1]).toContain('/tmp/f1.png');
    expect(lines[2]).toContain('/tmp/f2.png');
    expect(lines[3]).toContain('/tmp/f3.png');
  });

  it('applies audio offset when resolving RMS frames', () => {
    const text = createLipSyncConcatList({
      framePaths: ['/tmp/f0.png', '/tmp/f1.png', '/tmp/f2.png', '/tmp/f3.png'],
      rms: [0.05, 0.12, 0.22, 0.35],
      rmsFps: 30,
      thresholds: { t1: 0.1, t2: 0.2, t3: 0.3 },
      audioOffsetSec: 1 / 30,
    }, 1 / 30, 30);

    const lines = text.split('\n').filter((line) => line.startsWith("file '"));
    expect(lines[0]).toContain('/tmp/f1.png');
  });
});
