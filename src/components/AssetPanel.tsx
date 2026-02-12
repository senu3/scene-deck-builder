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
import { useHistoryStore } from '../store/historyStore';
import type { Asset, AssetIndexEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { getCachedThumbnail, getThumbnail, removeThumbnailCache } from '../utils/thumbnailCache';
import { getMediaType as getAnyMediaType } from '../utils/mediaType';
import { collectAssetRefs, getBlockingRefsForAssetIds, type AssetRefMap } from '../utils/assetRefs';
import { useDialog, useToast } from '../ui';
import {
  CutContextMenu,
  AssetContextMenu,
} from './context-menus';
import {
  finalizeClipFromContext,
} from '../features/cut/actions';
import './AssetPanel.css';
import { MoveCutsToSceneCommand, RemoveCutCommand } from '../store/commands';

export type SortMode = 'name' | 'type' | 'used' | 'unused';
export type FilterType = 'all' | 'image' | 'video' | 'audio';

export interface AssetInfo {
  id: string;
  name: string;           // File name
  sourceName: string;     // Original name from .index.json (display name)
  path: string;
  type: 'image' | 'video' | 'audio';
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

  const {
    vaultPath,
    scenes,
    metadataStore,
    selectedSceneId,
    createCutFromImport,
    assetCache,
    selectedCutId,
    selectedCutIds,
    selectCut,
    getSelectedCutIds,
    getSelectedCuts,
    copySelectedCuts,
    canPaste,
    pasteCuts,
    getAsset,
    deleteAssetWithPolicy,
    getCutGroup,
    updateGroupCutOrder,
    closeDetailsPanel,
  } = useStore();
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
  const [cutContextMenu, setCutContextMenu] = useState<{
    x: number;
    y: number;
    sceneId: string;
    cutId: string;
    index: number;
    isClip: boolean;
  } | null>(null);
  const [unusedContextMenu, setUnusedContextMenu] = useState<{
    x: number;
    y: number;
    asset: AssetInfo;
  } | null>(null);
  const [bulkImportProgress, setBulkImportProgress] = useState<{
    isActive: boolean;
    current: number;
    total: number;
  }>({ isActive: false, current: 0, total: 0 });
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { confirm: dialogConfirm, alert: dialogAlert } = useDialog();

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
    if (!vaultPath || !window.electronAPI) return indexMap;

    try {
      const index = await window.electronAPI.loadAssetIndex(vaultPath);
      if (index && index.assets) {
        for (const entry of index.assets) {
          // Group by filename for duplicate support
          const existing = indexMap.get(entry.filename);
          if (existing) {
            existing.push(entry);
          } else {
            indexMap.set(entry.filename, [entry]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load asset index:', error);
    }

    return indexMap;
  }, [vaultPath]);

  // Load assets from vault/assets folder
  const loadAssets = useCallback(async () => {
    if (!vaultPath || !window.electronAPI) return;

    setIsLoading(true);
    try {
      const assetsPath = `${vaultPath}/assets`.replace(/\\/g, '/');
      const exists = await window.electronAPI.pathExists(assetsPath);
      if (!exists) {
        setAssets([]);
        return;
      }

      // Load asset index for source names
      const assetIndex = await loadAssetIndex();

      const structure = await window.electronAPI.getFolderContents(assetsPath);
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

      // Flatten folder structure and get all files
      const processItems = (items: Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }>) => {
        for (const item of items) {
          if (item.isDirectory) {
            if (item.children) {
              processItems(item.children as Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }>);
            }
          } else {
            // Skip .index.json
            if (item.name === '.index.json') continue;

            const mediaType = getMediaType(item.name);
            if (mediaType) {
              // Look up source name(s) from index (handle duplicates)
              const indexEntries = assetIndex.get(item.name);
              const sourceName = pickDisplayName(indexEntries, item.name);

              // Use asset IDs from index if available
              const fallbackAssetId = `asset-${item.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
              const linkedAssetIds = indexEntries?.length ? indexEntries.map((entry) => entry.id) : [fallbackAssetId];
              const primaryAssetId = linkedAssetIds[0] || fallbackAssetId;

              // Check if asset is cached
              const cachedAsset = linkedAssetIds
                .map((id) => assetCache.get(id))
                .find((asset) => !!asset);
              const usage = aggregateUsage(linkedAssetIds);

              assetList.push({
                id: cachedAsset?.id || primaryAssetId,
                name: item.name,
                sourceName,
                path: item.path,
                type: mediaType,
                thumbnail: cachedAsset?.thumbnail,
                usageCount: usage.count,
                usageType: usage.type,
                linkedAssetIds,
              });
            }
          }
        }
      };

      processItems(structure);
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
    if (!vaultPath || !window.electronAPI?.vaultGateway) {
      toast.error('Vault not available', 'Please set up a vault first.');
      return;
    }

    // Select folder
    const folder = await window.electronAPI.selectFolder();
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
        const result = await window.electronAPI.vaultGateway.importAndRegisterAsset(
          file.path,
          vaultPath,
          assetId
        );

        if (result.success) {
          if (result.isDuplicate) {
            skipped++;
          } else {
            imported++;
          }
        } else {
          failed++;
          console.error(`Failed to import ${file.name}:`, result.error);
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

  // Load thumbnail for an asset (uses shared cache)
  const loadThumbnail = useCallback(async (asset: AssetInfo) => {
    if (getCachedThumbnail(asset.path, { profile: 'asset-grid' })) return;
    if (asset.type === 'audio') return; // Audio has placeholder

    try {
      if (window.electronAPI) {
        const exists = await window.electronAPI.pathExists(asset.path);
        if (!exists) return;
      }

      if (asset.type === 'image' || asset.type === 'video') {
        const thumbnail = await getThumbnail(asset.path, asset.type, { profile: 'asset-grid' });
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

    // In drawer mode, hide linked-only non-audio assets (e.g. LipSync generated images).
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
          const cutAssetId = cut.asset?.id || cut.assetId;
          if (cutAssetId && idSet.has(cutAssetId)) {
            return { scene, cut, index: idx };
          }
        }
      }
    }

    for (const scene of scenes) {
      const idx = scene.cuts.findIndex((c) => {
        const cutAssetId = c.asset?.id || c.assetId;
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
    if (!match) {
      if (asset.usageCount === 0) {
        setUnusedContextMenu({ x: e.clientX, y: e.clientY, asset });
      }
      return;
    }

    selectCut(match.cut.id);
    setUnusedContextMenu(null);
    setCutContextMenu({
      x: e.clientX,
      y: e.clientY,
      sceneId: match.scene.id,
      cutId: match.cut.id,
      index: match.index,
      isClip: !!match.cut.isClip,
    });
  };

  const handleCutMenuCopy = () => {
    copySelectedCuts();
    setCutContextMenu(null);
  };

  const handleCutMenuPaste = () => {
    if (!cutContextMenu) return;
    pasteCuts(cutContextMenu.sceneId, cutContextMenu.index + 1);
    setCutContextMenu(null);
  };

  const handleCutMenuDelete = async () => {
    const selectedCuts = getSelectedCuts();
    for (const { scene, cut } of selectedCuts) {
      try {
        await executeCommand(new RemoveCutCommand(scene.id, cut.id));
      } catch (error) {
        toast.error('Delete failed', String(error));
        break;
      }
    }
    setCutContextMenu(null);
  };

  const handleCutMenuMove = async (targetSceneId: string) => {
    const cutIds = getSelectedCutIds();
    const targetScene = scenes.find((scene) => scene.id === targetSceneId);
    if (!targetScene || cutIds.length === 0) {
      setCutContextMenu(null);
      return;
    }
    try {
      await executeCommand(new MoveCutsToSceneCommand(cutIds, targetSceneId, targetScene.cuts.length));
    } catch (error) {
      toast.error('Move failed', String(error));
    }
    setCutContextMenu(null);
  };

  const handleCutMenuFinalizeClip = async (reverseOutput: boolean) => {
    if (!cutContextMenu) return;
    const { sceneId, cutId } = cutContextMenu;
    const scene = scenes.find((s) => s.id === sceneId);
    const cut = scene?.cuts.find((c) => c.id === cutId);
    const asset = cut?.asset || (cut?.assetId ? getAsset(cut.assetId) : undefined);

    if (!cut?.isClip || cut.inPoint === undefined || cut.outPoint === undefined || !asset?.path) {
      setCutContextMenu(null);
      return;
    }

    if (reverseOutput) {
      const proceed = await dialogConfirm({
        title: 'Reverse Clip',
        message: 'Reverse export is memory intensive and may temporarily pause the app.',
        variant: 'warning',
        confirmLabel: 'Continue',
      });
      if (!proceed) {
        setCutContextMenu(null);
        return;
      }
    }

    try {
      const result = await finalizeClipFromContext({
        sceneId,
        sourceCutId: cutId,
        insertIndex: cutContextMenu.index + 1,
        cut,
        asset,
        reverseOutput,
        vaultPath,
        createCutFromImport,
        getCutGroup,
        updateGroupCutOrder,
      });

      if (result.success) {
        const sizeText = result.fileSize ? `${(result.fileSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size';
        toast.success('Clip exported', `${result.fileName} (${sizeText})`);
      } else if (result.reason === 'missing-vault') {
        toast.warning('Vault path not set', 'Please set up a vault first.');
      } else {
        toast.error('Finalize Clip failed', result.error || 'Unknown error');
      }
    } catch (error) {
      toast.error('Finalize Clip failed', String(error));
    }

    setCutContextMenu(null);
  };

  const handleCutMenuFinalizeClipNormal = () => handleCutMenuFinalizeClip(false);
  const handleCutMenuReverseClip = () => handleCutMenuFinalizeClip(true);

  const handleDeleteUnusedAsset = async () => {
    if (!unusedContextMenu) return;
    if (!window.electronAPI?.vaultGateway) {
      toast.error('Delete failed', 'electronAPI not available. Please restart the app.');
      setUnusedContextMenu(null);
      return;
    }

    const asset = unusedContextMenu.asset;

    const confirmed = await dialogConfirm({
      title: 'Delete Asset',
      message: 'Move this unused asset to trash?',
      targetName: asset.sourceName,
      variant: 'danger',
      confirmLabel: 'Move to Trash',
      cancelLabel: 'Cancel',
    });

    if (!confirmed) {
      setUnusedContextMenu(null);
      return;
    }

    const assetIds = asset.linkedAssetIds.length ? asset.linkedAssetIds : [asset.id];
    const blockingRefs = getBlockingRefsForAssetIds(assetRefs, assetIds);
    if (blockingRefs.length > 0) {
      const firstKind = blockingRefs[0]?.kind || 'unknown';
      await dialogAlert({
        title: 'Cannot Delete Asset',
        message: `This asset is still referenced (${firstKind}).`,
        variant: 'warning',
      });
      setUnusedContextMenu(null);
      return;
    }

    try {
      const result = await deleteAssetWithPolicy({
        assetPath: asset.path,
        assetIds,
        reason: 'asset-panel-delete',
      });
      if (!result.success) {
        if (result.reason === 'asset-in-use') {
          const firstKind = result.blockingRefs?.[0]?.kind || 'unknown';
          await dialogAlert({
            title: 'Cannot Delete Asset',
            message: `This asset is still referenced (${firstKind}).`,
            variant: 'warning',
          });
        } else {
          toast.error('Delete failed', 'Failed to move asset to trash.');
        }
        setUnusedContextMenu(null);
        return;
      }
    } catch (error) {
      toast.error('Delete failed', String(error));
    }

    setAssets((prev) => prev.filter((a) => a.path !== asset.path));
    removeThumbnailCache(asset.path);
    toast.success('Asset moved to trash', asset.sourceName);
    setUnusedContextMenu(null);
  };

  // Handle drag start - close drawer when leaving
  const handleDragStart = (e: React.DragEvent, asset: AssetInfo) => {
    if (!effectiveEnableDragDrop || asset.type === 'audio') {
      e.preventDefault();
      return;
    }
    const dragAsset: Asset = {
      id: uuidv4(),
      name: asset.sourceName, // Use source name
      path: asset.path,
      type: asset.type,
      thumbnail: getCachedThumbnail(asset.path, { profile: 'asset-grid' }) || asset.thumbnail,
      originalPath: asset.path,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragAsset));
    e.dataTransfer.setData('text/scene-deck-asset', '1');
    e.dataTransfer.effectAllowed = 'copy';
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
    const targetSceneId = selectedSceneId || scenes[0]?.id;
    if (!targetSceneId) return;

    const assetId = uuidv4();
    try {
      await createCutFromImport(targetSceneId, {
        assetId,
        name: asset.sourceName, // Use source name
        sourcePath: asset.path,
        type: asset.type,
        preferredThumbnail: getCachedThumbnail(asset.path, { profile: 'asset-grid' }) || asset.thumbnail,
      });
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
            <button className="asset-panel-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
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
                  {bulkImportProgress.isActive ? (
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
                      disabled={bulkImportProgress.isActive}
                    >
                      <FolderOpen size={14} />
                      {bulkImportProgress.isActive
                        ? `Importing ${bulkImportProgress.current}/${bulkImportProgress.total}...`
                        : 'Import Folder...'}
                    </button>
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        loadAssets();
                      }}
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
                thumbnail={getCachedThumbnail(asset.path, { profile: 'asset-grid' }) || asset.thumbnail}
                isSelected={selectedAsset?.id === asset.id}
                onLoadThumbnail={() => loadThumbnail(asset)}
                onDragStart={effectiveEnableDragDrop ? (e) => handleDragStart(e, asset) : undefined}
                onClick={() => handleAssetClick(asset)}
                onDoubleClick={() => handleDoubleClick(asset)}
                onContextMenu={effectiveEnableContextMenu ? (e) => handleAssetContextMenu(e, asset) : undefined}
                draggable={effectiveEnableDragDrop && asset.type !== 'audio'}
              />
            ))
          )}
        </div>

        {/* Footer (modal mode) */}
        {(effectiveShowConfirmButton || effectiveShowImportButton) && (
          <div className="asset-panel-footer">
            {effectiveShowImportButton && onImportExternal && (
              <button className="asset-panel-import-btn" onClick={onImportExternal}>
                <Download size={16} />
                <span>Import from File</span>
              </button>
            )}
            {effectiveShowConfirmButton && (
              <button
                className="asset-panel-confirm-btn"
                onClick={handleConfirm}
                disabled={!selectedAsset}
              >
                <Check size={16} />
                <span>Select</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Context Menus (drawer mode only) */}
      {effectiveEnableContextMenu && cutContextMenu && (
        <CutContextMenu
          position={{ x: cutContextMenu.x, y: cutContextMenu.y }}
          isMultiSelect={selectedCutIds.size > 1}
          selectedCount={selectedCutIds.size}
          scenes={scenes}
          currentSceneId={cutContextMenu.sceneId}
          canPaste={canPaste()}
          isClip={cutContextMenu.isClip}
          isInGroup={false}
          onClose={() => setCutContextMenu(null)}
          onCopy={handleCutMenuCopy}
          onPaste={handleCutMenuPaste}
          onDelete={handleCutMenuDelete}
          onMoveToScene={handleCutMenuMove}
          onFinalizeClip={handleCutMenuFinalizeClipNormal}
          onReverseClip={handleCutMenuReverseClip}
        />
      )}

      {effectiveEnableContextMenu && unusedContextMenu && (
        <AssetContextMenu
          position={{ x: unusedContextMenu.x, y: unusedContextMenu.y }}
          onClose={() => setUnusedContextMenu(null)}
          onDelete={handleDeleteUnusedAsset}
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
          <img src={thumbnail} alt={asset.sourceName} />
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
