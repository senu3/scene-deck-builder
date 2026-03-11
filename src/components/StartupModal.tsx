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
  Shield,
  FolderTree,
  Copy,
  Database,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import MissingAssetRecoveryModal, { MissingAssetInfo, RecoveryDecision } from './MissingAssetRecoveryModal';
import {
  finalizePendingProjectLoad,
} from '../features/project/apply';
import {
  type PendingProject,
  type ProjectLoadOutcome,
  type RecentProjectEntry,
  buildProjectLoadOutcome,
  createProjectBootstrap,
  loadRecentProjectsWithCleanup,
  projectPathExists,
  requestProjectFromPath,
  requestProjectSelection,
  selectProjectVaultPath,
} from '../features/project/session';
import {
  createSaveProjectEffect,
  createSaveRecentProjectsEffect,
  dispatchAppEffects,
  type AppEffectDispatchResult,
} from '../features/platform/effects';
import { buildProjectLoadFailureAlert } from '../features/project/loadFailure';
import { hasElectronBridge } from '../features/platform/electronGateway';
import { useDialog } from '../ui';
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
  const { alert: dialogAlert } = useDialog();
  const {
    initializeProject,
    setRootFolder,
    initializeSourcePanel,
    loadMetadata,
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

  useEffect(() => {
    loadRecentProjects();
  }, []);

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

        const existingRecent = await loadRecentProjectsWithCleanup();
        const newRecent: RecentProjectEntry = {
          name: projectName,
          path: bootstrap.projectFilePath,
          date: new Date().toISOString(),
        };
        const createResult = await dispatchAppEffects([
          createSaveProjectEffect({
            projectPath: bootstrap.projectFilePath,
            projectData: bootstrap.projectData,
          }),
          createSaveRecentProjectsEffect({
            projects: [newRecent, ...existingRecent.slice(0, 9)],
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
      } else {
        // Demo mode
        initializeProject({
          name: projectName,
          vaultPath: '/demo/vault/' + projectName,
        });
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

    const result = await requestProjectSelection();
    if (result.kind === 'canceled') return;
    if (result.kind === 'failure') {
      await dialogAlert(buildProjectLoadFailureAlert(result.failure));
      return;
    }
    const outcome = await buildProjectLoadOutcome(result.data, result.path, 'Loaded Project');
    await applyProjectLoadOutcome(outcome);
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
    }, recoveryDecisions);

    setRecentProjects(result.persistencePlan.recentProjects);
    logFeatureEffectWarnings('startup-save-recents', result.recentSaveResult);

    // Clear recovery state
    setShowRecoveryDialog(false);
    setPendingProject(null);
    setMissingAssets([]);
  };

  const applyProjectLoadOutcome = async (outcome: ProjectLoadOutcome) => {
    if (outcome.kind === 'corrupted') {
      await dialogAlert(buildProjectLoadFailureAlert(outcome.failure));
      return;
    }
    if (outcome.kind === 'pending') {
      setMissingAssets(outcome.missingAssets);
      setPendingProject(outcome.payload);
      setShowRecoveryDialog(true);
      return;
    }
    await finalizeProjectLoad(outcome.payload);
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
  };

  const handleOpenRecent = async (project: RecentProjectEntry) => {
    if (!hasElectronBridge()) return;

    const exists = await projectPathExists(project.path);
    if (!exists) {
      await dialogAlert(buildProjectLoadFailureAlert({
        code: 'project-file-not-found',
        projectPath: project.path,
      }));
      // Remove from recent
      const filtered = recentProjects.filter(p => p.path !== project.path);
      setRecentProjects(filtered);
      const filteredSaveResult = await dispatchAppEffects([
        createSaveRecentProjectsEffect({
          projects: filtered,
        }),
      ], {
        origin: 'feature',
      });
      logFeatureEffectWarnings('startup-remove-missing-recent', filteredSaveResult);
      return;
    }

    // Load the project file directly from the specified path
    try {
      const result = await requestProjectFromPath(project.path);
      if (result.kind === 'canceled') return;
      if (result.kind === 'failure') {
        await dialogAlert(buildProjectLoadFailureAlert(result.failure));
        if (result.failure.code === 'project-file-not-found') {
          const filtered = recentProjects.filter((entry) => entry.path !== project.path);
          setRecentProjects(filtered);
          const filteredSaveResult = await dispatchAppEffects([
            createSaveRecentProjectsEffect({
              projects: filtered,
            }),
          ], {
            origin: 'feature',
          });
          logFeatureEffectWarnings('startup-remove-missing-recent', filteredSaveResult);
        }
        return;
      }
      const outcome = await buildProjectLoadOutcome(result.data, project.path, project.name);
      await applyProjectLoadOutcome(outcome);
    } catch (error) {
      console.error('Failed to load project:', error);
      alert('Failed to load project');
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
                <h2>Vault Structure</h2>
                <p>
                  Each project creates a dedicated <strong>vault folder</strong> that
                  stores everything needed to restore your work.
                </p>
              </div>

              <div className="vault-tree-visual">
                <div className="tree-item tree-root">
                  <FolderTree size={14} />
                  <span className="tree-label">YourProject/</span>
                </div>
                <div className="tree-item tree-child">
                  <Database size={14} />
                  <span className="tree-label">project.sdp</span>
                  <span className="tree-tag">Scene order &amp; timing</span>
                </div>
                <div className="tree-item tree-child">
                  <FolderTree size={14} />
                  <span className="tree-label">assets/</span>
                  <span className="tree-tag">All media files</span>
                </div>
                <div className="tree-item tree-grandchild">
                  <FileImage size={14} />
                  <span className="tree-label tree-muted">img_a1b2c3.png</span>
                </div>
                <div className="tree-item tree-grandchild">
                  <FileImage size={14} />
                  <span className="tree-label tree-muted">vid_d4e5f6.mp4</span>
                </div>
                <div className="tree-item tree-child">
                  <Database size={14} />
                  <span className="tree-label">.index.json</span>
                  <span className="tree-tag">Asset index</span>
                </div>
              </div>

              <div className="info-notes">
                <div className="info-note">
                  <Copy size={14} />
                  <span>
                    Imported files are <strong>copied</strong> into
                    {' '}<code>assets/</code> with unique hash names.
                    The original files remain untouched.
                  </span>
                </div>
                <div className="info-note">
                  <Shield size={14} />
                  <span>
                    The vault folder is self-contained.
                    Copy or move it anywhere and your project stays intact.
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
                  <label htmlFor="project-name">Project Name</label>
                  <input
                    id="project-name"
                    type="text"
                    placeholder="My AI Scene Project"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="vault-location">Vault Location</label>
                  <div className="vault-selector">
                    <input
                      id="vault-location"
                      type="text"
                      placeholder="Select a folder..."
                      value={vaultPath}
                      readOnly
                      title={vaultPath}
                    />
                    <button onClick={handleSelectVault}>
                      <FolderOpen size={16} />
                      Browse
                    </button>
                  </div>
                  <p className="form-hint">
                    A new folder named <strong>{projectName.trim() || '...'}</strong> will
                    be created inside this location.
                  </p>
                </div>

                {vaultPath && projectName.trim() && (
                  <div className="vault-preview">
                    <span className="vault-preview-label">Created at:</span>
                    <code className="vault-preview-path">
                      {getVaultDisplayPath(vaultPath)}/{projectName.trim()}/
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
              <p className="hero-tagline">Visual asset management for AI-generated content</p>
            </div>

            <div className="hero-features">
              <div className="hero-feature">
                <div className="feature-icon">
                  <HardDrive size={18} />
                </div>
                <div className="feature-text">
                  <strong>Self-contained Vault</strong>
                  <span>All assets are copied into a dedicated project folder. Safe to move or back up.</span>
                </div>
              </div>
              <div className="hero-feature">
                <div className="feature-icon">
                  <Copy size={18} />
                </div>
                <div className="feature-text">
                  <strong>Non-destructive Import</strong>
                  <span>Original files are never modified. Assets are duplicated with hash-based names.</span>
                </div>
              </div>
              <div className="hero-feature">
                <div className="feature-icon">
                  <Shield size={18} />
                </div>
                <div className="feature-text">
                  <strong>Full Recoverability</strong>
                  <span>Project file + asset index = complete recovery of scenes, cuts, and timing.</span>
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

              <button className="action-card" onClick={handleLoadProject}>
                <div className="action-icon-wrapper">
                  <FolderOpen size={22} />
                </div>
                <div className="action-text">
                  <span className="action-title">Open Project</span>
                  <span className="action-desc">Load an existing .sdp project file</span>
                </div>
                <ChevronRight size={18} className="action-arrow" />
              </button>
            </div>

            {recentProjects.length > 0 && (
              <div className="recent-projects">
                <h3>
                  <Clock size={14} />
                  Recent Projects
                </h3>
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Missing Asset Recovery Dialog */}
      {showRecoveryDialog && pendingProject && (
        <MissingAssetRecoveryModal
          missingAssets={missingAssets}
          vaultPath={pendingProject.vaultPath}
          onComplete={handleRecoveryComplete}
          onCancel={handleRecoveryCancel}
        />
      )}
    </div>
  );
}
