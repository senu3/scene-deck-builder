import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Star,
  Image,
  Film,
  RefreshCw,
  X,
  List,
  Grid,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { FileItem, Asset } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { getCachedThumbnail, getThumbnail } from '../utils/thumbnailCache';
import { getCuttableMediaType } from '../utils/mediaType';
import { getFirstSceneId } from '../utils/sceneOrder';
import './Sidebar.css';

export default function Sidebar() {
  const {
    sourceFolders,
    addSourceFolder,
    removeSourceFolder,
    updateSourceFolder,
    expandedFolders,
    toggleFolderExpanded,
    favorites,
    addFavorite,
    removeFavorite,
    sourceViewMode,
    setSourceViewMode,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [thumbnailVersion, setThumbnailVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderPath?: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const handleSelectFolder = async () => {
    if (!window.electronAPI) {
      alert('File system access is only available in the desktop app.');
      // For demo purposes, create a mock structure
      addSourceFolder({
        path: '/demo-' + Date.now(),
        name: 'demo_folder',
        structure: [
          {
            name: 'landscapes',
            path: '/demo/landscapes',
            isDirectory: true,
            children: [],
          },
          {
            name: 'characters',
            path: '/demo/characters',
            isDirectory: true,
            children: [],
          },
        ],
      });
      return;
    }

    const result = await window.electronAPI.selectFolder();
    if (result) {
      addSourceFolder(result);
    }
  };

  const handleRefreshFolder = async (folderPath: string) => {
    if (!window.electronAPI) return;
    const structure = await window.electronAPI.getFolderContents(folderPath);
    updateSourceFolder(folderPath, structure);
  };

  const handleRefreshAll = async () => {
    for (const folder of sourceFolders) {
      await handleRefreshFolder(folder.path);
    }
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, folderPath?: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, folderPath });
  };

  const handleRemoveFolder = (path: string) => {
    removeSourceFolder(path);
    setContextMenu(null);
  };

  // Handle folder drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    // Check if a folder is being dragged (from OS)
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          // In Electron, we can get the path from the file
          const file = item.getAsFile();
          const path = (file as File & { path?: string })?.path;
          if (path && window.electronAPI) {
            const structure = await window.electronAPI.getFolderContents(path);
            addSourceFolder({
              path,
              name: entry.name,
              structure,
            });
          }
        }
      }
    }
  };

  const loadThumbnail = useCallback(async (filePath: string, mediaType: 'image' | 'video' | null) => {
    const cached = getCachedThumbnail(filePath, { profile: 'asset-grid' });
    if (cached) return cached;
    if (!mediaType) return null;
    try {
      const thumbnail = await getThumbnail(filePath, mediaType, { profile: 'asset-grid' });
      if (thumbnail) {
        setThumbnailVersion((v) => v + 1);
        return thumbnail;
      }
    } catch (error) {
      console.error('Failed to load thumbnail:', error);
    }
    return null;
  }, []);

  const isFavorite = (path: string) => favorites.some(f => f.path === path);

  const toggleFavorite = (path: string, name: string) => {
    if (isFavorite(path)) {
      removeFavorite(path);
    } else {
      addFavorite({ path, name });
    }
  };

  const filterItems = (items: FileItem[]): FileItem[] => {
    if (!searchQuery) return items;

    return items.reduce<FileItem[]>((acc, item) => {
      if (item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        acc.push(item);
      } else if (item.isDirectory && item.children) {
        const filteredChildren = filterItems(item.children);
        if (filteredChildren.length > 0) {
          acc.push({ ...item, children: filteredChildren });
        }
      }
      return acc;
    }, []);
  };

  const renderFileItem = (item: FileItem, depth: number = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const mediaType = getCuttableMediaType(item.name);

    if (item.isDirectory) {
      return (
        <div key={item.path} className="folder-item">
          <div
            className="folder-header"
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => toggleFolderExpanded(item.path)}
          >
            <span className="folder-chevron">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            {isExpanded ? (
              <FolderOpen size={16} className="folder-icon open" />
            ) : (
              <Folder size={16} className="folder-icon" />
            )}
            <span className="folder-name truncate">{item.name}</span>
            <button
              className={`favorite-btn ${isFavorite(item.path) ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(item.path, item.name);
              }}
            >
              <Star size={12} />
            </button>
          </div>
          {isExpanded && item.children && (
            <div className={`folder-children ${sourceViewMode === 'grid' ? 'grid-view' : ''}`}>
              {item.children.map(child => renderFileItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <FileItemComponent
        key={item.path}
        item={item}
        depth={depth}
        mediaType={mediaType}
        loadThumbnail={loadThumbnail}
        thumbnailVersion={thumbnailVersion}
        viewMode={sourceViewMode}
      />
    );
  };

  return (
    <aside
      className={`sidebar ${isDragOver ? 'drag-over' : ''}`}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      <div className="sidebar-header">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div
        className="sidebar-section source-section"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="section-header">
          <span>Source</span>
          <div className="section-actions">
            <button
              className={`action-btn ${sourceViewMode === 'list' ? 'active' : ''}`}
              onClick={() => setSourceViewMode('list')}
              title="List View"
            >
              <List size={16} />
            </button>
            <button
              className={`action-btn ${sourceViewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setSourceViewMode('grid')}
              title="Grid View"
            >
              <Grid size={16} />
            </button>
            <button className="action-btn" onClick={handleRefreshAll} title="Refresh All">
              <RefreshCw size={16} />
            </button>
            <button className="action-btn" onClick={handleSelectFolder} title="Add Folder">
              <FolderPlus size={16} />
            </button>
          </div>
        </div>

        {sourceFolders.length > 0 ? (
          <div className="folder-tree">
            {sourceFolders.map((sourceFolder) => {
              const displayItems = filterItems(sourceFolder.structure);
              return (
                <div key={sourceFolder.path} className="source-folder-container">
                  <div
                    className="folder-header root"
                    onClick={() => toggleFolderExpanded(sourceFolder.path)}
                    onContextMenu={(e) => handleContextMenu(e, sourceFolder.path)}
                  >
                    <span className="folder-chevron">
                      {expandedFolders.has(sourceFolder.path) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </span>
                    <Folder size={16} className="folder-icon" />
                    <span className="folder-name truncate">{sourceFolder.name}</span>
                    <button
                      className="folder-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFolder(sourceFolder.path);
                      }}
                      title="Remove folder"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {expandedFolders.has(sourceFolder.path) && (
                    <div className={`folder-children ${sourceViewMode === 'grid' ? 'grid-view' : ''}`}>
                      {displayItems.map(item => renderFileItem(item))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`empty-state ${isDragOver ? 'drag-over' : ''}`}>
            <FolderPlus size={32} className="empty-icon" />
            <p>No folder added</p>
            <p className="empty-hint">Click + or drop folder here</p>
            <button className="select-folder-btn" onClick={handleSelectFolder}>
              Add Folder
            </button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={handleSelectFolder}>
            <FolderPlus size={14} />
            Add Folder
          </button>
          {contextMenu.folderPath && (
            <>
              <button onClick={() => handleRefreshFolder(contextMenu.folderPath!)}>
                <RefreshCw size={14} />
                Refresh
              </button>
              <button
                className="danger"
                onClick={() => handleRemoveFolder(contextMenu.folderPath!)}
              >
                <X size={14} />
                Remove
              </button>
            </>
          )}
        </div>
      )}

      {favorites.length > 0 && (
        <div className="sidebar-section">
          <div className="section-header">
            <span>Favorites</span>
          </div>
          <div className="favorites-list">
            {favorites.map(fav => (
              <div key={fav.path} className="favorite-item">
                <Star size={14} className="favorite-star" />
                <span className="favorite-name truncate">{fav.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

interface FileItemComponentProps {
  item: FileItem;
  depth: number;
  mediaType: 'image' | 'video' | null;
  loadThumbnail: (path: string, mediaType: 'image' | 'video' | null) => Promise<string | null | undefined>;
  thumbnailVersion: number;
  viewMode: 'list' | 'grid';
}

function FileItemComponent({ item, depth, mediaType, loadThumbnail, thumbnailVersion, viewMode }: FileItemComponentProps) {
  const { scenes, sceneOrder, selectedSceneId, createCutFromImport } = useStore();
  const [thumbnail, setThumbnail] = useState<string | null>(
    getCachedThumbnail(item.path, { profile: 'asset-grid' }) || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Auto-load thumbnail when component mounts (if not already cached)
  useEffect(() => {
    const cached = getCachedThumbnail(item.path, { profile: 'asset-grid' });
    if (cached) {
      setThumbnail(cached);
      return;
    }
    if (!thumbnail && !isLoading && mediaType) {
      const loadThumbnailAsync = async () => {
        setIsLoading(true);
        const result = await loadThumbnail(item.path, mediaType);
        if (result) {
          setThumbnail(result);
        }
        setIsLoading(false);
      };
      loadThumbnailAsync();
    }
  }, [item.path, mediaType, thumbnail, isLoading, loadThumbnail, thumbnailVersion]);

  const handleLoadThumbnail = async () => {
    if (thumbnail || isLoading) return;
    setIsLoading(true);
    const result = await loadThumbnail(item.path, mediaType);
    if (result) {
      setThumbnail(result);
    }
    setIsLoading(false);
  };

  const handleAddToTimeline = async () => {
    const targetSceneId = selectedSceneId || getFirstSceneId(scenes, sceneOrder);
    if (!targetSceneId) return;
    if (isImporting) return;

    setIsImporting(true);
    const assetId = uuidv4();
    const sourceType = mediaType || 'image';

    createCutFromImport(targetSceneId, {
      assetId,
      name: item.name,
      sourcePath: item.path,
      type: sourceType,
      preferredThumbnail: thumbnail || undefined,
    })
      .catch(() => {})
      .finally(() => {
        setIsImporting(false);
      });
  };

  const handleDragStart = async (e: React.DragEvent) => {
    const assetId = uuidv4();

    // Create basic asset for drag data
    // The actual import will happen on drop
    const asset: Asset = {
      id: assetId,
      name: item.name,
      path: item.path,
      type: mediaType || 'image',
      thumbnail: thumbnail || undefined,
      // Mark as pending import
      originalPath: item.path,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  if (viewMode === 'grid') {
    return (
      <div
        className="file-item-grid"
        draggable
        onDragStart={handleDragStart}
        onMouseEnter={handleLoadThumbnail}
        onDoubleClick={handleAddToTimeline}
        title={item.name}
      >
        <div className="grid-thumbnail-container">
          {thumbnail ? (
            <img src={thumbnail} alt={item.name} className="grid-thumbnail" />
          ) : (
            <div className="grid-thumbnail placeholder">
              {isLoading ? '...' : mediaType === 'video' ? <Film size={24} /> : <Image size={24} />}
            </div>
          )}
          {mediaType === 'video' && (
            <div className="grid-video-badge">
              <Film size={10} />
            </div>
          )}
        </div>
        <span className="grid-file-name">{item.name}</span>
      </div>
    );
  }

  return (
    <div
      className="file-item"
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={handleLoadThumbnail}
      onDoubleClick={handleAddToTimeline}
    >
      <div className="file-icon">
        {mediaType === 'video' ? (
          <Film size={16} />
        ) : (
          <Image size={16} />
        )}
      </div>
      {thumbnail ? (
        <img src={thumbnail} alt={item.name} className="file-thumbnail" />
      ) : (
        <div className="file-thumbnail placeholder">
          {isLoading ? '...' : ''}
        </div>
      )}
      <span className="file-name truncate">{item.name}</span>
    </div>
  );
}
