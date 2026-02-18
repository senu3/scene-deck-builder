/**
 * LipSyncModal - Side Panel Layout (Based on Preview Mockup v3)
 *
 * Left: Video preview with playback controls and capture button
 * Right: Frame grid, threshold settings, and action buttons
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Play, Pause, Mic, Volume2, Film, Check, Brush } from "lucide-react";
import type { Asset } from "../types";
import { Slider } from "../ui/primitives/Slider";
import MaskPaintModal from "./MaskPaintModal";
import { useStore } from "../store/useStore";
import { useToast } from "../ui";
import { generateAssetId } from "../utils/assetPath";
import { getLipSyncFrameAssetIds, importDataUrlAssetToVault } from "../utils/lipSyncUtils";
import { getMediaUrl } from "../utils/videoUtils";
import { getThumbnail } from "../utils/thumbnailCache";
import { useLipSyncPreview } from "../hooks/useLipSyncPreview";
import AssetModal from "./AssetModal";
import "./LipSyncModal.css";

interface LipSyncModalProps {
  asset: Asset;
  sceneId: string;
  cutId?: string;
  onClose: () => void;
}

interface FrameData {
  closed: string | null;
  half1: string | null;
  half2: string | null;
  open: string | null;
}

interface FrameAssetData {
  closed: string | null;
  half1: string | null;
  half2: string | null;
  open: string | null;
}

const FRAME_PHASES = [
  { id: "closed", label: "Closed", desc: "Silent / RMS < T1" },
  { id: "half1", label: "Half 1", desc: "Quiet / T1 ≤ RMS < T2" },
  { id: "half2", label: "Half 2", desc: "Normal / T2 ≤ RMS < T3" },
  { id: "open", label: "Open", desc: "Loud / RMS ≥ T3" },
] as const;

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function imageSrcToDataUrl(src: string): Promise<string | null> {
  try {
    const img = await loadImageElement(src);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function resolveAssetPreviewSource(asset: Asset): Promise<string | null> {
  if (asset.thumbnail) return asset.thumbnail;
  if (!asset.path) return null;
  try {
    return await getThumbnail(asset.path, "image", { profile: 'sequence-preview' });
  } catch {
    return null;
  }
}

async function createCompositedFrameDataUrl(
  baseSrc: string,
  variantSrc: string,
  maskSrc: string
): Promise<string | null> {
  try {
    const [baseImg, variantImg, maskImg] = await Promise.all([
      loadImageElement(baseSrc),
      loadImageElement(variantSrc),
      loadImageElement(maskSrc),
    ]);

    const width = baseImg.naturalWidth || baseImg.width;
    const height = baseImg.naturalHeight || baseImg.height;
    if (!width || !height) return null;

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputCtx = outputCanvas.getContext("2d");
    if (!outputCtx) return null;
    outputCtx.drawImage(baseImg, 0, 0, width, height);

    const variantCanvas = document.createElement("canvas");
    variantCanvas.width = width;
    variantCanvas.height = height;
    const variantCtx = variantCanvas.getContext("2d");
    if (!variantCtx) return null;
    variantCtx.drawImage(variantImg, 0, 0, width, height);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return null;
    maskCtx.drawImage(maskImg, 0, 0, width, height);

    const variantData = variantCtx.getImageData(0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height);
    const variantPixels = variantData.data;
    const maskPixels = maskData.data;

    for (let i = 0; i < variantPixels.length; i += 4) {
      const maskValue = maskPixels[i];
      variantPixels[i + 3] = Math.round((variantPixels[i + 3] * maskValue) / 255);
    }

    variantCtx.putImageData(variantData, 0, 0);
    outputCtx.drawImage(variantCanvas, 0, 0, width, height);
    return outputCanvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export default function LipSyncModal({ asset, sceneId, cutId, onClose }: LipSyncModalProps) {
  const { vaultPath, metadataStore, scenes, setLipSyncForAsset, cacheAsset, updateCutLipSync, getAsset } = useStore();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [frames, setFrames] = useState<FrameData>({
    closed: null,
    half1: null,
    half2: null,
    open: null,
  });
  const [frameAssetIds, setFrameAssetIds] = useState<FrameAssetData>({
    closed: null,
    half1: null,
    half2: null,
    open: null,
  });
  const [framePreviews, setFramePreviews] = useState<FrameData>({
    closed: null,
    half1: null,
    half2: null,
    open: null,
  });
  const [activeFrameSlot, setActiveFrameSlot] = useState<keyof FrameData | null>("closed");
  const [showFrameAssetModal, setShowFrameAssetModal] = useState(false);
  const [pendingFrameSlot, setPendingFrameSlot] = useState<keyof FrameData | null>(null);

  const [thresholds, setThresholds] = useState({
    t1: 0.05,
    t2: 0.15,
    t3: 0.30,
  });

  // Mask state
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [baseImageSize, setBaseImageSize] = useState({ width: 0, height: 0 });

  const isVideo = asset.type === "video";
  const lipSyncSettings = metadataStore?.metadata[asset.id]?.lipSync;
  const previewVideoAsset = lipSyncSettings?.sourceVideoAssetId
    ? getAsset(lipSyncSettings.sourceVideoAssetId)
    : isVideo
      ? asset
      : null;
  const selectedCut = cutId
    ? scenes.find((scene) => scene.id === sceneId)?.cuts.find((cut) => cut.id === cutId)
    : undefined;
  const primaryAudioBinding = selectedCut?.audioBindings?.[0];
  const rmsSourceId = lipSyncSettings?.rmsSourceAudioAssetId;
  const rmsAnalysis = rmsSourceId ? metadataStore?.metadata[rmsSourceId]?.audioAnalysis : undefined;
  const audioOffset = primaryAudioBinding?.offsetSec ?? 0;
  const [previewSources, setPreviewSources] = useState<string[]>([]);
  const [isPreviewReady, setIsPreviewReady] = useState(false);
  const hasLipSyncPreview = !!lipSyncSettings && !!rmsAnalysis?.rms?.length;

  const previewVariantIndex = useLipSyncPreview({
    enabled: hasLipSyncPreview,
    rms: rmsAnalysis?.rms ?? null,
    fps: rmsAnalysis?.fps ?? 0,
    thresholds: lipSyncSettings?.thresholds ?? thresholds,
    getCurrentTime: () => videoRef.current?.currentTime ?? 0,
    audioOffsetSec: audioOffset,
  });

  const FRAME_STEP = 1 / 30;

  const getFrameValue = (key: keyof FrameData): string | null => {
    return frames[key] || framePreviews[key];
  };

  // Captured frame count
  const capturedCount = Math.max(
    Object.values(frameAssetIds).filter(Boolean).length,
    Object.values(frames).filter(Boolean).length
  );
  const allFramesCaptured = capturedCount === 4;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      // Space for capture
      if (e.key === " " && activeFrameSlot && isVideo) {
        e.preventDefault();
        captureFrame(activeFrameSlot);
      }
      if (!isVideo || !videoRef.current) return;
      if (e.key === "." || e.key === ",") {
        e.preventDefault();
        const direction = e.key === "." ? 1 : -1;
        const target = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + FRAME_STEP * direction));
        videoRef.current.currentTime = target;
        setCurrentTime(target);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, activeFrameSlot, isVideo]);

  useEffect(() => {
    let isActive = true;

    const loadPreviewSources = async () => {
      if (!lipSyncSettings) {
        setPreviewSources([]);
        setIsPreviewReady(false);
        return;
      }

      const frameAssetIds = getLipSyncFrameAssetIds(lipSyncSettings);
      const sources: string[] = [];

      for (const frameAssetId of frameAssetIds) {
        let src = '';
        const frameAsset = getAsset(frameAssetId);
        if (frameAsset?.thumbnail) {
          src = frameAsset.thumbnail;
        } else if (frameAsset?.path) {
          try {
            const thumb = await getThumbnail(frameAsset.path, 'image', { profile: 'sequence-preview' });
            if (thumb) src = thumb;
          } catch {
            // ignore
          }
        }
        sources.push(src);
      }

      if (!isActive) return;
      const fallback = sources[0] || asset.thumbnail || '';
      const resolved = sources.map((src) => src || fallback);
      setPreviewSources(resolved);
      setIsPreviewReady(true);
    };

    void loadPreviewSources();
    return () => {
      isActive = false;
    };
  }, [lipSyncSettings, getAsset, asset.thumbnail]);

  useEffect(() => {
    let isActive = true;
    const loadExistingSettings = async () => {
      if (!lipSyncSettings) return;

      // Editing should always use original captured frames.
      // Using composited frames here would apply mask repeatedly on re-register.
      const frameIds = [
        lipSyncSettings.baseImageAssetId,
        ...lipSyncSettings.variantAssetIds,
      ].slice(0, 4);
      const slots: (keyof FrameData)[] = ["closed", "half1", "half2", "open"];
      const nextFrameAssetIds: FrameAssetData = { closed: null, half1: null, half2: null, open: null };
      const nextFramePreviews: FrameData = { closed: null, half1: null, half2: null, open: null };
      const nextFrames: FrameData = { closed: null, half1: null, half2: null, open: null };

      for (let i = 0; i < frameIds.length; i++) {
        const frameAssetId = frameIds[i];
        const slot = slots[i];
        if (!frameAssetId || !slot) continue;
        nextFrameAssetIds[slot] = frameAssetId;

        const frameAsset = getAsset(frameAssetId);
        if (!frameAsset) continue;
        const preview = await resolveAssetPreviewSource(frameAsset);
        if (preview) {
          nextFramePreviews[slot] = preview;
        }
        const dataUrl = await imageSrcToDataUrl(frameAsset.path ? getMediaUrl(frameAsset.path) : (preview || ""));
        if (dataUrl) {
          nextFrames[slot] = dataUrl;
        }
      }

      let existingMaskDataUrl: string | null = null;
      if (lipSyncSettings.maskAssetId) {
        const maskAsset = getAsset(lipSyncSettings.maskAssetId);
        if (maskAsset) {
          const maskPreview = await resolveAssetPreviewSource(maskAsset);
          existingMaskDataUrl = await imageSrcToDataUrl(maskAsset.path ? getMediaUrl(maskAsset.path) : (maskPreview || ""));
        }
      }

      if (!isActive) return;
      setFrameAssetIds(nextFrameAssetIds);
      setFramePreviews(nextFramePreviews);
      setFrames(nextFrames);
      setThresholds(lipSyncSettings.thresholds);
      setMaskDataUrl(existingMaskDataUrl);
      setActiveFrameSlot(null);
    };

    void loadExistingSettings();
    return () => {
      isActive = false;
    };
  }, [lipSyncSettings, getAsset]);

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (!videoRef.current.currentSrc) {
      setIsPlaying(false);
      return;
    }

    const playPromise = videoRef.current.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        setIsPlaying(false);
      });
    }
    setIsPlaying(true);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const captureFrame = (phaseId: keyof FrameData) => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");

    setFrames((prev) => ({ ...prev, [phaseId]: dataUrl }));

    // Auto-advance to next empty slot
    const slots: (keyof FrameData)[] = ["closed", "half1", "half2", "open"];
    const currentIndex = slots.indexOf(phaseId);
    for (let i = currentIndex + 1; i < slots.length; i++) {
      if (!frames[slots[i]]) {
        setActiveFrameSlot(slots[i]);
        return;
      }
    }
    // Check earlier slots if later ones are filled
    for (let i = 0; i < currentIndex; i++) {
      if (!frames[slots[i]]) {
        setActiveFrameSlot(slots[i]);
        return;
      }
    }
    // All filled
    setActiveFrameSlot(null);
  };

  const handleCaptureClick = () => {
    if (activeFrameSlot) {
      captureFrame(activeFrameSlot);
    }
  };

  const handleFrameSlotClick = (slot: keyof FrameData) => {
    setActiveFrameSlot(slot);
    if (!isVideo) {
      setPendingFrameSlot(slot);
      setShowFrameAssetModal(true);
    }
  };

  const handleThresholdChange = (key: "t1" | "t2" | "t3", value: number) => {
    setThresholds((prev) => ({ ...prev, [key]: value }));
  };

  const resolveFrameDataUrlFromAssetId = async (frameAssetId: string): Promise<string | null> => {
    const frameAsset = getAsset(frameAssetId);
    if (!frameAsset) return null;
    const src = frameAsset.path ? getMediaUrl(frameAsset.path) : frameAsset.thumbnail || "";
    if (!src) return null;
    return imageSrcToDataUrl(src);
  };

  const handleRegister = async () => {
    if (!vaultPath) {
      toast.error("Lip Sync registration failed", "Vault path is not set.");
      return;
    }

    if ((isVideo || maskDataUrl) && typeof window.electronAPI?.vaultGateway?.importDataUrlAsset !== "function") {
      toast.error(
        "Lip Sync registration failed",
        "importDataUrlAsset is unavailable. Please restart the app after update."
      );
      return;
    }

    const attachedAudioId = primaryAudioBinding?.audioAssetId;
    if (!attachedAudioId) {
      toast.error("Lip Sync registration failed", "Attached audio not found.");
      return;
    }

    const frameEntries: Array<{ key: keyof FrameData; label: string; dataUrl: string | null }> = [
      { key: "closed", label: "Closed", dataUrl: frames.closed },
      { key: "half1", label: "Half 1", dataUrl: frames.half1 },
      { key: "half2", label: "Half 2", dataUrl: frames.half2 },
      { key: "open", label: "Open", dataUrl: frames.open },
    ];

    let baseImageAssetId = "";
    let variantAssetIds: string[] = [];
    let maskAssetId: string | undefined;
    let compositedFrameAssetIds: string[] | undefined;
    let frameSourceDataUrls: string[] = [];
    let frameSourcePaths: string[] = [];

    if (isVideo) {
      const resolvedFrameAssets: Asset[] = [];
      const resolvedVideoFrameDataUrls: string[] = [];
      for (const entry of frameEntries) {
        if (entry.dataUrl) {
          const dataUrl = entry.dataUrl;
          resolvedVideoFrameDataUrls.push(dataUrl);
          const assetId = generateAssetId();
          const name = `${asset.name}_${entry.label}`;
          const imported = await importDataUrlAssetToVault(dataUrl, vaultPath, assetId, name);
          if (!imported) {
            toast.error("Lip Sync registration failed", `Failed to import "${entry.label}" frame.`);
            return;
          }
          cacheAsset(imported);
          resolvedFrameAssets.push(imported);
          continue;
        }

        const existingFrameAssetId = frameAssetIds[entry.key];
        const existingFrameAsset = existingFrameAssetId ? getAsset(existingFrameAssetId) : undefined;
        if (!existingFrameAsset || !existingFrameAsset.path) {
          toast.warning("Missing frame", `Please capture the "${entry.label}" frame.`);
          return;
        }
        resolvedFrameAssets.push(existingFrameAsset);
        const fallbackDataUrl = await resolveFrameDataUrlFromAssetId(existingFrameAsset.id);
        if (!fallbackDataUrl) {
          toast.warning("Missing frame", `Please capture the "${entry.label}" frame.`);
          return;
        }
        resolvedVideoFrameDataUrls.push(fallbackDataUrl);
      }

      const [baseAsset, ...variantAssets] = resolvedFrameAssets;
      baseImageAssetId = baseAsset.id;
      variantAssetIds = variantAssets.map((item) => item.id);
      frameSourceDataUrls = resolvedVideoFrameDataUrls;
      frameSourcePaths = resolvedFrameAssets.map((item) => item.path).filter(Boolean);
    } else {
      const frameIds = [
        frameAssetIds.closed,
        frameAssetIds.half1,
        frameAssetIds.half2,
        frameAssetIds.open,
      ];
      const missingIndex = frameIds.findIndex((id) => !id);
      if (missingIndex >= 0) {
        toast.warning("Missing frame", `Please select the "${FRAME_PHASES[missingIndex].label}" frame.`);
        return;
      }
      baseImageAssetId = frameIds[0]!;
      variantAssetIds = frameIds.slice(1) as string[];

      const selectedFrameDataUrls = await Promise.all(
        frameIds.map((frameId) => resolveFrameDataUrlFromAssetId(frameId as string))
      );
      const missingUrlIndex = selectedFrameDataUrls.findIndex((url) => !url);
      if (missingUrlIndex >= 0) {
        toast.error(
          "Lip Sync registration failed",
          `Failed to load "${FRAME_PHASES[missingUrlIndex].label}" frame source image.`
        );
        return;
      }
      frameSourceDataUrls = selectedFrameDataUrls as string[];
      frameSourcePaths = frameIds
        .map((frameId) => getAsset(frameId as string)?.path || "")
        .filter(Boolean);
    }

    if (maskDataUrl) {
      const maskId = generateAssetId();
      const maskAsset = await importDataUrlAssetToVault(maskDataUrl, vaultPath, maskId, `${asset.name}_Mask`);
      if (!maskAsset) {
        toast.error("Lip Sync registration failed", "Failed to import mask image.");
        return;
      }
      cacheAsset(maskAsset);
      maskAssetId = maskAsset.id;

      let compositedDataUrls: Array<string | null> = [];
      const precomposeLipSyncFrames = window.electronAPI?.precomposeLipSyncFrames;
      if (typeof precomposeLipSyncFrames === "function" && frameSourcePaths.length === frameSourceDataUrls.length && maskAsset.path) {
        const precomposeResult = await precomposeLipSyncFrames({
          baseImagePath: frameSourcePaths[0],
          frameImagePaths: frameSourcePaths,
          maskImagePath: maskAsset.path,
        });
        if (precomposeResult.success && precomposeResult.frameDataUrls?.length === frameSourceDataUrls.length) {
          compositedDataUrls = precomposeResult.frameDataUrls;
        } else {
          console.warn("[LipSync] ffmpeg precompose failed, falling back to canvas:", precomposeResult.error);
        }
      }
      if (compositedDataUrls.length === 0) {
        const baseSource = frameSourceDataUrls[0];
        compositedDataUrls = await Promise.all(
          frameSourceDataUrls.map((variantSource) => createCompositedFrameDataUrl(baseSource, variantSource, maskDataUrl))
        );
      }

      const missingCompositeIndex = compositedDataUrls.findIndex((dataUrl) => !dataUrl);
      if (missingCompositeIndex >= 0) {
        toast.error(
          "Lip Sync registration failed",
          `Failed to precompose "${FRAME_PHASES[missingCompositeIndex].label}" frame with mask.`
        );
        return;
      }

      const importedCompositedAssets: Asset[] = [];
      for (let i = 0; i < compositedDataUrls.length; i++) {
        const compositedDataUrl = compositedDataUrls[i]!;
        const compositedId = generateAssetId();
        const compositedName = `${asset.name}_${FRAME_PHASES[i].label}_Masked`;
        const importedComposited = await importDataUrlAssetToVault(
          compositedDataUrl,
          vaultPath,
          compositedId,
          compositedName
        );
        if (!importedComposited) {
          toast.error("Lip Sync registration failed", `Failed to import "${FRAME_PHASES[i].label}" masked frame.`);
          return;
        }
        cacheAsset(importedComposited);
        importedCompositedAssets.push(importedComposited);
      }
      compositedFrameAssetIds = importedCompositedAssets.map((item) => item.id);
    }

    const resolvedCompositedFrameAssetIds =
      compositedFrameAssetIds && compositedFrameAssetIds.length > 0
        ? compositedFrameAssetIds
        : [baseImageAssetId, ...variantAssetIds];

    setLipSyncForAsset(asset.id, {
      baseImageAssetId,
      variantAssetIds,
      maskAssetId,
      compositedFrameAssetIds: resolvedCompositedFrameAssetIds,
      ownerAssetId: asset.id,
      ownedGeneratedAssetIds: [
        ...(maskAssetId ? [maskAssetId] : []),
        ...(compositedFrameAssetIds || []),
      ],
      rmsSourceAudioAssetId: attachedAudioId,
      thresholds,
      fps: 60,
      sourceVideoAssetId: isVideo ? asset.id : undefined,
      version: 2,
    });

    if (cutId) {
      const frameCount = 1 + variantAssetIds.length;
      updateCutLipSync(sceneId, cutId, true, frameCount);
    }

    toast.success("Lip Sync registered", "Settings saved to metadata.");
    onClose();
  };

  // Open mask editor - requires a base image (closed frame or thumbnail for testing)
  const handleOpenMaskEditor = () => {
    // Use selected/captured closed frame as base image, or fall back to thumbnail for testing
    const baseFrame = getFrameValue("closed") || asset.thumbnail;
    if (!baseFrame) {
      alert("No base image available. Please capture the 'Closed' frame or ensure asset has a thumbnail.");
      return;
    }

    // Get image dimensions from the captured frame
    const img = new Image();
    img.onload = () => {
      setBaseImageSize({ width: img.width, height: img.height });
      setShowMaskEditor(true);
    };
    img.onerror = () => {
      // Fallback dimensions if image fails to load
      setBaseImageSize({ width: 1920, height: 1080 });
      setShowMaskEditor(true);
    };
    img.src = baseFrame;
  };

  const handleSaveMask = (dataUrl: string) => {
    setMaskDataUrl(dataUrl);
    setShowMaskEditor(false);
  };

  const handleFrameAssetConfirm = async (selectedAsset: Asset) => {
    if (!pendingFrameSlot) return;
    setShowFrameAssetModal(false);

    const cached = getAsset(selectedAsset.id);
    const assetToUse = cached ?? selectedAsset;
    if (!cached) {
      cacheAsset(selectedAsset);
    }
    setFrameAssetIds((prev) => ({ ...prev, [pendingFrameSlot]: assetToUse.id }));
    if (!assetToUse.thumbnail && assetToUse.path) {
      try {
        const thumb = await getThumbnail(assetToUse.path, 'image', { profile: 'sequence-preview' });
        if (thumb) {
          setFramePreviews((prev) => ({ ...prev, [pendingFrameSlot]: thumb }));
        }
      } catch {
        // ignore
      }
    } else {
      setFramePreviews((prev) => ({ ...prev, [pendingFrameSlot]: assetToUse.thumbnail || null }));
    }

    setActiveFrameSlot(pendingFrameSlot);
    setPendingFrameSlot(null);
  };

  const handleFrameAssetClose = () => {
    setShowFrameAssetModal(false);
    setPendingFrameSlot(null);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="lipsync-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="lipsync-modal" onClick={(e) => e.stopPropagation()}>
        {/* Left: Preview Section */}
        <div className="lipsync-preview-section">
          <div className="lipsync-video-container">
            {previewVideoAsset?.path && (
              <video
                ref={videoRef}
                src={getMediaUrl(previewVideoAsset.path)}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="lipsync-video"
              />
            )}
            {!previewVideoAsset?.path && hasLipSyncPreview && isPreviewReady ? (
              <img
                src={previewSources[previewVariantIndex] || previewSources[0] || asset.thumbnail}
                alt={asset.name}
                className="lipsync-image"
              />
            ) : !isVideo && asset.thumbnail ? (
              <img src={asset.thumbnail} alt={asset.name} className="lipsync-image" />
            ) : !isVideo ? (
              <div className="lipsync-preview-placeholder">
                <Film size={64} />
                <span>No preview available</span>
              </div>
            ) : null}
          </div>

          {isVideo && (
            <div className="lipsync-controls-bar">
              <div
                className="lipsync-progress-bar"
                onClick={handleProgressClick}
              >
                <div
                  className="lipsync-progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="lipsync-playback-row">
                <button className="lipsync-play-btn" onClick={handlePlayPause}>
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <span className="lipsync-time">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <button
                  className="lipsync-capture-btn"
                  onClick={handleCaptureClick}
                  disabled={!activeFrameSlot}
                >
                  <Camera size={16} />
                  {activeFrameSlot
                    ? `Capture "${FRAME_PHASES.find((p) => p.id === activeFrameSlot)?.label}"`
                    : "All Captured"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div className="lipsync-detail-panel">
          <div className="lipsync-panel-header">
            <div className="lipsync-panel-icon">
              <Mic size={18} />
            </div>
            <h3 className="lipsync-panel-title">Lip Sync Setup</h3>
            <button className="lipsync-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className="lipsync-panel-content">
            {/* Progress indicator */}
            <div className="lipsync-progress-indicator">
              <div className="progress-dots">
                {FRAME_PHASES.map((phase) => (
                  <div
                    key={phase.id}
                    className={`progress-dot ${
                      getFrameValue(phase.id as keyof FrameData) ? "filled" : ""
                    } ${activeFrameSlot === phase.id ? "current" : ""}`}
                  />
                ))}
              </div>
              <span className="progress-text">
                <strong>{capturedCount}</strong> / 4 frames
              </span>
            </div>

            {/* Frame Grid */}
            <div className="lipsync-section">
              <h4 className="lipsync-section-title">
                <Camera size={12} />
                Frame Capture
              </h4>
              <div className="lipsync-frame-grid">
                {FRAME_PHASES.map((phase) => (
                  <div
                    key={phase.id}
                    className={`lipsync-frame-slot ${
                      activeFrameSlot === phase.id ? "active" : ""
                    } ${getFrameValue(phase.id as keyof FrameData) ? "captured" : ""}`}
                    onClick={() => handleFrameSlotClick(phase.id as keyof FrameData)}
                  >
                    <div className="frame-preview">
                      {getFrameValue(phase.id as keyof FrameData) ? (
                        <img src={getFrameValue(phase.id as keyof FrameData)!} alt={phase.label} />
                      ) : (
                        <Camera size={20} className="frame-preview-icon" />
                      )}
                    </div>
                    <div className="frame-info">
                      <span className="frame-label">{phase.label}</span>
                      <span className="frame-desc">{phase.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mask Editor */}
            <div className="lipsync-section">
              <h4 className="lipsync-section-title">
                <Brush size={12} />
                Mouth Mask
              </h4>
              <div className="lipsync-mask-area">
                {maskDataUrl ? (
                  <div className="lipsync-mask-preview">
                    <img src={maskDataUrl} alt="Mask" className="mask-thumbnail" />
                    <div className="mask-info">
                      <span className="mask-status">Mask created</span>
                      <button
                        className="mask-edit-btn"
                        onClick={handleOpenMaskEditor}
                        disabled={!getFrameValue("closed") && !asset.thumbnail}
                      >
                        Edit Mask
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="lipsync-create-mask-btn"
                    onClick={handleOpenMaskEditor}
                    disabled={!getFrameValue("closed") && !asset.thumbnail}
                  >
                    <Brush size={16} />
                    Create Mouth Mask
                  </button>
                )}
                {!getFrameValue("closed") && !asset.thumbnail && (
                  <p className="mask-hint">Capture "Closed" frame first</p>
                )}
                {!getFrameValue("closed") && asset.thumbnail && (
                  <p className="mask-hint">Using thumbnail as base (dev mode)</p>
                )}
              </div>
            </div>

            {/* Thresholds */}
            <div className="lipsync-section">
              <h4 className="lipsync-section-title">
                <Volume2 size={12} />
                RMS Thresholds
              </h4>
              <div className="lipsync-thresholds">
                <div className="threshold-row">
                  <span className="threshold-label">T1 (Half1)</span>
                  <Slider
                    value={thresholds.t1}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => handleThresholdChange("t1", v)}
                    showValue
                    formatValue={(v) => v.toFixed(2)}
                    aria-label="T1 threshold"
                  />
                </div>
                <div className="threshold-row">
                  <span className="threshold-label">T2 (Half2)</span>
                  <Slider
                    value={thresholds.t2}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => handleThresholdChange("t2", v)}
                    showValue
                    formatValue={(v) => v.toFixed(2)}
                    aria-label="T2 threshold"
                  />
                </div>
                <div className="threshold-row">
                  <span className="threshold-label">T3 (Open)</span>
                  <Slider
                    value={thresholds.t3}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => handleThresholdChange("t3", v)}
                    showValue
                    formatValue={(v) => v.toFixed(2)}
                    aria-label="T3 threshold"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lipsync-panel-footer">
            <button className="lipsync-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="lipsync-register-btn"
              onClick={handleRegister}
              disabled={!allFramesCaptured}
            >
              <Check size={16} />
              Register
            </button>
          </div>
        </div>
      </div>

      {/* Mask Paint Modal */}
      {showMaskEditor && (getFrameValue("closed") || asset.thumbnail) && (
        <MaskPaintModal
          baseImage={getFrameValue("closed") || asset.thumbnail!}
          imageWidth={baseImageSize.width}
          imageHeight={baseImageSize.height}
          existingMask={maskDataUrl || undefined}
          onSave={handleSaveMask}
          onClose={() => setShowMaskEditor(false)}
        />
      )}
      {showFrameAssetModal && (
        <AssetModal
          open={showFrameAssetModal}
          onClose={handleFrameAssetClose}
          onConfirm={handleFrameAssetConfirm}
          title="Select Frame Image"
          initialFilterType="image"
          allowImport={true}
        />
      )}
    </div>
  , document.body);
}
