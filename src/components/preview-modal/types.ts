import type { Asset, Cut } from '../../types';
import type { SequencePlan } from '../../utils/sequencePlan';
import type { CanonicalDurationSec } from '../../utils/storyTiming';

export interface ResolutionPresetType {
  name: string;
  width: number;
  height: number;
}

export interface SingleModeProps {
  asset: Asset;
  initialInPoint?: number;
  initialOutPoint?: number;
  onClipSave?: (
    inPoint: number,
    outPoint: number,
    options?: { expectedClipRevision?: number }
  ) => Promise<void> | void;
  onClipClear?: () => Promise<void> | void;
  onFrameCapture?: (timestamp: number) => Promise<string | void> | void;
}

export interface BasePreviewModalProps {
  onClose: () => void;
  exportResolution?: ResolutionPresetType;
  onResolutionChange?: (resolution: ResolutionPresetType) => void;
  focusCutId?: string;
  sequenceCuts?: Cut[];
  sequenceContext?: { kind: 'scene'; sceneId: string; sceneName?: string };
  onRangeChange?: (range: { inPoint: number | null; outPoint: number | null }) => void;
  onExportSequence?: (plan: SequencePlan, resolution: { width: number; height: number }) => Promise<void> | void;
}

export type PreviewModalProps = BasePreviewModalProps & Partial<SingleModeProps>;

export interface PreviewItem {
  cut: Cut;
  sceneId: string;
  sceneName: string;
  sceneIndex: number;
  cutIndex: number;
  sceneStartAbs: number;
  previewOffsetSec: number;
  // Derived only from canonical story timings. Do not source from raw cut duration fields directly.
  normalizedDisplayTime: CanonicalDurationSec;
  thumbnail: string | null;
}

export interface PreviewSequencePlaybackItem {
  cutId: string;
  assetId: string;
  assetType: 'image' | 'video';
  sourcePath: string;
  srcInSec: number;
  srcOutSec: number;
  normalizedDisplayTime: CanonicalDurationSec;
  sceneId: string;
  sceneName: string;
  cutIndex: number;
  thumbnail: string | null;
  isHold: boolean;
}

export interface ResolutionPreset {
  name: string;
  width: number;
  height: number;
}
