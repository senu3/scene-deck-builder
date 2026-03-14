import { useState } from 'react';
import { AlertTriangle, FolderOpen, Trash2, SkipForward, Check, X } from 'lucide-react';
import type { Asset } from '../types';
import {
  getRecoveryAssessmentNotices,
  type RecoveryAssessment,
} from '../features/project/recoveryAssessment';
import { showOpenFileDialogBridge } from '../features/platform/electronGateway';
import { IconButton, UtilityButton } from '../ui';
import { Overlay, useModalKeyboard } from '../ui/primitives/Modal';
import './MissingAssetRecoveryModal.css';

export interface MissingAssetInfo {
  name: string;
  cutId: string;
  sceneId: string;
  sceneName?: string;
  asset: Asset;
}

export type RecoveryAction = 'relink' | 'delete' | 'skip';

export interface RecoveryDecision {
  cutId: string;
  sceneId: string;
  action: RecoveryAction;
  newPath?: string;  // For relink action
}

interface MissingAssetRecoveryModalProps {
  missingAssets: MissingAssetInfo[];
  assessment: RecoveryAssessment;
  vaultPath: string;  // Used for context, not actively used in recovery
  onComplete: (decisions: RecoveryDecision[]) => void;
  onCancel: () => void;
}

export default function MissingAssetRecoveryModal({
  missingAssets,
  assessment,
  vaultPath: _vaultPath,  // eslint-disable-line @typescript-eslint/no-unused-vars
  onComplete,
  onCancel,
}: MissingAssetRecoveryModalProps) {
  const [decisions, setDecisions] = useState<Map<string, RecoveryDecision>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentAsset = missingAssets[currentIndex];
  const currentDecision = decisions.get(currentAsset?.cutId);

  const handleRelink = async () => {
    if (!currentAsset) return;

    // Open file dialog to select replacement file
    const filePath = await showOpenFileDialogBridge({
      title: `Select replacement for: ${currentAsset.name}`,
      filters: [
        { name: 'Media Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'] }
      ],
    });

    if (filePath) {
      setDecisions(prev => {
        const newMap = new Map(prev);
        newMap.set(currentAsset.cutId, {
          cutId: currentAsset.cutId,
          sceneId: currentAsset.sceneId,
          action: 'relink',
          newPath: filePath,
        });
        return newMap;
      });
      moveToNext();
    }
  };

  const handleDelete = () => {
    if (!currentAsset) return;

    setDecisions(prev => {
      const newMap = new Map(prev);
      newMap.set(currentAsset.cutId, {
        cutId: currentAsset.cutId,
        sceneId: currentAsset.sceneId,
        action: 'delete',
      });
      return newMap;
    });
    moveToNext();
  };

  const handleSkip = () => {
    if (!currentAsset) return;

    setDecisions(prev => {
      const newMap = new Map(prev);
      newMap.set(currentAsset.cutId, {
        cutId: currentAsset.cutId,
        sceneId: currentAsset.sceneId,
        action: 'skip',
      });
      return newMap;
    });
    moveToNext();
  };

  const moveToNext = () => {
    if (currentIndex < missingAssets.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const moveToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    setIsProcessing(true);

    // For any assets without decisions, default to 'skip'
    const allDecisions: RecoveryDecision[] = missingAssets.map(asset => {
      const decision = decisions.get(asset.cutId);
      if (decision) return decision;
      return {
        cutId: asset.cutId,
        sceneId: asset.sceneId,
        action: 'skip' as RecoveryAction,
      };
    });

    onComplete(allDecisions);
  };

  const handleSkipAll = () => {
    const allDecisions: RecoveryDecision[] = missingAssets.map(asset => ({
      cutId: asset.cutId,
      sceneId: asset.sceneId,
      action: 'skip' as RecoveryAction,
    }));
    onComplete(allDecisions);
  };

  const getActionLabel = (action: RecoveryAction): string => {
    switch (action) {
      case 'relink': return 'Relink';
      case 'delete': return 'Delete';
      case 'skip': return 'Skip';
    }
  };

  const getActionIcon = (action: RecoveryAction) => {
    switch (action) {
      case 'relink': return <FolderOpen size={14} />;
      case 'delete': return <Trash2 size={14} />;
      case 'skip': return <SkipForward size={14} />;
    }
  };

  const decidedCount = decisions.size;
  const totalCount = missingAssets.length;
  const modalNotices = getRecoveryAssessmentNotices(assessment, 'modal')
    .filter((notice) => !notice.includes('file(s) could not be found.'));
  const headerSubtitle = [
    `${totalCount} asset(s) could not be found in the project.`,
    ...modalNotices,
  ].join(' ');

  // ESC key to close
  useModalKeyboard({ onEscape: onCancel });

  return (
    <Overlay className="missing-asset-modal" onClick={onCancel} blur>
      <div className="modal-container">
        <div className="modal-header">
          <AlertTriangle size={24} className="warning-icon" />
          <div className="header-text">
            <h2>Missing Assets Found</h2>
            <p>{headerSubtitle}</p>
          </div>
          <IconButton
            className="close-btn"
            variant="contrast"
            onClick={onCancel}
            aria-label="Close missing asset recovery"
          >
            <X size={20} />
          </IconButton>
        </div>

        <div className="modal-content">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(decidedCount / totalCount) * 100}%` }}
            />
            <span className="progress-text">{decidedCount} / {totalCount} resolved</span>
          </div>

          <div className="asset-list">
            {missingAssets.map((asset, index) => {
              const decision = decisions.get(asset.cutId);
              const isActive = index === currentIndex;

              return (
                <div
                  key={asset.cutId}
                  className={`asset-item ${isActive ? 'active' : ''} ${decision ? 'decided' : ''}`}
                  onClick={() => setCurrentIndex(index)}
                >
                  <span className="asset-index">{index + 1}</span>
                  <div className="asset-summary">
                    <span className="asset-name">{asset.name}</span>
                    <span className="asset-badge missing">Missing file</span>
                  </div>
                  {decision && (
                    <span className={`asset-decision ${decision.action}`}>
                      {getActionIcon(decision.action)}
                      {getActionLabel(decision.action)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {currentAsset && (
            <div className="current-asset-panel">
              <h3>Current Asset</h3>
              <div className="asset-details">
                <div className="detail-row">
                  <span className="label">Scene:</span>
                  <span className="value">{currentAsset.sceneName || currentAsset.sceneId}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Name:</span>
                  <span className="value">{currentAsset.name}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Original Path:</span>
                  <span className="value path">{currentAsset.asset.originalPath || currentAsset.asset.path}</span>
                </div>
                {currentDecision?.action === 'relink' && currentDecision.newPath && (
                  <div className="detail-row relinked">
                    <span className="label">New Path:</span>
                    <span className="value path">{currentDecision.newPath}</span>
                  </div>
                )}
              </div>

              <div className="action-buttons">
                <button className="action-btn relink" onClick={handleRelink}>
                  <FolderOpen size={18} />
                  <span>Relink File</span>
                  <span className="hint">Select a replacement file</span>
                </button>
                <button className="action-btn delete" onClick={handleDelete}>
                  <Trash2 size={18} />
                  <span>Delete Cut</span>
                  <span className="hint">Remove from timeline</span>
                </button>
                <button className="action-btn skip" onClick={handleSkip}>
                  <SkipForward size={18} />
                  <span>Skip for Now</span>
                  <span className="hint">Keep path, may show error</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="nav-buttons">
            <UtilityButton
              className="nav-btn"
              variant="overlay"
              size="md"
              onClick={moveToPrevious}
              disabled={currentIndex === 0}
            >
              Previous
            </UtilityButton>
            <UtilityButton
              className="nav-btn"
              variant="overlay"
              size="md"
              onClick={moveToNext}
              disabled={currentIndex >= missingAssets.length - 1}
            >
              Next
            </UtilityButton>
          </div>
          <div className="complete-buttons">
            <UtilityButton className="skip-all-btn" variant="overlayOutline" size="lg" onClick={handleSkipAll}>
              Skip All
            </UtilityButton>
            <UtilityButton
              className="complete-btn"
              variant="overlayPrimary"
              size="lg"
              onClick={handleComplete}
              disabled={isProcessing}
            >
              <Check size={18} />
              {isProcessing ? 'Processing...' : 'Apply Changes'}
            </UtilityButton>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
