import { useMemo, useState, useRef, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Clapperboard, ArrowLeft, Save, MoreVertical, Undo, Redo, X, Play, Download, Clock, Layers, Film, Settings, Flag } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/historyStore';
import { Input } from '../ui';
import { resolveProjectTargetDurationSec, saveDurationTargetSettings } from '../utils/durationTarget';
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
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [targetMinutesInput, setTargetMinutesInput] = useState('');
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const goalEditorRef = useRef<HTMLDivElement>(null);
  const hasProjectDurationGoal = Number.isFinite(targetTotalDurationSec) && (targetTotalDurationSec as number) > 0;

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
    if (!showGoalEditor) return;
    const minutes = hasProjectDurationGoal
      ? Math.round((targetTotalDurationSec as number) / 60)
      : 0;
    setTargetMinutesInput(minutes > 0 ? String(minutes) : '');
  }, [hasProjectDurationGoal, showGoalEditor, targetTotalDurationSec]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (goalEditorRef.current && !goalEditorRef.current.contains(e.target as Node)) {
        setShowGoalEditor(false);
      }
    };
    if (showGoalEditor) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGoalEditor]);

  const effectiveTargetSec = useMemo(() => {
    return resolveProjectTargetDurationSec(targetTotalDurationSec);
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
      setShowGoalEditor(false);
      return;
    }
    saveDurationTargetSettings({ sceneDurationBarMode: 'target' });
    setTargetTotalDurationSec(Math.round(parsed * 60));
    setShowGoalEditor(false);
  };

  const handleGoalInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleApplyTargetMinutes();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setShowGoalEditor(false);
    }
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
              <div className="header-goal" ref={goalEditorRef}>
                <button
                  type="button"
                  className={`header-goal-trigger ${showGoalEditor ? 'is-open' : ''}`}
                  onClick={() => setShowGoalEditor((current) => !current)}
                  aria-expanded={showGoalEditor}
                  aria-label={effectiveTargetSec ? 'Edit duration goal' : 'Set duration goal'}
                  title={effectiveTargetSec ? 'Edit duration goal' : 'Set duration goal'}
                >
                  <Flag size={14} />
                  <span className="header-goal-label">Duration Goal:</span>
                  <span className={`header-goal-value ${effectiveTargetSec ? '' : 'is-empty'}`}>
                    {effectiveTargetSec ? formatTimeCode(effectiveTargetSec) : 'Not set'}
                  </span>
                </button>

                {showGoalEditor && (
                  <div className="header-goal-popover">
                    <span className="header-goal-popover-label">Duration Goal (min)</span>
                    <div className="header-goal-popover-row">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={targetMinutesInput}
                        onChange={(e) => setTargetMinutesInput(e.target.value)}
                        onKeyDown={handleGoalInputKeyDown}
                        className="header-goal-number"
                        title="Set project duration goal in minutes"
                        autoFocus
                      />
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleApplyTargetMinutes}>
                        Set
                      </button>
                      {hasProjectDurationGoal && (
                        <button
                          type="button"
                          className="secondary"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTargetMinutesInput('');
                            setTargetTotalDurationSec(undefined);
                            setShowGoalEditor(false);
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
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
                  <button onClick={() => { handleCloseProject(); setShowMoreMenu(false); }} title="Close Project">
                    <ArrowLeft size={16} />
                    <span>Close Project</span>
                  </button>
                  <div className="menu-divider" />
                  <button onClick={() => { onOpenSettings?.(); setShowMoreMenu(false); }} title="Settings">
                    <Settings size={16} />
                    <span>Environment Settings</span>
                  </button>
                  <div className="menu-divider" />

                  <button onClick={() => { handleCloseApp(); setShowMoreMenu(false); }} className="danger" title="Exit App">
                    <X size={16} />
                    <span>Exit App</span>
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
