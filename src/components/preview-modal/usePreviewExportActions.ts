import { useCallback, useState } from 'react';
import type { Asset, Cut, CutRuntimeState, MetadataStore } from '../../types';
import { formatTime } from '../../utils/timeUtils';
import { DEFAULT_EXPORT_RESOLUTION } from '../../constants/export';
import { EXPORT_FRAMING_DEFAULTS } from '../../constants/framing';
import { buildSequencePlan, type SequencePlan } from '../../utils/sequencePlan';
import type { PreviewItem, ResolutionPreset } from './types';

interface UsePreviewExportActionsInput {
  items: PreviewItem[];
  selectedResolution: ResolutionPreset;
  metadataStore: MetadataStore | null;
  getAsset: (assetId: string) => Asset | undefined;
  getCutRuntime: (cutId: string) => CutRuntimeState | undefined;
  onExportSequence?: (plan: SequencePlan, resolution: { width: number; height: number }) => Promise<void> | void;
  pauseBeforeExport: () => void;
  inPoint: number | null;
  outPoint: number | null;
  resolveAssetForCut: (cut: Cut | null | undefined) => Asset | null;
}

export function usePreviewExportActions({
  items,
  selectedResolution,
  metadataStore,
  getAsset,
  getCutRuntime,
  onExportSequence,
  pauseBeforeExport,
  inPoint,
  outPoint,
  resolveAssetForCut,
}: UsePreviewExportActionsInput) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportFull = useCallback(async () => {
    if (items.length === 0) return;

    setIsExporting(true);
    pauseBeforeExport();

    try {
      const exportWidth = selectedResolution.width > 0 ? selectedResolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const exportHeight = selectedResolution.height > 0 ? selectedResolution.height : DEFAULT_EXPORT_RESOLUTION.height;
      const planCuts = items.map((item) => ({
        ...item.cut,
        displayTime: item.normalizedDisplayTime,
      }));
      const cutSceneMap = new Map<string, string>();
      for (const item of items) {
        cutSceneMap.set(item.cut.id, item.sceneId);
      }
      const sequencePlan = buildSequencePlan({
        scenes: [],
        sceneOrder: [],
      }, {
        target: {
          kind: 'cuts',
          cuts: planCuts,
          resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
        },
        metadataStore: metadataStore ?? null,
        getAssetById: getAsset,
        resolveCutRuntimeById: getCutRuntime,
        framingDefaults: EXPORT_FRAMING_DEFAULTS,
        strictLipSync: false,
      });

      if (onExportSequence) {
        await onExportSequence(sequencePlan, { width: exportWidth, height: exportHeight });
        return;
      }

      if (!window.electronAPI) {
        return;
      }

      const outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4');
      if (!outputPath) {
        return;
      }

      const result = await window.electronAPI.exportSequence({
        items: sequencePlan.exportItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
        fps: 30,
        audioPlan: sequencePlan.audioPlan,
      });

      if (result.success) {
        alert(
          `Export complete!\nFile: ${result.outputPath}\nSize: ${(result.fileSize! / 1024 / 1024).toFixed(2)} MB` +
          `${result.audioOutputPath ? `\nAudio: ${result.audioOutputPath}` : ''}`
        );
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Export error: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [items, selectedResolution, pauseBeforeExport, metadataStore, getAsset, getCutRuntime, onExportSequence]);

  const handleExportRange = useCallback(async () => {
    if (!window.electronAPI || items.length === 0) return;
    if (inPoint === null || outPoint === null) return;

    setIsExporting(true);
    pauseBeforeExport();

    try {
      const exportWidth = selectedResolution.width > 0 ? selectedResolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const exportHeight = selectedResolution.height > 0 ? selectedResolution.height : DEFAULT_EXPORT_RESOLUTION.height;

      const outputPath = await window.electronAPI.showSaveSequenceDialog('sequence_export.mp4');
      if (!outputPath) {
        return;
      }

      const rangeStart = Math.min(inPoint, outPoint);
      const rangeEnd = Math.max(inPoint, outPoint);

      const rangeCuts: Cut[] = [];

      let accumulatedTime = 0;
      for (const item of items) {
        const asset = resolveAssetForCut(item.cut);
        if (!asset?.path) continue;

        const itemStart = accumulatedTime;
        const itemEnd = accumulatedTime + item.normalizedDisplayTime;
        accumulatedTime = itemEnd;

        if (itemEnd <= rangeStart || itemStart >= rangeEnd) continue;

        const clipStart = Math.max(0, rangeStart - itemStart);
        const clipEnd = Math.min(item.normalizedDisplayTime, rangeEnd - itemStart);
        const clipDuration = clipEnd - clipStart;

        if (clipDuration <= 0) continue;

        if (asset.type === 'video') {
          const originalInPoint = item.cut.isClip && item.cut.inPoint !== undefined ? item.cut.inPoint : 0;
          const clippedCut: Cut = {
            ...item.cut,
            displayTime: clipDuration,
            isClip: true,
            inPoint: originalInPoint + clipStart,
            outPoint: originalInPoint + clipEnd,
          };
          rangeCuts.push(clippedCut);
        } else {
          rangeCuts.push({
            ...item.cut,
            displayTime: clipDuration,
            isClip: false,
            inPoint: undefined,
            outPoint: undefined,
          });
        }
      }

      const cutSceneMap = new Map<string, string>();
      for (const item of items) {
        cutSceneMap.set(item.cut.id, item.sceneId);
      }
      const sequencePlan = buildSequencePlan({
        scenes: [],
        sceneOrder: [],
      }, {
        target: {
          kind: 'cuts',
          cuts: rangeCuts,
          resolveSceneIdByCutId: (cutId) => cutSceneMap.get(cutId),
        },
        metadataStore: metadataStore ?? null,
        getAssetById: getAsset,
        resolveCutRuntimeById: getCutRuntime,
        framingDefaults: EXPORT_FRAMING_DEFAULTS,
        strictLipSync: false,
      });

      if (sequencePlan.exportItems.length === 0) {
        alert('No items in the selected range');
        return;
      }

      const result = await window.electronAPI.exportSequence({
        items: sequencePlan.exportItems,
        outputPath,
        width: exportWidth,
        height: exportHeight,
        fps: 30,
        audioPlan: sequencePlan.audioPlan,
      });

      if (result.success) {
        alert(
          `Export complete! (${formatTime(rangeStart)} - ${formatTime(rangeEnd)})\nFile: ${result.outputPath}\nSize: ${(result.fileSize! / 1024 / 1024).toFixed(2)} MB` +
          `${result.audioOutputPath ? `\nAudio: ${result.audioOutputPath}` : ''}`
        );
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      alert(`Export error: ${String(error)}`);
    } finally {
      setIsExporting(false);
    }
  }, [items, selectedResolution, inPoint, outPoint, pauseBeforeExport, resolveAssetForCut, metadataStore, getAsset, getCutRuntime]);

  return { isExporting, handleExportFull, handleExportRange };
}
