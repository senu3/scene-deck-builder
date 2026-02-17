import type { Asset, Cut } from '../../types';
import { resolveCutAsset } from '../../utils/assetResolve';

export interface CutContextInfo {
  sceneId: string;
  sceneName: string;
  cutIndex: number;
}

export interface ExportTimelineEntry {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  sceneId: string;
  sceneName: string;
  cutId: string;
  cutIndex: number;
  assetId: string;
  assetName: string;
  assetPath: string;
  assetType: 'image' | 'video' | 'audio';
  isLipSync: boolean;
  isClip: boolean;
  inPoint?: number;
  outPoint?: number;
}

export function buildExportTimelineEntries(
  cuts: Cut[],
  resolveContext: (cut: Cut) => CutContextInfo | null,
  resolveAsset: (assetId: string) => Asset | undefined
): ExportTimelineEntry[] {
  let current = 0;
  const entries: ExportTimelineEntry[] = [];

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    const duration = Number.isFinite(cut.displayTime) && cut.displayTime > 0 ? cut.displayTime : 1;
    const startSec = current;
    const endSec = current + duration;
    current = endSec;

    const context = resolveContext(cut);
    const asset = resolveCutAsset(cut, resolveAsset);
    entries.push({
      index: i,
      startSec,
      endSec,
      durationSec: duration,
      sceneId: context?.sceneId || 'unknown',
      sceneName: context?.sceneName || 'UnknownScene',
      cutId: cut.id,
      cutIndex: context?.cutIndex ?? i,
      assetId: cut.assetId,
      assetName: asset?.name || 'unknown',
      assetPath: asset?.path || '',
      assetType: asset?.type || 'image',
      isLipSync: !!cut.isLipSync,
      isClip: !!cut.isClip,
      inPoint: cut.isClip ? cut.inPoint : undefined,
      outPoint: cut.isClip ? cut.outPoint : undefined,
    });
  }

  return entries;
}

function formatTimelineSec(value: number): string {
  return value.toFixed(2).padStart(6, '0');
}

export function buildTimelineText(entries: ExportTimelineEntry[]): string {
  return entries
    .map((entry) => {
      const clipPart = entry.isClip && entry.inPoint !== undefined && entry.outPoint !== undefined
        ? ` clip(${entry.inPoint.toFixed(2)}-${entry.outPoint.toFixed(2)})`
        : '';
      const lipPart = entry.isLipSync ? ' [lipsync]' : '';
      return `${formatTimelineSec(entry.startSec)} - ${formatTimelineSec(entry.endSec)}  ${entry.sceneName} / Cut${String(entry.cutIndex + 1).padStart(2, '0')} / ${entry.assetName}${clipPart}${lipPart}`;
    })
    .join('\n');
}

export function buildManifestJson(entries: ExportTimelineEntry[], meta: {
  width: number;
  height: number;
  fps: number;
  outputDir: string;
}): string {
  return JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    outputDir: meta.outputDir,
    video: {
      filename: 'video.mp4',
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
    },
    entries,
  }, null, 2);
}
