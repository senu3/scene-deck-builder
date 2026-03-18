import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Image,
  Film,
  Music,
  Filter,
  ArrowUpDown,
  Layers,
  Link2,
  Download,
  Check,
  FolderOpen,
  Loader2,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  selectVaultPath,
  selectScenes,
  selectSceneOrder,
  selectMetadataStore,
  selectSelectedSceneId,
  selectAssetCache,
  selectSelectedCutId,
  selectDeleteAssetWithPolicy,
  selectCloseDetailsPanel,
} from '../store/selectors';
import type { Asset, AssetIndexEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';
import {
  getAssetThumbnail,
  getCachedAssetThumbnail,
  removeAssetThumbnail,
  resolveAssetThumbnailFromCache,
} from '../features/thumbnails/api';
import { getMediaType as getAnyMediaType } from '../utils/mediaType';
import { collectAssetRefs, type AssetRefMap } from '../utils/assetRefs';
import { getFirstSceneId } from '../utils/sceneOrder';
import { resolveCutAssetId } from '../utils/assetResolve';
import { IconButton, UtilityButton, useBanner, useDialog, useToast } from '../ui';
import {
  AssetContextMenu,
} from './context-menus';
import {
  runAssetDelete,
  runAssetExtractAudio,
  runAssetFinalize,
} from '../features/asset/actions';
import { useHistoryStore } from '../store/historyStore';
import { AddCutCommand } from '../store/commands';
import {
  loadAssetIndexEntries,
  resolveVideoDurationForPath,
} from '../features/metadata/provider';
import {
  hasVaultGatewayBridge,
  pathExistsBridge,
} from '../features/platform/electronGateway';
import {
  getAssetDragOutFailureMessage,
  startAssetDragOut,
} from '../features/platform/osDragGateway';
import { registerAssetFile } from '../features/asset/write';
import {
  checkPathExistsForSourcePanel,
  readFolderContentsForSourcePanel,
  selectSourceFolderForSourcePanel,
} from '../features/project/sourcePanelProvider';
import {
  buildUnregisteredAssetsConfirmDialog,
  formatUnregisteredAssetSyncSummary,
  syncUnregisteredAssetsInVault,
} from '../features/project/unregisteredAssets';
import './AssetPanel.css';

export type SortMode = 'name' | 'type' | 'used' | 'unused';
export type FilterType = 'all' | 'image' | 'video' | 'audio';

export interface AssetInfo {
  id: string;
  name: string;           // File name
  sourceName: string;     // Original name from .index.json (display name)
  path: string;
  type: 'image' | 'video' | 'audio';
  duration?: number;
  thumbnail?: string;
  usageCount: number;
  usageType: 'cut' | 'audio' | 'both' | null;
  linkedAssetIds: string[]; // All assetIds that map to this file (duplicates)
}

export interface AssetPanelProps {
  mode: 'drawer' | 'modal';
  selectionMode?: 'single' | 'multi';  // default: modal=single, drawer=multi
  initialFilterType?: FilterType;

  onSelect?: (asset: AssetInfo) => void;
  onConfirm?: (assets: AssetInfo[]) => void;
  onClose?: () => void;
  onImportExternal?: () => void;

  headerTitle?: string;
  showConfirmButton?: boolean;
  showImportButton?: boolean;
  enableContextMenu?: boolean;  // drawer=true, modal=false
  enableDragDrop?: boolean;     // drawer=true, modal=false
}

// Build usage map from Storyline cuts only.
export function buildUsedAssetsMap(
  refs: AssetRefMap
): Map<string, { count: number; type: 'cut' | 'audio' | 'both' }> {
  const used = new Map<string, { count: number; type: 'cut' | 'audio' | 'both' }>();

  for (const [assetId, refsForAsset] of refs.entries()) {
    const cutCount = refsForAsset.filter((ref) => ref.kind === 'cut').length;
    if (cutCount <= 0) continue;
    const existing = used.get(assetId);
    if (existing) {
      existing.count += cutCount;
    } else {
      used.set(assetId, { count: cutCount, type: 'cut' });
    }
  }

  return used;
}

function buildLinkedAssetIds(refs: AssetRefMap): Set<string> {
  const linked = new Set<string>();

  for (const [assetId, refsForAsset] of refs.entries()) {
    if (refsForAsset.some((ref) => ref.kind !== 'cut')) {
      linked.add(assetId);
    }
  }

  return linked;
}

// Get media type from filename
export function getMediaType(filename: string): 'image' | 'video' | 'audio' | null {
  return getAnyMediaType(filename);
}

// Audio placeholder component with animated waveform
export function AudioPlaceholder() {
  return (
    <div className="audio-placeholder">
      <Music size={24} />
      <div className="waveform">
        <div className="waveform-bar" />
        <div className="waveform-bar" />
        <div className="waveform-bar" />
        <div className="waveform-bar" />
        <div className="waveform-bar" />
      </div>
    </div>
  );
}

export default function AssetPanel({
  mode,
  selectionMode,
  initialFilterType = 'all',
  onSelect,
  onConfirm,
  onClose,
  onImportExternal,
  headerTitle,
  showConfirmButton,
  showImportButton,
  enableContextMenu,
  enableDragDrop,
}: AssetPanelProps) {
  // Determine defaults based on mode
  const effectiveSelectionMode = selectionMode ?? (mode === 'modal' ? 'single' : 'multi');
  const effectiveEnableContextMenu = enableContextMenu ?? (mode === 'drawer');
  const effectiveEnableDragDrop = enableDragDrop ?? (mode === 'drawer');
  const effectiveShowConfirmButton = showConfirmButton ?? (mode === 'modal');
  const effectiveShowImportButton = showImportButton ?? (mode === 'modal');
  const effectiveHeaderTitle = headerTitle ?? (mode === 'modal' ? 'Select Asset' : 'Assets');

  const vaultPath = useStore(selectVaultPath);
  const scenes = useStore(selectScenes);
  const sceneOrder = useStore(selectSceneOrder);
  const metadataStore = useStore(selectMetadataStore);
  const selectedSceneId = useStore(selectSelectedSceneId);
  const assetCache = useStore(selectAssetCache);
  const selectedCutId = useStore(selectSelectedCutId);
  const deleteAssetWithPolicy = useStore(selectDeleteAssetWithPolicy);
  const closeDetailsPanel = useStore(selectCloseDetailsPanel);
  const { executeCommand } = useHistoryStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [filterType, setFilterType] = useState<FilterType>(initialFilterType);
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  // Version counter to trigger re-render when thumbnail cache updates
  const [, setThumbnailCacheVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetInfo | null>(null);
  const [assetContextMenu, setAssetContextMenu] = useState<{
    x: number;
    y: number;
    asset: AssetInfo;
    hasClipRange: boolean;
    clipInPoint?: number;
    clipOutPoint?: number;
  } | null>(null);
  const [bulkImportProgress, setBulkImportProgress] = useState<{
    isActive: boolean;
    current: number;
    total: number;
  }>({ isActive: false, current: 0, total: 0 });
  const [isSyncingUnregistered, setIsSyncingUnregistered] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { banner } = useBanner();
  const { confirm: dialogConfirm, alert: dialogAlert } = useDialog();
  const FFmpegBannerId = 'asset-panel-ffmpeg';

  const assetRefs = useMemo(
    () => collectAssetRefs(scenes, metadataStore),
    [scenes, metadataStore]
  );

  // Build usage map
  const usedAssetsMap = useMemo(
    () => buildUsedAssetsMap(assetRefs),
    [assetRefs]
  );
  const linkedAssetIds = useMemo(
    () => buildLinkedAssetIds(assetRefs),
    [assetRefs]
  );
  // Load asset index from .index.json
  const loadAssetIndex = useCallback(async (): Promise<Map<string, AssetIndexEntry[]>> => {
    const indexMap = new Map<string, AssetIndexEntry[]>();
    if (!vaultPath) return indexMap;

    try {
      const entries = await loadAssetIndexEntries(vaultPath);
      for (const entry of entries) {
        // Group by filename for duplicate support
        const existing = indexMap.get(entry.filename);
        if (existing) {
          existing.push(entry as AssetIndexEntry);
        } else {
          indexMap.set(entry.filename, [entry as AssetIndexEntry]);
        }
      }
    } catch (error) {
      console.error('Failed to load asset index:', error);
    }

    return indexMap;
  }, [vaultPath]);

  // Load assets from vault/assets folder
  const loadAssets = useCallback(async () => {
    if (!vaultPath) return;

    setIsLoading(true);
    try {
      const assetsPath = `${vaultPath}/assets`.replace(/\\/g, '/');
      const exists = await checkPathExistsForSourcePanel(assetsPath);
      if (!exists) {
        setAssets([]);
        return;
      }

      // Load asset index for source names
      const assetIndex = await loadAssetIndex();

      const structure = await readFolderContentsForSourcePanel(assetsPath);
      if (!structure) {
        setAssets([]);
        return;
      }
      const assetList: AssetInfo[] = [];

      const pickDisplayName = (entries: AssetIndexEntry[] | undefined, fallback: string) => {
        if (!entries || entries.length === 0) return fallback;
        const sorted = [...entries].sort((a, b) => {
          const aTime = Date.parse(a.importedAt || '');
          const bTime = Date.parse(b.importedAt || '');
          if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
          if (Number.isNaN(aTime)) return 1;
          if (Number.isNaN(bTime)) return -1;
          return bTime - aTime;
        });
        return sorted[0]?.originalName || fallback;
      };

      type UsageType = 'cut' | 'audio' | 'both' | null;
      const aggregateUsage = (assetIds: string[]): { count: number; type: UsageType } => {
        let totalCount = 0;
        let hasCut = false;
        let hasAudio = false;
        for (const id of assetIds) {
          const usage = usedAssetsMap.get(id);
          if (!usage) continue;
          totalCount += usage.count;
          if (usage.type === 'both') {
            hasCut = true;
            hasAudio = true;
          } else if (usage.type === 'cut') {
            hasCut = true;
          } else if (usage.type === 'audio') {
            hasAudio = true;
          }
        }
        const usageType: UsageType = hasCut && hasAudio ? 'both' : hasCut ? 'cut' : hasAudio ? 'audio' : null;
        return { count: totalCount, type: usageType };
      };

      const managedFiles = new Map<string, { path: string; mediaType: Asset['type'] }>();
      for (const item of structure) {
        if (item.isDirectory) continue;
        if (item.name === '.index.json' || item.name === '.metadata.json') continue;
        const mediaType = getMediaType(item.name);
        if (!mediaType) continue;
        managedFiles.set(item.name, {
          path: item.path,
          mediaType,
        });
      }

      for (const [filename, indexEntries] of assetIndex.entries()) {
        const managedFile = managedFiles.get(filename);
        if (!managedFile || indexEntries.length === 0) continue;

        const linkedIds = indexEntries.map((entry) => entry.id).filter(Boolean);
        if (linkedIds.length === 0) continue;

        const cachedAsset = linkedIds
          .map((id) => assetCache.get(id))
          .find((asset) => !!asset);
        const usage = aggregateUsage(linkedIds);

        assetList.push({
          id: cachedAsset?.id || linkedIds[0],
          name: filename,
          sourceName: pickDisplayName(indexEntries, filename),
          path: managedFile.path,
          type: cachedAsset?.type || managedFile.mediaType,
          duration: cachedAsset?.duration,
          thumbnail: cachedAsset?.thumbnail,
          usageCount: usage.count,
          usageType: usage.type,
          linkedAssetIds: linkedIds,
        });
      }

      setAssets(assetList);
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [vaultPath, assetCache, usedAssetsMap, loadAssetIndex]);

  // Load assets on mount
  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // Bulk import handler - import all media files from a folder
  const handleBulkImport = useCallback(async () => {
    if (!vaultPath || !hasVaultGatewayBridge()) {
      toast.error('Vault not available', 'Please set up a vault first.');
      return;
    }

    // Select folder
    const folder = await selectSourceFolderForSourcePanel();
    if (!folder) return;

    // Collect all media files recursively
    const mediaFiles: { name: string; path: string; type: 'image' | 'video' | 'audio' }[] = [];
    const collectMediaFiles = (items: Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }>) => {
      for (const item of items) {
        if (item.isDirectory) {
          if (item.children) {
            collectMediaFiles(item.children as Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }>);
          }
        } else {
          const mediaType = getMediaType(item.name);
          if (mediaType) {
            mediaFiles.push({ name: item.name, path: item.path, type: mediaType });
          }
        }
      }
    };

    collectMediaFiles(folder.structure);

    if (mediaFiles.length === 0) {
      toast.info('No media files found', 'The selected folder contains no images, videos, or audio files.');
      return;
    }

    // Start import
    setBulkImportProgress({ isActive: true, current: 0, total: mediaFiles.length });
    const toastId = toast.info(`Importing 0/${mediaFiles.length}...`, undefined, { duration: 0 });

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      const assetId = uuidv4();

      try {
        const result = await registerAssetFile({
          sourcePath: file.path,
          vaultPath,
          assetId,
          existingAsset: {
            name: file.name,
            type: file.type,
          },
        });

        if (result) {
          if (result.isDuplicate) {
            skipped++;
          } else {
            imported++;
          }
        } else {
          failed++;
          console.error(`Failed to import ${file.name}`);
        }
      } catch (error) {
        failed++;
        console.error(`Error importing ${file.name}:`, error);
      }

      setBulkImportProgress({ isActive: true, current: i + 1, total: mediaFiles.length });
      toast.dismiss(toastId);
      toast.info(`Importing ${i + 1}/${mediaFiles.length}...`, undefined, { duration: 0, id: toastId });
    }

    // Complete
    setBulkImportProgress({ isActive: false, current: 0, total: 0 });
    toast.dismiss(toastId);

    // Show result
    const messages: string[] = [];
    if (imported > 0) messages.push(`${imported} imported`);
    if (skipped > 0) messages.push(`${skipped} duplicates`);
    if (failed > 0) messages.push(`${failed} failed`);

    if (failed > 0) {
      toast.warning('Import completed with errors', messages.join(', '));
    } else {
      toast.success('Import completed', messages.join(', '));
    }

    // Reload asset list
    loadAssets();
  }, [vaultPath, toast, loadAssets]);

  const handleSyncUnregistered = useCallback(async () => {
    if (!vaultPath) {
      toast.warning('Vault path not set', 'Please set up a vault first.');
      return;
    }

    setIsSyncingUnregistered(true);
    try {
      const result = await syncUnregisteredAssetsInVault({
        vaultPath,
        confirm: async (files) => dialogConfirm(buildUnregisteredAssetsConfirmDialog(files)),
      });

      if (result.detectedCount === 0) {
        toast.info('No Unregistered Media', 'No unregistered media files were found in assets/.');
        return;
      }

      if (result.failedCount > 0) {
        await dialogAlert({
          title: 'Some Assets Were Not Added',
          message: formatUnregisteredAssetSyncSummary(result),
          variant: 'warning',
        });
      } else if (result.registeredCount > 0) {
        toast.info('Assets Added', formatUnregisteredAssetSyncSummary(result));
      }

      if (result.confirmed) {
        await loadAssets();
      }
    } finally {
      setIsSyncingUnregistered(false);
    }
  }, [dialogAlert, dialogConfirm, loadAssets, toast, vaultPath]);

  // Load thumbnail for an asset (uses shared cache)
  const loadThumbnail = useCallback(async (asset: AssetInfo) => {
    if (getCachedAssetThumbnail('asset-grid', { assetId: asset.id, path: asset.path })) return;
    if (asset.type === 'audio') return; // Audio has placeholder

    try {
      const exists = await pathExistsBridge(asset.path);
      if (!exists) return;

      if (asset.type === 'image' || asset.type === 'video') {
        const thumbnail = await getAssetThumbnail('asset-grid', {
          assetId: asset.id,
          path: asset.path,
          type: asset.type,
        });
        if (thumbnail) setThumbnailCacheVersion((v) => v + 1);
      }
    } catch (error) {
      console.error('Failed to load thumbnail:', error);
    }
  }, []);

  // Close more menu when clicking outside
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    let result = [...assets];

    // Apply search filter (search both sourceName and filename)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.sourceName.toLowerCase().includes(query) ||
          a.name.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      result = result.filter((a) => a.type === filterType);
    }

    // In drawer mode, hide linked-only non-audio assets.
    if (mode === 'drawer') {
      result = result.filter((a) => {
        if (a.type === 'audio') return true;
        if (a.usageCount > 0) return true;
        return !a.linkedAssetIds.some((id) => linkedAssetIds.has(id));
      });
    }

    // Apply sort
    switch (sortMode) {
      case 'name':
        result.sort((a, b) => a.sourceName.localeCompare(b.sourceName));
        break;
      case 'type':
        const typeOrder = { image: 0, video: 1, audio: 2 };
        result.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
        break;
      case 'used':
        result.sort((a, b) => b.usageCount - a.usageCount);
        break;
      case 'unused':
        result.sort((a, b) => a.usageCount - b.usageCount);
        break;
    }

    return result;
  }, [assets, searchQuery, filterType, sortMode, mode, linkedAssetIds]);

  const findCutForAsset = useCallback((assetIds: string[]) => {
    const idSet = new Set(assetIds);
    if (selectedCutId) {
      for (const scene of scenes) {
        const idx = scene.cuts.findIndex((c) => c.id === selectedCutId);
        if (idx >= 0) {
          const cut = scene.cuts[idx];
          const cutAssetId = resolveCutAssetId(cut, () => undefined);
          if (cutAssetId && idSet.has(cutAssetId)) {
            return { scene, cut, index: idx };
          }
        }
      }
    }

    for (const scene of scenes) {
      const idx = scene.cuts.findIndex((c) => {
        const cutAssetId = resolveCutAssetId(c, () => undefined);
        return cutAssetId ? idSet.has(cutAssetId) : false;
      });
      if (idx >= 0) {
        return { scene, cut: scene.cuts[idx], index: idx };
      }
    }

    return null;
  }, [scenes, selectedCutId]);

  const handleAssetContextMenu = (e: React.MouseEvent, asset: AssetInfo) => {
    if (!effectiveEnableContextMenu) return;

    e.preventDefault();
    e.stopPropagation();

    const match = findCutForAsset(asset.linkedAssetIds.length ? asset.linkedAssetIds : [asset.id]);
    setAssetContextMenu({
      x: e.clientX,
      y: e.clientY,
      asset,
      hasClipRange: !!match?.cut.isClip,
      clipInPoint: match?.cut.inPoint,
      clipOutPoint: match?.cut.outPoint,
    });
  };

  const resolveAssetDuration = useCallback(async (assetPath: string, linkedAssetIds: string[]): Promise<number | null> => {
    const linkedDuration = linkedAssetIds
      .map((id) => assetCache.get(id)?.duration)
      .find((duration) => typeof duration === 'number' && Number.isFinite(duration) && duration > 0);
    if (typeof linkedDuration === 'number') return linkedDuration;
    return resolveVideoDurationForPath(assetPath);
  }, [assetCache]);

  const reportFinalizeResult = (
    result: { success: boolean; fileName?: string; fileSize?: number; error?: string; reason?: string }
  ) => {
    if (result.success) {
      const sizeText = result.fileSize ? `${(result.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size';
      toast.success('Asset created', `${result.fileName} (${sizeText})`);
      return;
    }
    if (result.reason === 'runtime') {
      toast.error('Asset conversion failed', result.error || 'Unknown error');
      return;
    }
    toast.error('Asset conversion failed', result.error || 'Unknown error');
  };

  const reportExtractAudioResult = (
    result: { success: boolean; fileName?: string; fileSize?: number; error?: string }
  ) => {
    if (result.success) {
      const sizeText = result.fileSize ? `${(result.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size';
      toast.success('Audio extracted', `${result.fileName} (${sizeText})`);
      return;
    }
    toast.error('Extract Audio failed', result.error || 'Unknown error');
  };

  const buildRegisteredAssetForTimeline = useCallback((asset: AssetInfo): Asset => ({
    id: asset.id,
    name: asset.sourceName,
    originalName: asset.sourceName,
    path: asset.path,
    type: asset.type,
    duration: asset.duration,
    thumbnail: resolveAssetThumbnailFromCache('asset-grid', asset) || undefined,
    vaultRelativePath: `assets/${asset.name}`,
  }), []);

  const handleAssetMenuFinalize = async () => {
    if (!assetContextMenu) return;
    banner.show({
      id: FFmpegBannerId,
      variant: 'progress',
      message: 'Running Finalize Clip...',
      icon: 'sync',
      dismissible: false,
    });

    const result = await runAssetFinalize({
      assetPath: assetContextMenu.asset.path,
      sourceName: assetContextMenu.asset.sourceName,
      assetType: assetContextMenu.asset.type,
      linkedAssetIds: assetContextMenu.asset.linkedAssetIds,
      fallbackAssetId: assetContextMenu.asset.id,
      hasClipRange: assetContextMenu.hasClipRange,
      clipInPoint: assetContextMenu.clipInPoint,
      clipOutPoint: assetContextMenu.clipOutPoint,
    }, {
      vaultPath,
      reverseOutput: false,
      requireClipRange: true,
    }, {
      resolveDurationSec: (assetPath) => resolveAssetDuration(assetPath, assetContextMenu.asset.linkedAssetIds),
    });
    banner.dismiss(FFmpegBannerId);

    if (!result.success && result.reason === 'missing-vault') {
      toast.warning('Vault path not set', 'Please set up a vault first.');
      setAssetContextMenu(null);
      return;
    }
    if (!result.success && result.reason === 'range-required') {
      toast.warning('Clip range not found', 'Finalize Clip requires a clip with IN/OUT points.');
      setAssetContextMenu(null);
      return;
    }
    if (!result.success && result.reason === 'queue-busy') {
      toast.error('FFmpeg queue is busy', 'Please wait for the current process to finish.');
      setAssetContextMenu(null);
      return;
    }
    if (result.success) {
      reportFinalizeResult(result.result);
    }
    await loadAssets();
    setAssetContextMenu(null);
  };

  const handleAssetMenuReverse = async () => {
    if (!assetContextMenu) return;
    if (!vaultPath) {
      toast.warning('Vault path not set', 'Please set up a vault first.');
      setAssetContextMenu(null);
      return;
    }
    banner.show({
      id: FFmpegBannerId,
      variant: 'progress',
      message: 'Running Reverse Clip...',
      icon: 'sync',
      dismissible: false,
    });

    const result = await runAssetFinalize({
      assetPath: assetContextMenu.asset.path,
      sourceName: assetContextMenu.asset.sourceName,
      assetType: assetContextMenu.asset.type,
      linkedAssetIds: assetContextMenu.asset.linkedAssetIds,
      fallbackAssetId: assetContextMenu.asset.id,
      hasClipRange: assetContextMenu.hasClipRange,
      clipInPoint: assetContextMenu.clipInPoint,
      clipOutPoint: assetContextMenu.clipOutPoint,
    }, {
      vaultPath,
      reverseOutput: true,
      requireClipRange: false,
    }, {
      resolveDurationSec: (assetPath) => resolveAssetDuration(assetPath, assetContextMenu.asset.linkedAssetIds),
    });
    banner.dismiss(FFmpegBannerId);

    if (!result.success && result.reason === 'duration-unavailable') {
      toast.warning('Duration unavailable', 'Unable to resolve video duration for reverse.');
      setAssetContextMenu(null);
      return;
    }
    if (!result.success && result.reason === 'unsupported-asset-type') {
      toast.warning('Unsupported asset type', 'Reverse is available only for video assets.');
      setAssetContextMenu(null);
      return;
    }
    if (!result.success && result.reason === 'queue-busy') {
      toast.error('FFmpeg queue is busy', 'Please wait for the current process to finish.');
      setAssetContextMenu(null);
      return;
    }
    if (result.success) {
      reportFinalizeResult(result.result);
    }
    await loadAssets();
    setAssetContextMenu(null);
  };

  const handleAssetMenuExtractAudio = async () => {
    if (!assetContextMenu) return;
    banner.show({
      id: FFmpegBannerId,
      variant: 'progress',
      message: 'Running Extract Audio...',
      icon: 'sync',
      dismissible: false,
    });

    const result = await runAssetExtractAudio({
      assetPath: assetContextMenu.asset.path,
      sourceName: assetContextMenu.asset.sourceName,
      assetType: assetContextMenu.asset.type,
      linkedAssetIds: assetContextMenu.asset.linkedAssetIds,
      fallbackAssetId: assetContextMenu.asset.id,
      hasClipRange: assetContextMenu.hasClipRange,
      clipInPoint: assetContextMenu.clipInPoint,
      clipOutPoint: assetContextMenu.clipOutPoint,
    }, {
      vaultPath,
    }, {
      resolveDurationSec: (assetPath) => resolveAssetDuration(assetPath, assetContextMenu.asset.linkedAssetIds),
    });
    banner.dismiss(FFmpegBannerId);

    if (!result.success && result.reason === 'missing-vault') {
      toast.warning('Vault path not set', 'Please set up a vault first.');
      setAssetContextMenu(null);
      return;
    }
    if (!result.success && result.reason === 'duration-unavailable') {
      toast.warning('Duration unavailable', 'Unable to resolve video duration for extract audio.');
      setAssetContextMenu(null);
      return;
    }
    if (!result.success && result.reason === 'unsupported-asset-type') {
      toast.warning('Unsupported asset type', 'Extract Audio is available only for video assets.');
      setAssetContextMenu(null);
      return;
    }
    if (!result.success && result.reason === 'queue-busy') {
      toast.error('FFmpeg queue is busy', 'Please wait for the current process to finish.');
      setAssetContextMenu(null);
      return;
    }

    if (result.success) {
      reportExtractAudioResult(result.result);
    }
    await loadAssets();
    setAssetContextMenu(null);
  };

  const handleDeleteAsset = async () => {
    if (!assetContextMenu) return;
    if (!hasVaultGatewayBridge()) {
      toast.error('Delete failed', 'electronAPI not available. Please restart the app.');
      setAssetContextMenu(null);
      return;
    }

    const asset = assetContextMenu.asset;

    const confirmed = await dialogConfirm({
      title: 'Delete Asset',
      message: 'Move this asset to trash?',
      targetName: asset.sourceName,
      variant: 'danger',
      confirmLabel: 'Move to Trash',
      cancelLabel: 'Cancel',
    });

    if (!confirmed) {
      setAssetContextMenu(null);
      return;
    }

    let result: Awaited<ReturnType<typeof runAssetDelete>>;
    try {
      result = await runAssetDelete({
        assetPath: asset.path,
        sourceName: asset.sourceName,
        assetType: asset.type,
        linkedAssetIds: asset.linkedAssetIds,
        fallbackAssetId: asset.id,
        hasClipRange: assetContextMenu.hasClipRange,
        clipInPoint: assetContextMenu.clipInPoint,
        clipOutPoint: assetContextMenu.clipOutPoint,
      }, {
        reason: 'asset-panel-delete',
        assetRefs,
      }, {
        deleteAssetWithPolicy,
      });
    } catch (error) {
      toast.error('Delete failed', String(error));
      setAssetContextMenu(null);
      return;
    }

    if (!result.success && result.reason === 'blocked') {
      const firstKind = result.blockingKind || 'unknown';
      await dialogAlert({
        title: 'Cannot Delete Asset',
        message: `This asset is still referenced (${firstKind}).`,
        variant: 'warning',
      });
      setAssetContextMenu(null);
      return;
    }

    if (!result.success && result.reason === 'delete-failed') {
      toast.error('Delete failed', 'Failed to move asset to trash.');
      setAssetContextMenu(null);
      return;
    }

    setAssets((prev) => prev.filter((a) => a.path !== asset.path));
    removeAssetThumbnail('asset-grid', { assetId: asset.id, path: asset.path });
    if (result.success && result.warning === 'index-sync-failed') {
      toast.warning(
        'Asset moved, index sync pending',
        'Please run recovery or reload project metadata to resync asset index.'
      );
    }
    toast.success('Asset moved to trash', asset.sourceName);
    setAssetContextMenu(null);
  };

  // Handle drag start - close drawer when leaving
  const handleDragStart = (e: React.DragEvent, asset: AssetInfo) => {
    if (!effectiveEnableDragDrop) {
      e.preventDefault();
      return;
    }
    const dragThumbnail = resolveAssetThumbnailFromCache('asset-grid', asset) || undefined;
    const dragAsset: Asset = {
      id: asset.id,
      name: asset.sourceName, // Use source name
      originalName: asset.sourceName,
      path: asset.path,
      type: asset.type,
      duration: asset.duration,
      thumbnail: dragThumbnail,
      vaultRelativePath: `assets/${asset.name}`,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragAsset));
    e.dataTransfer.setData('text/scene-deck-asset', '1');
    e.dataTransfer.effectAllowed = 'copy';
    try {
      // Suppress oversized browser drag preview; OS-level file drag still uses main.startDrag.
      const dragGhost = document.createElement('canvas');
      dragGhost.width = 1;
      dragGhost.height = 1;
      e.dataTransfer.setDragImage(dragGhost, 0, 0);
    } catch {
      // Ignore drag preview customization errors.
    }

    try {
      const started = startAssetDragOut(asset.id);
      if (!started.ok) {
        const message = getAssetDragOutFailureMessage(started.reason);
        console.warn('[DND] External file drag was rejected by main process.', {
          assetId: asset.id,
          reason: started.reason,
        });
        toast.warning('External drag unavailable', message);
      }
    } catch {
      toast.warning('External drag unavailable', 'External drag could not be started.');
    }

    closeDetailsPanel();
    if (mode === 'drawer' && onClose) {
      requestAnimationFrame(() => onClose());
    }
  };

  // Handle double-click to add to timeline (drawer mode)
  const handleDoubleClick = async (asset: AssetInfo) => {
    if (asset.type === 'audio') {
      return;
    }

    if (mode === 'modal') {
      // In modal mode, double-click confirms selection
      setSelectedAsset(asset);
      onSelect?.(asset);
      onConfirm?.([asset]);
      return;
    }

    // Drawer mode: add to timeline
    const targetSceneId = selectedSceneId || getFirstSceneId(scenes, sceneOrder);
    if (!targetSceneId) return;

    try {
      const resolvedDuration = asset.type === 'video'
        ? (asset.duration ?? await resolveAssetDuration(asset.path, asset.linkedAssetIds) ?? undefined)
        : undefined;
      await executeCommand(
        new AddCutCommand(
          targetSceneId,
          {
            ...buildRegisteredAssetForTimeline(asset),
            duration: resolvedDuration,
          },
          asset.type === 'video' ? resolvedDuration : undefined,
        )
      );
    } catch (error) {
      console.error('Failed to add asset to timeline:', error);
    }
  };

  // Handle single click selection (modal mode)
  const handleAssetClick = (asset: AssetInfo) => {
    if (effectiveSelectionMode === 'single') {
      setSelectedAsset(asset);
      onSelect?.(asset);
    }
  };

  // Handle confirm button click
  const handleConfirm = () => {
    if (selectedAsset) {
      onConfirm?.([selectedAsset]);
    }
  };

  const sortLabels: Record<SortMode, string> = {
    name: 'Name',
    type: 'Type',
    used: 'Most Used',
    unused: 'Unused First',
  };

  return (
    <>
      <div ref={panelRef} className={`asset-panel asset-panel--${mode}`}>
        {/* Header */}
        <div className="asset-panel-header">
          <h2>{effectiveHeaderTitle}</h2>
          {onClose && (
            <IconButton className="asset-panel-close-btn" onClick={onClose} aria-label="Close asset panel">
              <X size={20} />
            </IconButton>
          )}
        </div>

        {/* Toolbar */}
        <div className="asset-panel-toolbar">
          {/* Search box with integrated menu */}
          <div className="asset-panel-search" ref={moreMenuRef}>
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {/* More actions menu (drawer mode only) */}
            {mode === 'drawer' && (
              <div className="more-menu-container">
                <button
                  className="more-menu-btn"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  title="More actions"
                >
                  {bulkImportProgress.isActive || isSyncingUnregistered ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <MoreVertical size={16} />
                  )}
                </button>
                {showMoreMenu && (
                  <div className="more-menu-dropdown">
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleBulkImport();
                      }}
                      disabled={bulkImportProgress.isActive || isSyncingUnregistered}
                    >
                      <FolderOpen size={14} />
                      {bulkImportProgress.isActive
                        ? `Importing ${bulkImportProgress.current}/${bulkImportProgress.total}...`
                        : 'Import Folder...'}
                    </button>
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        handleSyncUnregistered();
                      }}
                      disabled={bulkImportProgress.isActive || isSyncingUnregistered}
                    >
                      <Link2 size={14} />
                      {isSyncingUnregistered ? 'Syncing Media...' : 'Sync Media...'}
                    </button>
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        loadAssets();
                      }}
                      disabled={bulkImportProgress.isActive || isSyncingUnregistered}
                    >
                      <RefreshCw size={14} />
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sort and filter row */}
          <div className="asset-panel-filters">
            {/* Sort dropdown */}
            <div className="sort-dropdown-container">
              <button
                className="filter-btn"
                onClick={() => setShowSortDropdown(!showSortDropdown)}
              >
                <ArrowUpDown size={14} />
                <span>{sortLabels[sortMode]}</span>
              </button>
              {showSortDropdown && (
                <div className="sort-dropdown">
                  {(Object.keys(sortLabels) as SortMode[]).map((m) => (
                    <button
                      key={m}
                      className={sortMode === m ? 'active' : ''}
                      onClick={() => {
                        setSortMode(m);
                        setShowSortDropdown(false);
                      }}
                    >
                      {sortLabels[m]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Type filter chips */}
            <div className="type-filters">
              <button
                className={`type-chip ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                <Filter size={12} />
                All
              </button>
              <button
                className={`type-chip ${filterType === 'image' ? 'active' : ''}`}
                onClick={() => setFilterType('image')}
              >
                <Image size={12} />
              </button>
              <button
                className={`type-chip ${filterType === 'video' ? 'active' : ''}`}
                onClick={() => setFilterType('video')}
              >
                <Film size={12} />
              </button>
              <button
                className={`type-chip ${filterType === 'audio' ? 'active' : ''}`}
                onClick={() => setFilterType('audio')}
              >
                <Music size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Asset grid */}
        <div className="asset-panel-grid">
          {isLoading ? (
            <div className="asset-panel-loading">Loading assets...</div>
          ) : filteredAssets.length === 0 ? (
            <div className="asset-panel-empty">
              {assets.length === 0 ? 'No assets in vault' : 'No matching assets'}
            </div>
          ) : (
            filteredAssets.map((asset) => (
              <AssetCard
                key={asset.path}
                asset={asset}
                thumbnail={resolveAssetThumbnailFromCache('asset-grid', asset) || undefined}
                isSelected={selectedAsset?.id === asset.id}
                onLoadThumbnail={() => loadThumbnail(asset)}
                onDragStart={effectiveEnableDragDrop ? (e) => handleDragStart(e, asset) : undefined}
                onClick={() => handleAssetClick(asset)}
                onDoubleClick={() => handleDoubleClick(asset)}
                onContextMenu={effectiveEnableContextMenu ? (e) => handleAssetContextMenu(e, asset) : undefined}
                draggable={effectiveEnableDragDrop}
              />
            ))
          )}
        </div>

        {/* Footer (modal mode) */}
        {(effectiveShowConfirmButton || effectiveShowImportButton) && (
          <div className="asset-panel-footer">
            {effectiveShowImportButton && onImportExternal && (
              <UtilityButton variant="soft" size="md" className="asset-panel-import-btn" onClick={onImportExternal}>
                <Download size={16} />
                <span>Import from File</span>
              </UtilityButton>
            )}
            {effectiveShowConfirmButton && (
              <UtilityButton
                variant="primary"
                size="lg"
                className="asset-panel-confirm-btn"
                onClick={handleConfirm}
                disabled={!selectedAsset}
              >
                <Check size={16} />
                <span>Select</span>
              </UtilityButton>
            )}
          </div>
        )}
      </div>

      {/* Context Menus (drawer mode only) */}
      {effectiveEnableContextMenu && assetContextMenu && (
        <AssetContextMenu
          position={{ x: assetContextMenu.x, y: assetContextMenu.y }}
          canFinalizeClip={assetContextMenu.asset.type === 'video' && assetContextMenu.hasClipRange}
          canReverse={assetContextMenu.asset.type === 'video'}
          canExtractAudio={assetContextMenu.asset.type === 'video'}
          onClose={() => setAssetContextMenu(null)}
          onFinalizeClip={handleAssetMenuFinalize}
          onReverse={handleAssetMenuReverse}
          onExtractAudio={handleAssetMenuExtractAudio}
          onDelete={handleDeleteAsset}
        />
      )}
    </>
  );
}

interface AssetCardProps {
  asset: AssetInfo;
  thumbnail?: string;
  isSelected?: boolean;
  onLoadThumbnail: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onClick?: () => void;
  onDoubleClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  draggable?: boolean;
}

function AssetCard({
  asset,
  thumbnail,
  isSelected,
  onLoadThumbnail,
  onDragStart,
  onClick,
  onDoubleClick,
  onContextMenu,
  draggable,
}: AssetCardProps) {
  // Load thumbnail on mount
  useEffect(() => {
    if (!thumbnail && asset.type !== 'audio') {
      onLoadThumbnail();
    }
  }, [thumbnail, asset.type, onLoadThumbnail]);

  // Determine usage badge style
  const getUsageBadgeClass = () => {
    if (!asset.usageType) return '';
    if (asset.usageType === 'both') return 'usage-both';
    if (asset.usageType === 'audio') return 'usage-audio';
    return 'usage-cut';
  };

  return (
    <div
      className={`asset-card ${asset.usageCount > 0 ? 'used' : ''} ${asset.usageType ? `usage-${asset.usageType}` : ''} ${isSelected ? 'selected' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={`${asset.sourceName}\n(${asset.name})`}
    >
      <div className="asset-card-thumbnail">
        {asset.type === 'audio' ? (
          <AudioPlaceholder />
        ) : thumbnail ? (
          <img src={thumbnail} alt={asset.sourceName} draggable={false} />
        ) : (
          <div className="asset-card-placeholder">
            {asset.type === 'video' ? <Film size={24} /> : <Image size={24} />}
          </div>
        )}

        {/* Type badge */}
        {asset.type === 'video' && (
          <div className="asset-type-badge video">
            <Film size={10} />
          </div>
        )}
        {asset.type === 'audio' && (
          <div className="asset-type-badge audio">
            <Music size={10} />
          </div>
        )}

        {/* Usage indicator - more prominent */}
        {asset.usageCount > 0 && (
          <div className={`asset-usage-badge ${getUsageBadgeClass()}`} title={
            asset.usageType === 'cut'
              ? `Used in ${asset.usageCount} cut(s)`
              : asset.usageType === 'audio'
              ? `Attached as audio ${asset.usageCount} time(s)`
              : `Used in cuts and as audio (${asset.usageCount} total)`
          }>
            {asset.usageType === 'cut' && <Layers size={10} />}
            {asset.usageType === 'audio' && <Link2 size={10} />}
            {asset.usageType === 'both' && <><Layers size={10} /><Link2 size={10} /></>}
            <span>{asset.usageCount}</span>
          </div>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="asset-selected-badge">
            <Check size={14} />
          </div>
        )}
      </div>
      <span className="asset-card-name">{asset.sourceName}</span>
    </div>
  );
}
