import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, useEffect } from 'react';
import { Layers, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { CutGroup, Cut } from '../types';
import CutCard from './CutCard';
import './CutGroupCard.css';
import { getAssetThumbnail } from '../features/thumbnails/api';

interface CutGroupCardProps {
  group: CutGroup;
  cuts: Cut[];
  sceneId: string;
  index: number;
  isDragging: boolean;
  cropBaseResolution: { name: string; width: number; height: number };
}

export default function CutGroupCard({ group, cuts, sceneId, index, isDragging, cropBaseResolution }: CutGroupCardProps) {
  const {
    selectedGroupId,
    selectGroup,
    toggleGroupCollapsed,
    getAsset,
  } = useStore();

  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const isSelected = selectedGroupId === group.id;
  const isCollapsed = group.isCollapsed;

  // Get first cut for thumbnail
  const firstCut = cuts[0];
  const firstAsset = firstCut?.asset || (firstCut?.assetId ? getAsset(firstCut.assetId) : undefined);

  // Calculate total duration
  const totalDuration = cuts.reduce((sum, cut) => sum + cut.displayTime, 0);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: `group-${group.id}`,
    data: {
      type: 'group',
      sceneId,
      index,
      groupId: group.id,
      cutIds: group.cutIds,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Load thumbnail from first cut
  useEffect(() => {
    const loadThumbnail = async () => {
      if (firstAsset?.thumbnail) {
        setThumbnail(firstAsset.thumbnail);
        return;
      }

      if (firstAsset?.path && (firstAsset.type === 'image' || firstAsset.type === 'video')) {
        try {
          const thumbnail = await getAssetThumbnail('timeline-card', {
            assetId: firstAsset.id,
            path: firstAsset.path,
            type: firstAsset.type,
          });
          if (thumbnail) {
            setThumbnail(thumbnail);
          }
        } catch {
          // Failed to load thumbnail
        }
      }
    };

    loadThumbnail();
  }, [firstAsset]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectGroup(group.id);
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleGroupCollapsed(sceneId, group.id);
  };

  // Collapsed view - stacked card with thumbnail
  if (isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`cut-group-card collapsed cut-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
        onClick={handleClick}
      >
        <div className="group-stack">
          <div className="group-thumbnail-container">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={group.name}
                className="group-thumbnail"
              />
            ) : (
              <div className="group-thumbnail placeholder">
                <Layers size={24} />
              </div>
            )}

            {/* Expand button */}
            <button
              className="group-toggle"
              onClick={handleToggleCollapse}
              title="Expand group"
            >
              <ChevronRight size={16} />
            </button>

            {/* Cut count badge */}
            <div className="group-badge">
              <Layers size={12} />
              <span>{cuts.length}</span>
            </div>

            {/* Duration */}
            <div className="group-duration">
              <Clock size={10} />
              <span>{totalDuration.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Expanded view - container with individual cut cards
  return (
    <div
      className={`expanded-group-container ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      <div className="expanded-group-header">
        <div className="expanded-group-title">
          <Layers size={14} />
          <span>{group.name}</span>
          <span>({cuts.length} cuts)</span>
        </div>
        <div className="expanded-group-actions">
          <button
            onClick={handleToggleCollapse}
            title="Collapse group"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      <div className="expanded-group-cuts">
        {cuts.map((cut, index) => (
          <CutCard
            key={cut.id}
            cut={cut}
            sceneId={sceneId}
            index={index}
            isDragging={false}
            cropBaseResolution={cropBaseResolution}
          />
        ))}
      </div>
    </div>
  );
}

// Helper component for rendering expanded group with drag-drop
interface ExpandedGroupContainerProps {
  group: CutGroup;
  sceneId: string;
  isSelected: boolean;
  onSelect: () => void;
  onToggleCollapse: () => void;
  children: React.ReactNode;
}

export function ExpandedGroupContainer({
  group,
  sceneId: _sceneId,
  isSelected,
  onSelect,
  onToggleCollapse,
  children,
}: ExpandedGroupContainerProps) {
  return (
    <div
      className={`expanded-group-container ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="expanded-group-header">
        <div className="expanded-group-title">
          <Layers size={14} />
          <span>{group.name}</span>
        </div>
        <div className="expanded-group-actions">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            title="Collapse group"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      <div className="expanded-group-cuts">
        {children}
      </div>
    </div>
  );
}
