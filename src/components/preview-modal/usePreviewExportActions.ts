import { useCallback, useState } from 'react';
import type { Asset, CutRuntimeState, MetadataStore } from '../../types';
import { DEFAULT_EXPORT_RESOLUTION } from '../../constants/export';
import { EXPORT_FRAMING_DEFAULTS } from '../../constants/framing';
import {
  exportSequenceBridge,
  showSaveSequenceDialogBridge,
} from '../../features/platform/electronGateway';
import { buildSequencePlan, type SequencePlan } from '../../utils/sequencePlan';
import { buildSequencePlanTargetFromPreviewItems } from './sequencePlanInput';
import type { PreviewItem, ResolutionPreset } from './types';

interface UsePreviewExportActionsInput {
  items: PreviewItem[];
  selectedResolution: ResolutionPreset;
  metadataStore: MetadataStore | null;
  getAsset: (assetId: string) => Asset | undefined;
  getCutRuntime: (cutId: string) => CutRuntimeState | undefined;
  onExportSequence?: (plan: SequencePlan, resolution: { width: number; height: number }) => Promise<void> | void;
  pauseBeforeExport: () => void;
}

export function usePreviewExportActions({
  items,
  selectedResolution,
  metadataStore,
  getAsset,
  getCutRuntime,
  onExportSequence,
  pauseBeforeExport,
}: UsePreviewExportActionsInput) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportFull = useCallback(async () => {
    if (items.length === 0) return;

    setIsExporting(true);
    pauseBeforeExport();

    try {
      const exportWidth = selectedResolution.width > 0 ? selectedResolution.width : DEFAULT_EXPORT_RESOLUTION.width;
      const exportHeight = selectedResolution.height > 0 ? selectedResolution.height : DEFAULT_EXPORT_RESOLUTION.height;
      const sequencePlan = buildSequencePlan({
        scenes: [],
        sceneOrder: [],
      }, {
        target: buildSequencePlanTargetFromPreviewItems(items),
        metadataStore: metadataStore ?? null,
        getAssetById: getAsset,
        resolveCutRuntimeById: getCutRuntime,
        framingDefaults: EXPORT_FRAMING_DEFAULTS,
      });

      if (onExportSequence) {
        await onExportSequence(sequencePlan, { width: exportWidth, height: exportHeight });
        return;
      }

      const outputPath = await showSaveSequenceDialogBridge('sequence_export.mp4');
      if (!outputPath) {
        return;
      }

      const result = await exportSequenceBridge({
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

  return { isExporting, handleExportFull };
}
