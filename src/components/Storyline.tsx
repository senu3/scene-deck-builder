import { useDroppable, useDndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, MoreHorizontal, Edit2, Trash2, Play, Download, Clapperboard } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  selectScenes,
  selectSceneOrder,
  selectSelectedSceneId,
  selectSelectScene,
  selectVaultPath,
  selectCreateCutFromImport,
  selectCloseDetailsPanel,
  selectSelectedGroupId,
  selectSelectGroup,
  selectToggleGroupCollapsed,
} from '../store/selectors';
import { getScenesInOrder } from '../utils/sceneOrder';
import { useHistoryStore } from '../store/historyStore';
import { AddSceneCommand, RemoveSceneCommand, RenameSceneCommand } from '../store/commands';
import CutCard from './CutCard';
import CutGroupCard, { ExpandedGroupContainer } from './CutGroupCard';
import type { Asset, CutGroup, Cut } from '../types';
import { useStorylineDragController, type PlaceholderState } from '../hooks/useStorylineDragController';
import { useStorylinePanTool } from '../hooks/useStorylinePanTool';
import './Storyline.css';

// Scene color palette - uses --timeline-scene-* tokens to match SceneDurationBar
const SCENE_COLORS = [
  'var(--timeline-scene-1)',  // cyan
  'var(--timeline-scene-2)',  // blue
  'var(--timeline-scene-3)',  // purple
  'var(--timeline-scene-4)',  // pink
  'var(--timeline-scene-5)',  // green
];

const getSceneColor = (index: number) => SCENE_COLORS[index % SCENE_COLORS.length];

export type SceneEmptyStateVariant = 'primary' | 'secondary' | null;

export function getSceneEmptyStateVariant(
  cutCount: number,
  sceneIndex: number,
  areAllScenesEmpty: boolean
): SceneEmptyStateVariant {
  if (cutCount > 0) return null;
  if (areAllScenesEmpty && sceneIndex === 0) return 'primary';
  return 'secondary';
}

interface StorylineProps {
  activeId: string | null;
  activeType: 'cut' | 'scene' | null;
  cropBaseResolution: { name: string; width: number; height: number };
  onPreviewScene: (sceneId: string) => void;
  onExportScene: (sceneId: string) => void;
}

export default function Storyline({
  activeId,
  cropBaseResolution,
  onPreviewScene,
  onExportScene,
}: StorylineProps) {
  const scenes = useStore(selectScenes);
  const sceneOrder = useStore(selectSceneOrder);
  const orderedScenes = getScenesInOrder(scenes, sceneOrder);
  const areAllScenesEmpty = orderedScenes.every((scene) => scene.cuts.length === 0);
  const selectedSceneId = useStore(selectSelectedSceneId);
  const selectScene = useStore(selectSelectScene);
  const vaultPath = useStore(selectVaultPath);
  const createCutFromImport = useStore(selectCreateCutFromImport);
  const closeDetailsPanel = useStore(selectCloseDetailsPanel);
  const { executeCommand } = useHistoryStore();
  const storylineRef = useRef<HTMLDivElement>(null);
  const { isPanModeReady, isPanning, bind: panBind } = useStorylinePanTool(storylineRef);
  // --- DND: dnd-kit (reorder) ---
  const { active, over } = useDndContext();

  const handleBackgroundClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.cut-card')) return;
    if (target.closest('.scene-header')) return;
    if (target.closest('.scene-menu')) return;
    if (target.closest('.scene-menu-btn')) return;
    if (target.closest('.scene-name-input')) return;
    if (target.closest('.add-scene-btn')) return;
    selectScene(null);
  };

  const {
    placeholder,
    sourceSceneId,
    isOverDifferentScene,
    handleStorylineDragEnter,
    handleStorylineDragOver,
    handleStorylineDragLeave,
    handleInboundDrop,
  } = useStorylineDragController({
    scenes: orderedScenes,
    active,
    over,
    vaultPath,
    createCutFromImport,
    closeDetailsPanel,
    executeCommand,
  });

  useEffect(() => {
    if (!selectedSceneId || !storylineRef.current) return;
    const sceneElement = storylineRef.current.querySelector(
      `[data-scene-id="${selectedSceneId}"]`
    );
    if (sceneElement) {
      sceneElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedSceneId]);

  return (
    <div
      ref={storylineRef}
      className={[
        'storyline',
        isPanModeReady ? 'storyline--pan-ready storyline--pan-lock' : '',
        isPanning ? 'storyline--panning' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleBackgroundClick}
      onDragEnter={handleStorylineDragEnter}
      onDragOver={handleStorylineDragOver}
      onDragLeave={handleStorylineDragLeave}
      onDrop={handleInboundDrop}
      {...panBind}
    >
      <div className="storyline-content">
        {orderedScenes.map((scene, index) => (
          <SceneColumn
            key={scene.id}
            sceneId={scene.id}
            sceneName={scene.name}
            sceneIndex={index}
            cuts={scene.cuts}
            groups={scene.groups || []}
            isSelected={selectedSceneId === scene.id}
            onSelect={() => selectScene(scene.id)}
            activeId={activeId}
            cropBaseResolution={cropBaseResolution}
            placeholder={placeholder?.sceneId === scene.id ? placeholder : null}
            emptyStateVariant={getSceneEmptyStateVariant(scene.cuts.length, index, areAllScenesEmpty)}
            sourceSceneId={sourceSceneId}
            isOverDifferentScene={!!isOverDifferentScene}
            onPreviewScene={onPreviewScene}
            onExportScene={onExportScene}
          />
        ))}

        <button className="add-scene-btn" onClick={() => {
          const sceneName = `Scene ${orderedScenes.length + 1}`;
          executeCommand(new AddSceneCommand(sceneName)).catch((error) => {
            console.error('Failed to add scene:', error);
          });
        }}>
          <Plus size={24} />
          <span>Add Scene</span>
        </button>
      </div>
    </div>
  );
}

interface SceneColumnProps {
  sceneId: string;
  sceneName: string;
  sceneIndex: number;
  cuts: Array<{
    id: string;
    assetId: string;
    asset?: Asset;
    displayTime: number;
    order: number;
    isLipSync?: boolean;
    lipSyncFrameCount?: number;
  }>;
  groups: CutGroup[];
  isSelected: boolean;
  onSelect: () => void;
  activeId: string | null;
  cropBaseResolution: { name: string; width: number; height: number };
  placeholder: PlaceholderState | null;
  emptyStateVariant: SceneEmptyStateVariant;
  sourceSceneId?: string;
  isOverDifferentScene?: boolean;
  onPreviewScene: (sceneId: string) => void;
  onExportScene: (sceneId: string) => void;
}

function SceneColumn({
  sceneId,
  sceneName,
  sceneIndex,
  cuts,
  groups,
  isSelected,
  onSelect,
  activeId,
  cropBaseResolution,
  placeholder,
  emptyStateVariant,
  sourceSceneId,
  isOverDifferentScene,
  onPreviewScene,
  onExportScene,
}: SceneColumnProps) {
  const sceneColor = getSceneColor(sceneIndex);
  const scenes = useStore(selectScenes);
  const selectedGroupId = useStore(selectSelectedGroupId);
  const selectGroup = useStore(selectSelectGroup);
  const toggleGroupCollapsed = useStore(selectToggleGroupCollapsed);
  const { executeCommand } = useHistoryStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(sceneName);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cutsContainerRef = useRef<HTMLDivElement>(null);
  // Droppable for cuts
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `dropzone-${sceneId}`,
    data: {
      sceneId,
      type: 'dropzone',
      index: cuts.length,
    },
  });

  // Check if this is the source scene and a cut is being dragged to a different scene
  const isSourceScene = sourceSceneId === sceneId;
  const shouldHideDraggedCard = isSourceScene && isOverDifferentScene;
  const showEmptyState = cuts.length === 0 && !placeholder && emptyStateVariant !== null;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleRename = () => {
    if (editName.trim() && editName !== sceneName) {
      executeCommand(new RenameSceneCommand(sceneId, editName.trim())).catch((error) => {
        console.error('Failed to rename scene:', error);
      });
    } else {
      setEditName(sceneName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setEditName(sceneName);
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (scenes.length > 1 && confirm(`Delete "${sceneName}"? All cuts will be removed.`)) {
      executeCommand(new RemoveSceneCommand(sceneId)).catch((error) => {
        console.error('Failed to remove scene:', error);
      });
    }
    setShowMenu(false);
  };


  // Helper to find which group a cut belongs to
  const findGroupForCut = (cutId: string): CutGroup | undefined => {
    return groups.find(g => g.cutIds.includes(cutId));
  };

  // Build the list of items including placeholder and groups
  const renderItems = () => {
    const items: React.ReactNode[] = [];
    const renderedGroups = new Set<string>();

    const placeholderElement = placeholder ? (
      <div key="placeholder" className="cut-card placeholder-card">
        <div className="placeholder-content">
          <Plus size={20} />
        </div>
      </div>
    ) : null;

    if (showEmptyState && emptyStateVariant) {
      items.push(
        <SceneEmptyState
          key="empty-state"
          variant={emptyStateVariant}
        />
      );
      return items;
    }

    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      // Insert placeholder before this cut if needed
      if (placeholder && placeholder.insertIndex === i) {
        items.push(placeholderElement);
      }

      // Check if this cut belongs to a group
      const group = findGroupForCut(cut.id);

      if (group && !renderedGroups.has(group.id)) {
        // This is the first cut of a group we haven't rendered yet
        renderedGroups.add(group.id);

        // Get all cuts in this group (in group order)
        const groupCuts = group.cutIds
          .map(id => cuts.find(c => c.id === id))
          .filter((c): c is Cut => c !== undefined);

        if (group.isCollapsed) {
          // Render collapsed group card
          items.push(
            <CutGroupCard
              key={`group-${group.id}`}
              group={group}
              cuts={groupCuts}
              sceneId={sceneId}
              index={i}
              isDragging={activeId === `group-${group.id}`}
              cropBaseResolution={cropBaseResolution}
            />
          );
        } else {
          // Render expanded group container
          items.push(
            <ExpandedGroupContainer
              key={`group-${group.id}`}
              group={group}
              sceneId={sceneId}
              isSelected={selectedGroupId === group.id}
              onSelect={() => selectGroup(group.id)}
              onToggleCollapse={() => toggleGroupCollapsed(sceneId, group.id)}
            >
              {groupCuts.map((groupCut) => {
                const isHidden = shouldHideDraggedCard && activeId === groupCut.id;
                return (
                  <CutCard
                    key={groupCut.id}
                    cut={groupCut}
                    sceneId={sceneId}
                    index={cuts.findIndex(c => c.id === groupCut.id)}
                    isDragging={activeId === groupCut.id}
                    isHidden={isHidden}
                    cropBaseResolution={cropBaseResolution}
                  />
                );
              })}
            </ExpandedGroupContainer>
          );
        }
      } else if (!group) {
        // Regular cut not in any group
        const isHidden = shouldHideDraggedCard && activeId === cut.id;

        items.push(
          <CutCard
            key={cut.id}
            cut={cut}
            sceneId={sceneId}
            index={i}
            isDragging={activeId === cut.id}
            isHidden={isHidden}
            cropBaseResolution={cropBaseResolution}
          />
        );
      }
      // If cut is in a group that was already rendered, skip it
    }

    // Add placeholder at the end if needed
    if (placeholder && placeholder.insertIndex >= cuts.length) {
      items.push(placeholderElement);
    }

    return items;
  };

  // Combine refs for the cuts container
  const setCombinedRef = (node: HTMLDivElement | null) => {
    setDroppableRef(node);
    (cutsContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const buildSortableItems = () => {
    const items: string[] = [];
    const renderedGroups = new Set<string>();

    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      const group = findGroupForCut(cut.id);

      if (group && !renderedGroups.has(group.id)) {
        renderedGroups.add(group.id);

        if (group.isCollapsed) {
          items.push(`group-${group.id}`);
        } else {
          const groupCuts = group.cutIds
            .map(id => cuts.find(c => c.id === id))
            .filter((c): c is Cut => c !== undefined);
          items.push(...groupCuts.map(c => c.id));
        }
      } else if (!group) {
        items.push(cut.id);
      }
    }

    return items;
  };

  const sortableItems = buildSortableItems();

  return (
    <div
      className={`scene-column ${isSelected ? 'selected' : ''}`}
      data-scene-id={sceneId}
      style={{ '--scene-color': sceneColor } as React.CSSProperties}
    >
      <div
        className="scene-header"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <span className="scene-indicator" />

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="scene-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="scene-name">{sceneName.toUpperCase()}</span>
        )}

        <div className="scene-menu-container" ref={menuRef}>
          <button
            className="scene-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal size={16} />
          </button>

          {showMenu && (
            <div className="scene-menu">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPreviewScene(sceneId);
                  setShowMenu(false);
                }}
                disabled={cuts.length === 0}
              >
                <Play size={14} />
                Preview this Scene
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExportScene(sceneId);
                  setShowMenu(false);
                }}
                disabled={cuts.length === 0}
              >
                <Download size={14} />
                Export this Scene
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setShowMenu(false);
                }}
              >
                <Edit2 size={14} />
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="danger"
                disabled={scenes.length <= 1}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <SortableContext
        items={sortableItems}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setCombinedRef}
          className={[
            'scene-cuts',
            placeholder ? 'has-placeholder' : '',
            showEmptyState && emptyStateVariant === 'primary' ? 'scene-cuts--empty-primary' : '',
            showEmptyState && emptyStateVariant === 'secondary' ? 'scene-cuts--empty-secondary' : '',
          ].filter(Boolean).join(' ')}
        >
          {renderItems()}
        </div>
      </SortableContext>
    </div>
  );
}

interface SceneEmptyStateProps {
  variant: Exclude<SceneEmptyStateVariant, null>;
}

function SceneEmptyState({ variant }: SceneEmptyStateProps) {
  const isPrimary = variant === 'primary';

  return (
    <div className={`scene-empty-state scene-empty-state--${variant}`}>
      {isPrimary ? (
        <div className="scene-empty-state-icon">
          <Clapperboard size={18} />
        </div>
      ) : null}
      <p className="scene-empty-state-title">Drop image or video here</p>
      {isPrimary ? (
        <>
          <p className="scene-empty-state-subtitle">Create your first cut in this scene</p>
          <p className="scene-empty-state-note">From Assets, Source, or your computer</p>
        </>
      ) : null}
    </div>
  );
}
