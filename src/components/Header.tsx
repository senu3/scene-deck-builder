import { useMemo, useState, useRef, useEffect } from 'react';
import { Clapperboard, FolderOpen, Save, MoreVertical, Undo, Redo, X, Play, Download, Clock, Layers, Film, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/historyStore';
import { Input } from '../ui';
import { getDurationTargetSettings, resolveEffectiveTargetDurationSec } from '../utils/durationTarget';
import { getScenesInOrder } from '../utils/sceneOrder';
import MissingAssetRecoveryModal from './MissingAssetRecoveryModal';
import { useHeaderProjectController } from '../hooks/useHeaderProjectController';
import { formatTimeCode } from '../hooks/useStoryTimelinePosition';
import DurationTargetGauge from './DurationTargetGauge';
import SceneDurationBar from './SceneDurationBar';
import './Header.css';

interface HeaderProps {
  onOpenSettings?: () => void;
  onPreview?: () => void;
  onExport?: () => void;
  isExporting?: boolean;
}

export default function Header({ onOpenSettings, onPreview, onExport, isExporting }: HeaderProps) {
  const { projectName, scenes, sceneOrder, selectedSceneId, selectedCutId, selectScene, targetTotalDurationSec, setTargetTotalDurationSec } = useStore();
  const orderedScenes = getScenesInOrder(scenes, sceneOrder);
  const { undo, redo, canUndo, canRedo, getUndoPreview } = useHistoryStore();
  const {
    handleSaveProject,
    handleCloseProject,
    handleCloseApp,
    showRecoveryDialog,
    missingAssets,
    pendingProject,
    pendingAssessment,
    handleRecoveryComplete,
    handleRecoveryCancel,
  } = useHeaderProjectController();

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [targetMinutesInput, setTargetMinutesInput] = useState('');
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Project stats
  const { totalDuration, totalCuts, selectedCutTime } = useMemo(() => {
    let duration = 0;
    let cuts = 0;
    let cutTime: number | null = null;
    let elapsed = 0;

    for (const scene of orderedScenes) {
      for (const cut of scene.cuts) {
        const dt = isFinite(cut.displayTime) ? cut.displayTime : 0;
        if (selectedCutId && cut.id === selectedCutId && cutTime === null) {
          cutTime = elapsed;
        }
        elapsed += dt;
        duration += dt;
        cuts++;
      }
    }

    return {
      totalDuration: duration,
      totalCuts: cuts,
      selectedCutTime: selectedCutId ? cutTime : null,
    };
  }, [orderedScenes, selectedCutId]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const minutes = Number.isFinite(targetTotalDurationSec) && (targetTotalDurationSec as number) > 0
      ? Math.round((targetTotalDurationSec as number) / 60)
      : 0;
    setTargetMinutesInput(String(minutes));
  }, [showMoreMenu, targetTotalDurationSec]);

  const effectiveTargetSec = useMemo(() => {
    const settings = getDurationTargetSettings();
    return resolveEffectiveTargetDurationSec(targetTotalDurationSec, settings.envDefaultTargetSec);
  }, [targetTotalDurationSec]);

  const handleUndo = async () => {
    try {
      const preview = getUndoPreview();
      if (preview) {
        const confirmMessages: Record<string, string> = {
          ADD_SCENE: 'Undo すると追加したシーンが削除されます。続行しますか？',
          DUPLICATE_SCENE: 'Undo すると複製したシーンが削除されます。続行しますか？',
          REMOVE_SCENE: 'Undo すると削除したシーンを復元します。続行しますか？',
          REMOVE_CUT: 'Undo すると削除したカットを復元します。続行しますか？',
        };
        const message = confirmMessages[preview.type];
        if (message && !confirm(message)) {
          return;
        }
      }
      await undo();
    } catch (error) {
      console.error('Undo failed:', error);
    }
    setShowMoreMenu(false);
  };

  const handleRedo = async () => {
    try {
      await redo();
    } catch (error) {
      console.error('Redo failed:', error);
    }
    setShowMoreMenu(false);
  };

  const handleApplyTargetMinutes = () => {
    const parsed = Number(targetMinutesInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTargetTotalDurationSec(undefined);
      return;
    }
    setTargetTotalDurationSec(Math.round(parsed * 60));
  };

  return (
    <>
      <header className="header">
        <div className="header-main">
          <div className="header-left">
            <div className="header-logo">
              <Clapperboard size={22} className="logo-icon" />
              <div className="header-title-group">
                <span className="logo-text">AI Scene Manager</span>
                <span className="project-subtitle">{projectName}</span>
              </div>
            </div>
          </div>

          <div className="header-right">
            {/* Project Stats */}
            <div className="header-stats">
              <div className="header-stat">
                <Layers size={14} />
                <span className="header-stat-value">{scenes.length}</span>
                <span>scenes</span>
              </div>
              <div className="header-stat">
                <Film size={14} />
                <span className="header-stat-value">{totalCuts}</span>
                <span>cuts</span>
              </div>
              <div className="header-stat header-stat-time">
                <Clock size={14} />
                <span className="header-time-current">
                  {selectedCutTime !== null ? formatTimeCode(selectedCutTime) : '--'}
                </span>
                <span className="header-time-sep">/</span>
                <span className="header-time-total">{formatTimeCode(totalDuration)}</span>
              </div>
              <DurationTargetGauge totalSec={totalDuration} targetSec={effectiveTargetSec} />
            </div>

            {/* Preview Button */}
            <button
              className="header-btn header-btn-pill header-btn-preview"
              onClick={onPreview}
              title="Preview (Space)"
            >
              <Play size={16} />
              <span>Preview</span>
            </button>

            {/* More Menu */}
            <div className="header-more-container" ref={moreMenuRef}>
              <button
                className="header-btn"
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                title="More options"
              >
                <MoreVertical size={18} />
              </button>

              {showMoreMenu && (
                <div className="header-more-menu">
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo()}
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo size={16} />
                    <span>Undo</span>
                    <span className="menu-shortcut">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo()}
                    title="Redo (Ctrl+Shift+Z)"
                  >
                    <Redo size={16} />
                    <span>Redo</span>
                    <span className="menu-shortcut">Ctrl+Shift+Z</span>
                  </button>

                  <div className="menu-divider" />

                  <button onClick={() => { handleSaveProject(); setShowMoreMenu(false); }} title="Save Project">
                    <Save size={16} />
                    <span>Save Project</span>
                    <span className="menu-shortcut">Ctrl+S</span>
                  </button>
                  <button onClick={() => { onExport?.(); setShowMoreMenu(false); }} disabled={isExporting} title="Export">
                    <Download size={16} />
                    <span>{isExporting ? 'Exporting...' : 'Export'}</span>
                  </button>
                  <button onClick={() => { handleCloseProject(); setShowMoreMenu(false); }} title="Open Project">
                    <FolderOpen size={16} />
                    <span>Open Project</span>
                  </button>
                  <div className="menu-divider" />
                  <button onClick={() => { onOpenSettings?.(); setShowMoreMenu(false); }} title="Settings">
                    <Settings size={16} />
                    <span>Environment Settings</span>
                  </button>

                  <div className="menu-divider" />

                  <div className="header-menu-input">
                    <span className="header-menu-input-label">Target (min)</span>
                    <div className="header-menu-input-row">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={targetMinutesInput}
                        onChange={(e) => setTargetMinutesInput(e.target.value)}
                        onBlur={handleApplyTargetMinutes}
                        className="header-menu-number"
                        title="Set project target duration in minutes"
                      />
                      <button type="button" onClick={handleApplyTargetMinutes}>Set</button>
                    </div>
                  </div>

                  <div className="menu-divider" />

                  <button onClick={() => { handleCloseApp(); setShowMoreMenu(false); }} className="danger" title="Close App">
                    <X size={16} />
                    <span>Close</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="header-timeline">
          <SceneDurationBar
            scenes={orderedScenes}
            selectedSceneId={selectedSceneId}
            onSelectScene={selectScene}
            targetSec={effectiveTargetSec}
          />
        </div>
      </header>

      {/* Missing Asset Recovery Dialog */}
      {showRecoveryDialog && pendingProject && pendingAssessment && (
        <MissingAssetRecoveryModal
          missingAssets={missingAssets}
          assessment={pendingAssessment}
          vaultPath={pendingProject.vaultPath}
          onComplete={handleRecoveryComplete}
          onCancel={handleRecoveryCancel}
        />
      )}
    </>
  );
}
