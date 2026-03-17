import { describe, expect, it } from 'vitest';
import type { Cut } from '../../../types';
import { buildExportTimelineEntries, buildManifestJson, buildTimelineText } from '../manifest';

describe('export manifest', () => {
  const cuts: Cut[] = [
    {
      id: 'cut-1',
      assetId: 'asset-1',
      asset: { id: 'asset-1', name: 'img.png', path: '/tmp/img.png', type: 'image' },
      displayTime: 1.5,
      order: 0,
    },
    {
      id: 'cut-2',
      assetId: 'asset-2',
      asset: { id: 'asset-2', name: 'clip.mp4', path: '/tmp/clip.mp4', type: 'video' },
      displayTime: 2,
      order: 1,
      isClip: true,
      inPoint: 0.5,
      outPoint: 2.5,
    },
  ];

  it('builds timeline entries with cumulative time', () => {
    const entries = buildExportTimelineEntries(cuts, (cut) => ({
      sceneId: 'scene-1',
      sceneName: 'Scene01',
      cutIndex: cut.id === 'cut-1' ? 0 : 1,
    }), (assetId) => cuts.find((cut) => cut.assetId === assetId)?.asset);
    expect(entries).toHaveLength(2);
    expect(entries[0].startSec).toBe(0);
    expect(entries[0].endSec).toBe(1.5);
    expect(entries[1].startSec).toBe(1.5);
    expect(entries[1].endSec).toBe(3.5);
  });

  it('creates timeline.txt lines', () => {
    const entries = buildExportTimelineEntries(cuts, () => ({
      sceneId: 'scene-1',
      sceneName: 'Scene01',
      cutIndex: 0,
    }), (assetId) => cuts.find((cut) => cut.assetId === assetId)?.asset);
    const text = buildTimelineText(entries);
    expect(text).toContain('Scene01');
    expect(text).toContain('img.png');
    expect(text).toContain('clip.mp4');
    expect(text).toContain('clip(0.50-2.50)');
  });

  it('creates manifest json text', () => {
    const entries = buildExportTimelineEntries(cuts, () => ({
      sceneId: 'scene-1',
      sceneName: 'Scene01',
      cutIndex: 0,
    }), (assetId) => cuts.find((cut) => cut.assetId === assetId)?.asset);
    const json = buildManifestJson(entries, {
      width: 1280,
      height: 720,
      fps: 30,
      outputDir: '/tmp/export/run01',
    });
    const parsed = JSON.parse(json) as { video: { filename: string; width: number }; entries: unknown[] };
    expect(parsed.video.filename).toBe('video.mp4');
    expect(parsed.video.width).toBe(1280);
    expect(parsed.entries).toHaveLength(2);
  });
});
