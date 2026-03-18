import { useState, useEffect } from 'react';
import {
  Clapperboard,
  FolderPlus,
  FolderOpen,
  Clock,
  ChevronRight,
  ArrowLeft,
  HardDrive,
  FileImage,
  FolderTree,
  Copy,
  Database,
  MousePointer2,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import MissingAssetRecoveryModal, { MissingAssetInfo, RecoveryDecision } from './MissingAssetRecoveryModal';
import {
  finalizePendingProjectLoad,
} from '../features/project/apply';
import {
  type PendingProject,
  type ProjectOpenRequestResult,
  type RecentProjectEntry,
  createProjectBootstrap,
  loadRecentProjectsWithCleanup,
  openProjectAtPath,
  openSelectedProject,
  projectPathExists,
  selectProjectVaultPath,
} from '../features/project/session';
import {
  createSaveProjectEffect,
  createSaveRecentProjectsEffect,
  dispatchAppEffects,
  type AppEffectDispatchResult,
} from '../features/platform/effects';
import {
  buildProjectLoadFailureAlert,
  classifyRecentProjectIssue,
  type RecentProjectIssueKind,
} from '../features/project/loadFailure';
import {
  type RecoveryAssessment,
  formatRecoveryAssessmentSummary,
  getRecoveryAssessmentNotices,
} from '../features/project/recoveryAssessment';
import { buildProjectAssetIndexRepairMessage } from '../features/project/assetIntegrity';
import { buildPersistedSnapshot } from '../features/project/persistedSnapshot';
import {
  buildUnregisteredAssetsConfirmDialog,
  formatUnregisteredAssetSyncSummary,
  syncUnregisteredAssetsForProjectLoad,
} from '../features/project/unregisteredAssets';
import {
  removeRecentProjectsByPath,
} from '../features/project/recentProjects';
import { hasElectronBridge } from '../features/platform/electronGateway';
import { PathField, useDialog, useToast } from '../ui';
import './StartupModal.css';

function logFeatureEffectWarnings(scope: string, result: AppEffectDispatchResult): void {
  for (const warning of result.warnings) {
    console.warn(`[ProjectEffects] ${scope} warning`, warning);
  }
}

function hasFailedEffect(result: AppEffectDispatchResult, effectType: string): boolean {
  return result.results.some((entry) => !entry.success && entry.effect.type === effectType);
}

export default function StartupModal() {
  const { alert: dialogAlert, confirm: dialogConfirm } = useDialog();
  const { toast } = useToast();
  const {
    initializeProject,
    setRootFolder,
    initializeSourcePanel,
    loadMetadata,
    setLastPersistedSnapshot,
    setProjectPath,
    setCutRuntimeHold,
    createStoreEventOperation,
    runWithStoreEventContext,
    emitCutRelinked,
  } = useStore();
  const [step, setStep] = useState<'choice' | 'new-project'>('choice');
  const [projectName, setProjectName] = useState('');
  const [vaultPath, setVaultPath] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Recovery dialog state
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [missingAssets, setMissingAssets] = useState<MissingAssetInfo[]>([]);
  const [pendingProject, setPendingProject] = useState<PendingProject | null>(null);
  const [pendingAssessment, setPendingAssessment] = useState<RecoveryAssessment | null>(null);

  const showUnexpectedProjectLoadAlert = async (projectPath: string) => {
    await dialogAlert(buildProjectLoadFailureAlert({
      code: 'invalid-project-structure',
      projectPath,
    }));
  };

  useEffect(() => {
    loadRecentProjects();
  }, []);

  const removeRecentProjectEntry = async (projectPath: string, logScope: string) => {
    const filtered = removeRecentProjectsByPath(recentProjects, projectPath);
    setRecentProjects(filtered);
    const saveResult = await dispatchAppEffects([
      createSaveRecentProjectsEffect({
        projects: filtered,
      }),
    ], {
      origin: 'feature',
    });
    logFeatureEffectWarnings(logScope, saveResult);
  };

  const confirmRemoveRecentProject = async (issue: RecentProjectIssueKind) => {
    const message = issue === 'missing'
      ? 'This project file can\'t be found. Remove it from Recent Projects?'
      : issue === 'damaged-project'
        ? 'This project file is damaged. Remove it from Recent Projects?'
        : issue === 'unreadable'
          ? 'This project file can\'t be read. Remove it from Recent Projects?'
          : 'This project file can\'t be opened. Remove it from Recent Projects?';
    return dialogConfirm({
      title: 'Remove Recent Project?',
      message,
      variant: issue === 'missing' ? 'info' : 'warning',
      confirmLabel: 'Remove',
      cancelLabel: 'Keep',
    });
  };

  const loadRecentProjects = async () => {
    if (!hasElectronBridge()) return;
    const validProjects = await loadRecentProjectsWithCleanup(async (projects) => {
      const cleanupResult = await dispatchAppEffects([
        createSaveRecentProjectsEffect({
          projects,
        }),
      ], {
        origin: 'feature',
      });
      logFeatureEffectWarnings('startup-cleanup-recents', cleanupResult);
    });
    setRecentProjects(validProjects);
  };

  const handleSelectVault = async () => {
    if (!hasElectronBridge()) {
      // Demo mode
      setVaultPath('/demo/vault');
      return;
    }

    const path = await selectProjectVaultPath();
    if (path) {
      setVaultPath(path);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim() || !vaultPath) return;

    setIsCreating(true);

    try {
      if (hasElectronBridge()) {
        const bootstrap = await createProjectBootstrap(vaultPath, projectName);
        if (!bootstrap) {
          alert('Failed to create vault folder');
          setIsCreating(false);
          return;
        }

        const createResult = await dispatchAppEffects([
          createSaveProjectEffect({
            projectPath: bootstrap.projectFilePath,
            projectData: bootstrap.projectData,
          }),
        ], {
          origin: 'feature',
        });
        logFeatureEffectWarnings('startup-create-project', createResult);
        if (hasFailedEffect(createResult, 'SAVE_PROJECT')) {
          alert('Failed to save project file');
          setIsCreating(false);
          return;
        }

        // Initialize project with the scenes we created
        initializeProject({
          name: projectName,
          vaultPath: bootstrap.vaultPath,
          sceneOrder: bootstrap.defaultSceneOrder,
          scenes: bootstrap.defaultScenes,
        });
        setProjectPath(bootstrap.projectFilePath);

        // Load metadata store (will be empty for new project)
        await loadMetadata(bootstrap.vaultPath);

        // Set root folder to vault
        setRootFolder({
          path: bootstrap.vaultPath,
          name: projectName,
          structure: bootstrap.structure,
        });

        // Initialize source panel with default vault assets folder
        await initializeSourcePanel(undefined, bootstrap.vaultPath);
        setLastPersistedSnapshot(buildPersistedSnapshot(useStore.getState()));
      } else {
        // Demo mode
        initializeProject({
          name: projectName,
          vaultPath: '/demo/vault/' + projectName,
        });
        setLastPersistedSnapshot(buildPersistedSnapshot(useStore.getState()));
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project');
    }

    setIsCreating(false);
  };

  const handleLoadProject = async () => {
    if (!hasElectronBridge()) {
      // Demo mode - just initialize with demo data
      initializeProject({
        name: 'Demo Project',
        vaultPath: '/demo/vault',
      });
      return;
    }

    try {
      let result = await openSelectedProject('Loaded Project');
      if (result.kind === 'repair-required') {
        const confirmed = await dialogConfirm(buildProjectAssetIndexRepairMessage(result.action, 'load'));
        if (!confirmed) return;
        result = await openSelectedProject('Loaded Project', { allowRepair: true });
      }
      await applyProjectOpenResult(result);
    } catch (error) {
      console.error('Failed to load selected project:', error);
      await showUnexpectedProjectLoadAlert('selected-project');
    }
  };

  // Finalize project loading after recovery decisions (if any)
  const finalizeProjectLoad = async (project: PendingProject, recoveryDecisions?: RecoveryDecision[]) => {
    const result = await finalizePendingProjectLoad(project, {
      initializeProject,
      setCutRuntimeHold,
      setProjectPath,
      loadMetadata,
      initializeSourcePanel,
      createStoreEventOperation,
      runWithStoreEventContext,
      emitCutRelinked,
      syncUnregisteredAssets: async ({ project: pendingProject }) =>
        syncUnregisteredAssetsForProjectLoad({
          vaultPath: pendingProject.vaultPath,
          confirm: async (files) => dialogConfirm(buildUnregisteredAssetsConfirmDialog(files)),
        }),
    }, recoveryDecisions);
    setLastPersistedSnapshot(buildPersistedSnapshot(useStore.getState()));

    setRecentProjects(result.persistencePlan.recentProjects);
    logFeatureEffectWarnings('startup-save-recents', result.recentSaveResult);

    // Clear recovery state
    setShowRecoveryDialog(false);
    setPendingProject(null);
    setMissingAssets([]);
    setPendingAssessment(null);

    if (result.assessment.mode === 'repairable' && getRecoveryAssessmentNotices(result.assessment, 'load').length > 0) {
      await dialogAlert({
        title: 'Recovery Report',
        message: formatRecoveryAssessmentSummary(result.assessment, 'load'),
        variant: 'warning',
      });
    }
    if (result.unregisteredAssetSync?.failedCount) {
      await dialogAlert({
        title: 'Some Assets Were Not Added',
        message: formatUnregisteredAssetSyncSummary(result.unregisteredAssetSync),
        variant: 'warning',
      });
    } else if (result.unregisteredAssetSync?.registeredCount) {
      toast.info('Assets Added', formatUnregisteredAssetSyncSummary(result.unregisteredAssetSync));
    }
  };

  const applyProjectOpenResult = async (result: ProjectOpenRequestResult) => {
    try {
      if (result.kind === 'canceled') {
        return;
      }
      if (result.kind === 'repair-required') {
        await dialogAlert({
          title: 'Project Could Not Be Repaired',
          message: 'The asset index could not be repaired.',
          variant: 'warning',
        });
        return;
      }
      if (result.kind === 'failure' || result.kind === 'corrupted') {
        await dialogAlert(buildProjectLoadFailureAlert(result.failure));
        return;
      }
      if (result.kind === 'pending') {
        setMissingAssets(result.missingAssets);
        setPendingProject(result.payload);
        setPendingAssessment(result.assessment);
        setShowRecoveryDialog(true);
        return;
      }
      await finalizeProjectLoad(result.payload);
    } catch (error) {
      console.error('Failed to apply project open result:', error);
      const fallbackPath = result.kind === 'pending' || result.kind === 'ready'
        ? result.payload.projectPath
        : (result.kind === 'failure' || result.kind === 'corrupted' ? result.failure.projectPath : 'selected-project');
      await showUnexpectedProjectLoadAlert(fallbackPath);
    }
  };

  // Handle recovery dialog completion
  const handleRecoveryComplete = async (decisions: RecoveryDecision[]) => {
    if (!pendingProject) return;
    await finalizeProjectLoad(pendingProject, decisions);
  };

  // Handle recovery dialog cancel
  const handleRecoveryCancel = () => {
    setShowRecoveryDialog(false);
    setPendingProject(null);
    setMissingAssets([]);
    setPendingAssessment(null);
  };

  const handleOpenRecent = async (project: RecentProjectEntry) => {
    if (!hasElectronBridge()) return;

    const exists = await projectPathExists(project.path);
    if (!exists) {
      const remove = await confirmRemoveRecentProject('missing');
      if (remove) {
        await removeRecentProjectEntry(project.path, 'startup-remove-missing-recent');
      }
      return;
    }

    // Load the project file directly from the specified path
    try {
      let result = await openProjectAtPath(project.path, project.name);
      if (result.kind === 'failure') {
        const issue = classifyRecentProjectIssue(result.failure.code);
        if (!issue) {
          await dialogAlert(buildProjectLoadFailureAlert(result.failure));
        } else {
          const remove = await confirmRemoveRecentProject(issue);
          if (remove) {
            await removeRecentProjectEntry(project.path, 'startup-remove-broken-recent');
          }
        }
        return;
      }
      if (result.kind === 'repair-required') {
        const confirmed = await dialogConfirm(buildProjectAssetIndexRepairMessage(result.action, 'load'));
        if (!confirmed) {
          return;
        }
        result = await openProjectAtPath(project.path, project.name, { allowRepair: true });
      }
      if (result.kind === 'corrupted') {
        const issue = classifyRecentProjectIssue(result.failure.code);
        if (!issue) {
          await dialogAlert(buildProjectLoadFailureAlert(result.failure));
          return;
        }
        const remove = await confirmRemoveRecentProject(issue);
        if (remove) {
          await removeRecentProjectEntry(project.path, 'startup-remove-broken-recent');
        }
        return;
      }
      await applyProjectOpenResult(result);
    } catch (error) {
      console.error('Failed to load project:', error);
      await showUnexpectedProjectLoadAlert(project.path);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  // Extract directory name from vault path for display
  const getVaultDisplayPath = (path: string) => {
    if (!path) return '';
    // Show last 2 segments for context
    const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.length <= 2) return path;
    return '.../' + segments.slice(-2).join('/');
  };

  const projectFolderName = projectName.trim() || 'Your Project';
  const vaultFolderDisplay = vaultPath
    ? `${getVaultDisplayPath(vaultPath)}/${projectFolderName}/`
    : `.../${projectFolderName}/`;

  // ─── New Project Screen ───
  if (step === 'new-project') {
    return (
      <div className="startup-modal">
        <div className="startup-backdrop" />
        <div className="startup-split">
          {/* Left: Vault explanation */}
          <div className="startup-info-panel">
            <button className="back-btn" onClick={() => setStep('choice')}>
              <ArrowLeft size={18} />
              <span>Back</span>
            </button>

            <div className="info-panel-content">
              <div className="info-panel-header">
                <div className="info-icon-wrapper">
                  <HardDrive size={28} />
                </div>
                <h2>Where The Vault Goes</h2>
                <p>
                  Choose a parent folder first. The app creates one
                  <strong> project folder</strong> inside it, and that new folder becomes the vault.
                </p>
              </div>

              <div className="vault-tree-visual">
                <div className="tree-item tree-parent">
                  <FolderOpen size={14} />
                  <span className="tree-label">Parent Folder/</span>
                </div>
                <div className="tree-item tree-child tree-root">
                  <FolderTree size={14} />
                  <span className="tree-label">{projectFolderName}/</span>
                  <span className="tree-badge">Vault</span>
                </div>
                <div className="tree-item tree-grandchild">
                  <Database size={14} />
                  <span className="tree-label">project.sdp</span>
                  <span className="tree-tag">Story structure</span>
                </div>
                <div className="tree-item tree-grandchild">
                  <FolderTree size={14} />
                  <span className="tree-label">assets/</span>
                  <span className="tree-tag">Copied media</span>
                </div>
                <div className="tree-item tree-grandchild tree-deep">
                  <FileImage size={14} />
                  <span className="tree-label tree-muted">image_hash.png</span>
                </div>
                <div className="tree-item tree-grandchild tree-deep">
                  <FileImage size={14} />
                  <span className="tree-label tree-muted">video_hash.mp4</span>
                </div>
                <div className="tree-item tree-grandchild">
                  <Database size={14} />
                  <span className="tree-label">.index.json</span>
                  <span className="tree-tag">Asset lookup</span>
                </div>
              </div>

              <div className="info-notes">
                <div className="info-note">
                  <Copy size={14} />
                  <span>
                    Imported files are <strong>copied</strong> into <code>assets/</code>.
                    Your original media files stay where they are.
                  </span>
                </div>
                <div className="info-note">
                  <HardDrive size={14} />
                  <span>
                    Copy or move this one vault folder and the whole project moves with it.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Create form */}
          <div className="startup-main-panel">
            <div className="startup-main-inner">
              <div className="form-header">
                <Clapperboard size={28} className="logo-icon" />
                <h1>Create New Project</h1>
              </div>

              <div className="new-project-form">
                <div className="form-group">
                  <label htmlFor="project-name">Your Project Name</label>
                  <input
                    id="project-name"
                    type="text"
                    placeholder="My Scene Project"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Parent Folder</label>
                  <PathField
                    value={vaultPath}
                    placeholder="Select a folder..."
                    onBrowse={handleSelectVault}
                    browseLabel="Browse"
                    browseIcon={<FolderOpen size={16} />}
                    className="vault-selector"
                    valueClassName="vault-selector-value"
                    buttonClassName="vault-selector-button"
                  />
                  <p className="form-hint">
                    A new folder named <strong>{projectFolderName}</strong> will be created here.
                    That new folder becomes the vault.
                  </p>
                </div>

                {vaultPath && projectName.trim() && (
                  <div className="vault-preview">
                    <span className="vault-preview-label">Vault Folder:</span>
                    <code className="vault-preview-path">
                      {vaultFolderDisplay}
                    </code>
                  </div>
                )}

                <button
                  className="create-btn"
                  onClick={handleCreateProject}
                  disabled={!projectName.trim() || !vaultPath || isCreating}
                >
                  <FolderPlus size={18} />
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Choice Screen ───
  return (
    <div className="startup-modal">
      <div className="startup-backdrop" />
      <div className="startup-split">
        {/* Left: Hero / About */}
        <div className="startup-info-panel startup-hero">
          <div className="info-panel-content">
            <div className="hero-brand">
              <Clapperboard size={48} className="hero-logo" />
              <h1>AI Scene Deck</h1>
              <p className="hero-tagline">
                Build story structure from your media with simple, local project files.
              </p>
            </div>

            <div className="hero-features">
              <div className="hero-feature">
                <div className="feature-icon">
                  <Clapperboard size={18} />
                </div>
                <div className="feature-text">
                  <strong>Build from Media</strong>
                  <span>Turn images and clips into scenes and cuts to build a clear visual storyline.</span>
                </div>
              </div>
              <div className="hero-feature">
                <div className="feature-icon">
                  <MousePointer2 size={18} />
                </div>
                <div className="feature-text">
                  <strong>Drag, Drop, Arrange</strong>
                  <span>Import media by dragging files directly into scenes and arranging cuts visually.</span>
                </div>
              </div>
              <div className="hero-feature">
                <div className="feature-icon">
                  <Copy size={18} />
                </div>
                <div className="feature-text">
                  <strong>Project-Managed Copies</strong>
                  <span>Imported media is copied into the project, preventing broken links and keeping projects portable.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions + Recent */}
        <div className="startup-main-panel">
          <div className="startup-main-inner">
            <h2 className="get-started-title">Get Started</h2>

            <div className="startup-actions">
              <button className="action-card" onClick={() => setStep('new-project')}>
                <div className="action-icon-wrapper">
                  <FolderPlus size={22} />
                </div>
                <div className="action-text">
                  <span className="action-title">New Project</span>
                  <span className="action-desc">Create a new vault and start fresh</span>
                </div>
                <ChevronRight size={18} className="action-arrow" />
              </button>
            </div>

            <div className="recent-projects">
              <h3>
                <Clock size={14} />
                Recent Projects
              </h3>
              {recentProjects.length > 0 && (
                <div className="recent-list">
                  {recentProjects.map((project, index) => (
                    <button
                      key={index}
                      className="recent-item"
                      onClick={() => handleOpenRecent(project)}
                    >
                      <div className="recent-info">
                        <Clapperboard size={14} className="recent-icon" />
                        <span className="recent-name">{project.name}</span>
                      </div>
                      <span className="recent-date">{formatDate(project.date)}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="recent-item recent-item-ghost" onClick={handleLoadProject}>
                <div className="recent-info">
                  <FolderOpen size={14} className="recent-icon" />
                  <span className="recent-name recent-ghost-label">Open another project...</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
