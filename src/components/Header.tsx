import { useMemo, useState, useRef, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Clapperboard, ArrowLeft, Save, MoreVertical, Undo, Redo, X, Play, Download, Clock, Layers, Film, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useHistoryStore } from '../store/historyStore';
import { Input } from '../ui';
import { resolveProjectTargetDurationSec, saveDurationTargetSettings } from '../utils/durationTarget';
import { getScenesInOrder } from '../utils/sceneOrder';
import MissingAssetRecoveryModal from './MissingAssetRecoveryModal';
import { useHeaderProjectController } from '../hooks/useHeaderProjectController';
import { formatTimeCode } from '../hooks/useStoryTimelinePosition';
import SceneDurationBar from './SceneDurationBar';
import './Header.css';

interface HeaderProps {
  onOpenSettings?: () => void;
  onPreview?: () => void;
  onExport?: () => void;
  isExporting?: boolean;
}

function formatGoalInputValue(totalSec?: number): string {
  if (!Number.isFinite(totalSec) || (totalSec as number) <= 0) {
    return '';
  }
  const safeTotalSec = Math.round(totalSec as number);
  const minutes = Math.floor(safeTotalSec / 60);
  const seconds = safeTotalSec % 60;
  if (minutes === 0) {
    return String(seconds);
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatGoalTimeCode(totalSec?: number): string {
  if (!Number.isFinite(totalSec) || (totalSec as number) <= 0) {
    return 'Not set';
  }
  const safeTotalSec = Math.round(totalSec as number);
  const minutes = Math.floor(safeTotalSec / 60);
  const seconds = safeTotalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parseGoalInputValue(rawValue: string): { totalSec?: number; error?: string } {
  const value = rawValue.trim();
  if (!value) {
    return { error: 'Enter seconds or m:ss' };
  }
  if (/^\d+$/.test(value)) {
    const totalSec = Number(value);
    if (!Number.isFinite(totalSec) || totalSec <= 0) {
      return { error: 'Enter a value above 0.' };
    }
    return { totalSec: Math.round(totalSec) };
  }

  const match = /^(\d+):(\d{1,2})$/.exec(value);
  if (!match) {
    return { error: 'Use seconds or m:ss' };
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds >= 60) {
    return { error: 'Seconds must be 00-59.' };
  }

  const totalSec = (minutes * 60) + seconds;
  if (totalSec <= 0) {
    return { error: 'Enter a value above 0.' };
  }
  return { totalSec };
}

export default function Header({ onOpenSettings, onPreview, onExport, isExporting }: HeaderProps) {
  const { projectName, scenes, sceneOrder, selectedSceneId, selectScene, targetTotalDurationSec, setTargetTotalDurationSec } = useStore();
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
  const [targetGoalInput, setTargetGoalInput] = useState('');
  const [goalInputError, setGoalInputError] = useState('');
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const goalEditorRef = useRef<HTMLDivElement>(null);
  const hasProjectDurationGoal = Number.isFinite(targetTotalDurationSec) && (targetTotalDurationSec as number) > 0;

  // Project stats
  const { totalDuration, totalCuts } = useMemo(() => {
    let duration = 0;
    let cuts = 0;

    for (const scene of orderedScenes) {
      for (const cut of scene.cuts) {
        const dt = isFinite(cut.displayTime) ? cut.displayTime : 0;
        duration += dt;
        cuts++;
      }
    }

    return {
      totalDuration: duration,
      totalCuts: cuts,
    };
  }, [orderedScenes]);

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
    setTargetGoalInput(formatGoalInputValue(targetTotalDurationSec));
    setGoalInputError('');
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

  const handleApplyTargetGoal = () => {
    const result = parseGoalInputValue(targetGoalInput);
    if (result.error || !result.totalSec) {
      setGoalInputError(result.error ?? 'Use seconds or m:ss');
      return;
    }
    saveDurationTargetSettings({ sceneDurationBarMode: 'target' });
    setTargetTotalDurationSec(result.totalSec);
    setGoalInputError('');
    setShowGoalEditor(false);
  };

  const handleGoalInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleApplyTargetGoal();
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
                <span className="header-time-total">{formatTimeCode(totalDuration)}</span>
                <span className="header-time-divider" aria-hidden="true">|</span>
                <span className="header-goal-label">goal</span>
                <div className="header-goal" ref={goalEditorRef}>
                  <button
                    type="button"
                    className={`header-goal-trigger ${showGoalEditor ? 'is-open' : ''}`}
                    onClick={() => setShowGoalEditor((current) => !current)}
                    aria-expanded={showGoalEditor}
                    aria-label={effectiveTargetSec ? 'Edit duration goal' : 'Set duration goal'}
                    title={effectiveTargetSec ? 'Edit duration goal' : 'Set duration goal'}
                  >
                    <span className={`header-goal-value ${effectiveTargetSec ? '' : 'is-empty'}`}>
                      {formatGoalTimeCode(effectiveTargetSec)}
                    </span>
                  </button>

                  {showGoalEditor && (
                    <div className="header-goal-popover">
                      <span className="header-goal-popover-label">Duration Goal</span>
                      <div className="header-goal-popover-row">
                        <Input
                          type="text"
                          placeholder="1:30"
                          value={targetGoalInput}
                          onChange={(e) => {
                            setTargetGoalInput(e.target.value);
                            if (goalInputError) {
                              setGoalInputError('');
                            }
                          }}
                          onKeyDown={handleGoalInputKeyDown}
                          className="header-goal-number"
                          title="Set project duration goal as seconds or m:ss"
                          autoFocus
                        />
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleApplyTargetGoal}>
                          Set
                        </button>
                        {hasProjectDurationGoal && (
                          <button
                            type="button"
                            className="secondary"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setTargetGoalInput('');
                              setGoalInputError('');
                              setTargetTotalDurationSec(undefined);
                              setShowGoalEditor(false);
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <span className={`header-goal-help ${goalInputError ? 'is-error' : ''}`}>
                        {goalInputError || 'Enter seconds or m:ss'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
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
