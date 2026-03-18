/**
 * EnvironmentSettingsModal - Redesigned settings modal with cleaner layout
 * Following ExportModal's pattern: fewer borders, clearer grouping
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Settings,
  Monitor,
  Palette,
  Save,
  Zap,
  Database,
  Film,
  Code,
  Info,
  RotateCcw,
  HardDrive,
  Clock,
  Play,
  ImageIcon,
  Check,
  Trash2,
  History,
  Download,
  AlertTriangle,
  Cog,
  Bell,
} from 'lucide-react';
import {
  Button,
  UtilityButton,
  Overlay,
  Container,
  Header,
  Body,
  useModalKeyboard,
  Tabs,
  Toggle,
  Select,
  StatDisplay,
  InputGroup,
  SettingsRow,
  type TabItem,
} from '../ui';
import {
  getFfmpegLimitsBridge,
  getVersionsBridge,
  setFfmpegLimitsBridge,
} from '../features/platform/electronGateway';
import { getThumbnailCacheStats, setThumbnailCacheLimits, clearThumbnailCache } from '../utils/thumbnailCache';
import styles from './EnvironmentSettingsModal.module.css';

export interface EnvironmentSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onOpenNotificationTests?: () => void;
}

type SettingsTab = 'general' | 'editor' | 'performance' | 'advanced';

type ThemeMode = 'system' | 'dark' | 'light';
type LanguageCode = 'ja' | 'en';
type StartupBehavior = 'last' | 'new' | 'welcome';
type PreviewQuality = 'auto' | 'high' | 'medium' | 'low';

const MB = 1024 * 1024;
const KB = 1024;

const TABS: TabItem[] = [
  { id: 'general', label: 'General', icon: <Monitor size={14} /> },
  { id: 'editor', label: 'Editor', icon: <Play size={14} /> },
  { id: 'performance', label: 'Performance', icon: <Zap size={14} /> },
  { id: 'advanced', label: 'Advanced', icon: <Code size={14} /> },
];

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light (Coming Soon)' },
];

const LANGUAGE_OPTIONS = [
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' },
];

const STARTUP_OPTIONS = [
  { value: 'welcome', label: 'Show Welcome Screen' },
  { value: 'last', label: 'Open Last Project' },
  { value: 'new', label: 'Create New Project' },
];

const PREVIEW_QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const PLAYBACK_RATE_OPTIONS = [
  { value: '0.5', label: '0.5x' },
  { value: '0.75', label: '0.75x' },
  { value: '1', label: '1x (Normal)' },
  { value: '1.25', label: '1.25x' },
  { value: '1.5', label: '1.5x' },
  { value: '2', label: '2x' },
];

const TRASH_RETENTION_OPTIONS = [
  { value: '1', label: '1 day' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: 'never', label: 'Never (Manual)' },
];

const SNAPSHOT_COUNT_OPTIONS = [
  { value: '3', label: '3 snapshots' },
  { value: '5', label: '5 snapshots' },
  { value: '10', label: '10 snapshots' },
  { value: '20', label: '20 snapshots' },
  { value: '50', label: '50 snapshots' },
];

// Default values for all settings
const DEFAULTS = {
  theme: 'dark' as ThemeMode,
  language: 'ja' as LanguageCode,
  startupBehavior: 'welcome' as StartupBehavior,
  autosaveEnabled: true,
  autosaveInterval: 30,
  defaultCutDuration: 3,
  previewQuality: 'auto' as PreviewQuality,
  defaultPlaybackRate: '1',
  showThumbnails: true,
  trashRetention: '7',
  autoEmptyTrash: true,
  snapshotEnabled: true,
  snapshotMaxCount: '10',
  snapshotOnSave: true,
  maxMb: 64,
  maxItems: 200,
  stderrMaxKb: 128,
  maxClipSeconds: 60,
  maxTotalSeconds: 15 * 60,
  maxClipMb: 32,
  maxTotalMb: 256,
  hardwareAcceleration: true,
  debugMode: false,
  verboseLogging: false,
};

export default function EnvironmentSettingsModal({
  open,
  onClose,
  onOpenNotificationTests,
}: EnvironmentSettingsModalProps) {
  useModalKeyboard({ onEscape: onClose, enabled: open });

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [hasChanges, setHasChanges] = useState(false);

  // General settings
  const [theme, setTheme] = useState<ThemeMode>(DEFAULTS.theme);
  const [language, setLanguage] = useState<LanguageCode>(DEFAULTS.language);
  const [startupBehavior, setStartupBehavior] = useState<StartupBehavior>(DEFAULTS.startupBehavior);

  // Editor settings - Autosave
  const [autosaveEnabled, setAutosaveEnabled] = useState(DEFAULTS.autosaveEnabled);
  const [autosaveInterval, setAutosaveInterval] = useState(DEFAULTS.autosaveInterval);

  // Editor settings - Defaults
  const [defaultCutDuration, setDefaultCutDuration] = useState(DEFAULTS.defaultCutDuration);

  // Editor settings - Preview
  const [previewQuality, setPreviewQuality] = useState<PreviewQuality>(DEFAULTS.previewQuality);
  const [defaultPlaybackRate, setDefaultPlaybackRate] = useState(DEFAULTS.defaultPlaybackRate);
  const [showThumbnails, setShowThumbnails] = useState(DEFAULTS.showThumbnails);

  // Editor settings - Trash
  const [trashRetention, setTrashRetention] = useState(DEFAULTS.trashRetention);
  const [autoEmptyTrash, setAutoEmptyTrash] = useState(DEFAULTS.autoEmptyTrash);

  // Editor settings - Snapshots
  const [snapshotEnabled, setSnapshotEnabled] = useState(DEFAULTS.snapshotEnabled);
  const [snapshotMaxCount, setSnapshotMaxCount] = useState(DEFAULTS.snapshotMaxCount);
  const [snapshotOnSave, setSnapshotOnSave] = useState(DEFAULTS.snapshotOnSave);

  // Performance settings - Thumbnail cache
  const stats = useMemo(() => getThumbnailCacheStats(), [open]);
  const [maxMb, setMaxMb] = useState(Math.round(stats.limits.maxBytes / MB));
  const [maxItems, setMaxItems] = useState(stats.limits.maxItems);

  // Performance settings - FFmpeg
  const [stderrMaxKb, setStderrMaxKb] = useState(DEFAULTS.stderrMaxKb);
  const [maxClipSeconds, setMaxClipSeconds] = useState(DEFAULTS.maxClipSeconds);
  const [maxTotalSeconds, setMaxTotalSeconds] = useState(DEFAULTS.maxTotalSeconds);
  const [maxClipMb, setMaxClipMb] = useState(DEFAULTS.maxClipMb);
  const [maxTotalMb, setMaxTotalMb] = useState(DEFAULTS.maxTotalMb);
  const [hardwareAcceleration, setHardwareAcceleration] = useState(DEFAULTS.hardwareAcceleration);

  // Advanced settings
  const [debugMode, setDebugMode] = useState(DEFAULTS.debugMode);
  const [verboseLogging, setVerboseLogging] = useState(DEFAULTS.verboseLogging);

  // Reset all settings to defaults/stored values on open
  useEffect(() => {
    if (!open) return;

    // Reset all settings to defaults
    // TODO: Load saved settings from storage instead of defaults
    setTheme(DEFAULTS.theme);
    setLanguage(DEFAULTS.language);
    setStartupBehavior(DEFAULTS.startupBehavior);
    setAutosaveEnabled(DEFAULTS.autosaveEnabled);
    setAutosaveInterval(DEFAULTS.autosaveInterval);
    setDefaultCutDuration(DEFAULTS.defaultCutDuration);
    setPreviewQuality(DEFAULTS.previewQuality);
    setDefaultPlaybackRate(DEFAULTS.defaultPlaybackRate);
    setShowThumbnails(DEFAULTS.showThumbnails);
    setTrashRetention(DEFAULTS.trashRetention);
    setAutoEmptyTrash(DEFAULTS.autoEmptyTrash);
    setSnapshotEnabled(DEFAULTS.snapshotEnabled);
    setSnapshotMaxCount(DEFAULTS.snapshotMaxCount);
    setSnapshotOnSave(DEFAULTS.snapshotOnSave);
    setHardwareAcceleration(DEFAULTS.hardwareAcceleration);
    setDebugMode(DEFAULTS.debugMode);
    setVerboseLogging(DEFAULTS.verboseLogging);

    // Reset thumbnail cache settings from current stats
    setMaxMb(Math.round(stats.limits.maxBytes / MB));
    setMaxItems(stats.limits.maxItems);

    // Reset changes flag
    setHasChanges(false);

    // Load FFmpeg limits from API
    let active = true;
    const loadFfmpegLimits = async () => {
      const limits = await getFfmpegLimitsBridge();
      if (!limits) return;
      if (!active) return;
      setStderrMaxKb(Math.round(limits.stderrMaxBytes / KB));
      setMaxClipSeconds(limits.maxClipSeconds);
      setMaxTotalSeconds(limits.maxTotalSeconds);
      setMaxClipMb(Math.round(limits.maxClipBytes / MB));
      setMaxTotalMb(Math.round(limits.maxTotalBytes / MB));
    };
    loadFfmpegLimits();

    return () => {
      active = false;
    };
  }, [open, stats.limits.maxBytes, stats.limits.maxItems]);

  // Track changes
  const handleChange = useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (value: T) => {
      setter(value);
      setHasChanges(true);
    };
  }, []);

  const handleClearCache = useCallback(() => {
    clearThumbnailCache();
    setHasChanges(true);
  }, []);

  const handleEmptyTrash = useCallback(() => {
    // TODO: Implement trash emptying
    console.log('Empty trash');
  }, []);

  const handleForceRecovery = useCallback(() => {
    // TODO: Implement force recovery from project data
    console.log('Force recovery from project data');
  }, []);

  const handleSave = useCallback(() => {
    // Save thumbnail cache settings
    const safeMb = Number.isFinite(maxMb) ? Math.max(1, Math.floor(maxMb)) : 1;
    const safeItems = Number.isFinite(maxItems) ? Math.max(1, Math.floor(maxItems)) : 1;
    setThumbnailCacheLimits({
      maxBytes: safeMb * MB,
      maxItems: safeItems,
    });

    // Save FFmpeg settings
    const safeStderrKb = Number.isFinite(stderrMaxKb) ? Math.max(1, Math.floor(stderrMaxKb)) : 1;
    const safeClipSeconds = Number.isFinite(maxClipSeconds) ? Math.max(1, Math.floor(maxClipSeconds)) : 1;
    const safeTotalSeconds = Number.isFinite(maxTotalSeconds) ? Math.max(1, Math.floor(maxTotalSeconds)) : 1;
    const safeClipMb = Number.isFinite(maxClipMb) ? Math.max(1, Math.floor(maxClipMb)) : 1;
    const safeTotalMb = Number.isFinite(maxTotalMb) ? Math.max(1, Math.floor(maxTotalMb)) : 1;

    void setFfmpegLimitsBridge({
      stderrMaxBytes: safeStderrKb * KB,
      maxClipSeconds: safeClipSeconds,
      maxTotalSeconds: safeTotalSeconds,
      maxClipBytes: safeClipMb * MB,
      maxTotalBytes: safeTotalMb * MB,
    });

    setHasChanges(false);
    onClose();
  }, [
    maxMb,
    maxItems,
    stderrMaxKb,
    maxClipSeconds,
    maxTotalSeconds,
    maxClipMb,
    maxTotalMb,
    onClose,
  ]);

  const handleResetDefaults = useCallback(() => {
    // Reset to default values using DEFAULTS constant
    setTheme(DEFAULTS.theme);
    setLanguage(DEFAULTS.language);
    setStartupBehavior(DEFAULTS.startupBehavior);
    setAutosaveEnabled(DEFAULTS.autosaveEnabled);
    setAutosaveInterval(DEFAULTS.autosaveInterval);
    setDefaultCutDuration(DEFAULTS.defaultCutDuration);
    setPreviewQuality(DEFAULTS.previewQuality);
    setDefaultPlaybackRate(DEFAULTS.defaultPlaybackRate);
    setShowThumbnails(DEFAULTS.showThumbnails);
    setTrashRetention(DEFAULTS.trashRetention);
    setAutoEmptyTrash(DEFAULTS.autoEmptyTrash);
    setSnapshotEnabled(DEFAULTS.snapshotEnabled);
    setSnapshotMaxCount(DEFAULTS.snapshotMaxCount);
    setSnapshotOnSave(DEFAULTS.snapshotOnSave);
    setMaxMb(DEFAULTS.maxMb);
    setMaxItems(DEFAULTS.maxItems);
    setStderrMaxKb(DEFAULTS.stderrMaxKb);
    setMaxClipSeconds(DEFAULTS.maxClipSeconds);
    setMaxTotalSeconds(DEFAULTS.maxTotalSeconds);
    setMaxClipMb(DEFAULTS.maxClipMb);
    setMaxTotalMb(DEFAULTS.maxTotalMb);
    setHardwareAcceleration(DEFAULTS.hardwareAcceleration);
    setDebugMode(DEFAULTS.debugMode);
    setVerboseLogging(DEFAULTS.verboseLogging);
    setHasChanges(true);
  }, []);

  if (!open) return null;

  const currentBytesMb = Math.round(stats.bytes / MB);
  const versions = getVersionsBridge();

  return (
    <Overlay onClick={onClose} blur>
      <Container size="lg">
        <Header
          title="Settings"
          icon={<Settings size={22} />}
          iconVariant="info"
          onClose={onClose}
        />

        <div className={styles.tabsWrapper}>
          <Tabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as SettingsTab)}
            variant="underline"
          />
        </div>

        <Body className={styles.body}>
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className={styles.tabContent}>
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Cog size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Application Settings</span>
                </div>

                <div className={styles.panelContent}>
                  {/* Appearance subsection */}
                  <div className={styles.subsectionHeader}>
                    <Palette size={14} />
                    <span>Appearance</span>
                  </div>

                  <SettingsRow
                    label="Theme"
                    description="Application color scheme"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Select
                      value={theme}
                      options={THEME_OPTIONS}
                      onChange={(v) => handleChange(setTheme)(v as ThemeMode)}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Language"
                    description="Display language"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Select
                      value={language}
                      options={LANGUAGE_OPTIONS}
                      onChange={(v) => handleChange(setLanguage)(v as LanguageCode)}
                    />
                  </SettingsRow>

                  {/* Startup subsection */}
                  <div className={styles.subsectionHeader}>
                    <Monitor size={14} />
                    <span>Startup</span>
                  </div>

                  <SettingsRow
                    label="On Launch"
                    description="What to show when app starts"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Select
                      value={startupBehavior}
                      options={STARTUP_OPTIONS}
                      onChange={(v) => handleChange(setStartupBehavior)(v as StartupBehavior)}
                    />
                  </SettingsRow>
                </div>
              </div>
            </div>
          )}

          {/* Editor Tab */}
          {activeTab === 'editor' && (
            <div className={styles.tabContent}>
              {/* Save & History Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Save size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Save & History</span>
                </div>

                <div className={styles.panelContent}>
                  {/* Autosave */}
                  <SettingsRow
                    label="Auto Save"
                    description="Automatically save changes"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={autosaveEnabled}
                      onChange={handleChange(setAutosaveEnabled)}
                      size="sm"
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Save Interval"
                    description="Seconds between saves"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    data-disabled={!autosaveEnabled}
                    controlsClassName=""
                  >
                    <InputGroup
                      unit="sec"
                      className={styles.inputWithUnit}
                      inputClassName={styles.numberInput}
                      unitClassName={styles.inputUnit}
                      type="number"
                      value={autosaveInterval}
                      onChange={(e) => handleChange(setAutosaveInterval)(Number(e.target.value))}
                      min={5}
                      max={300}
                      step={5}
                      disabled={!autosaveEnabled}
                    />
                  </SettingsRow>

                  <div className={styles.divider} />

                  {/* Snapshots */}
                  <div className={styles.subsectionHeader}>
                    <History size={14} />
                    <span>Version Snapshots</span>
                  </div>

                  <SettingsRow
                    label="Enable Snapshots"
                    description="Keep version history of project"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={snapshotEnabled}
                      onChange={handleChange(setSnapshotEnabled)}
                      size="sm"
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="On Save"
                    description="Create snapshot when saving"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    data-disabled={!snapshotEnabled}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={snapshotOnSave}
                      onChange={handleChange(setSnapshotOnSave)}
                      size="sm"
                      disabled={!snapshotEnabled}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Max Snapshots"
                    description="Number of snapshots to keep"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    data-disabled={!snapshotEnabled}
                    controlsClassName={styles.rowControls}
                  >
                    <Select
                      value={snapshotMaxCount}
                      options={SNAPSHOT_COUNT_OPTIONS}
                      onChange={handleChange(setSnapshotMaxCount)}
                      disabled={!snapshotEnabled}
                    />
                  </SettingsRow>
                </div>
              </div>

              {/* Preview & Defaults Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Play size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Playback & Defaults</span>
                </div>

                <div className={styles.panelContent}>
                  <SettingsRow
                    label="Preview Quality"
                    description="Video preview rendering quality"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Select
                      value={previewQuality}
                      options={PREVIEW_QUALITY_OPTIONS}
                      onChange={(v) => handleChange(setPreviewQuality)(v as PreviewQuality)}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Playback Speed"
                    description="Default playback rate"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Select
                      value={defaultPlaybackRate}
                      options={PLAYBACK_RATE_OPTIONS}
                      onChange={handleChange(setDefaultPlaybackRate)}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Show Thumbnails"
                    description="Display thumbnails in timeline"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={showThumbnails}
                      onChange={handleChange(setShowThumbnails)}
                      size="sm"
                    />
                  </SettingsRow>

                  <div className={styles.divider} />

                  <div className={styles.subsectionHeader}>
                    <ImageIcon size={14} />
                    <span>Defaults</span>
                  </div>

                  <SettingsRow
                    label="Cut Duration"
                    description="Default duration for image cuts"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName=""
                  >
                    <InputGroup
                      unit="sec"
                      className={styles.inputWithUnit}
                      inputClassName={styles.numberInput}
                      unitClassName={styles.inputUnit}
                      type="number"
                      value={defaultCutDuration}
                      onChange={(e) => handleChange(setDefaultCutDuration)(Number(e.target.value))}
                      min={0.5}
                      max={30}
                      step={0.5}
                    />
                  </SettingsRow>
                </div>
              </div>

              {/* Trash Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Trash2 size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Trash</span>
                </div>

                <div className={styles.panelContent}>
                  <SettingsRow
                    label="Auto Empty"
                    description="Automatically delete old items"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={autoEmptyTrash}
                      onChange={handleChange(setAutoEmptyTrash)}
                      size="sm"
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Retention Period"
                    description="Days before permanent deletion"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    data-disabled={!autoEmptyTrash}
                    controlsClassName={styles.rowControls}
                  >
                    <Select
                      value={trashRetention}
                      options={TRASH_RETENTION_OPTIONS}
                      onChange={handleChange(setTrashRetention)}
                      disabled={!autoEmptyTrash}
                    />
                  </SettingsRow>

                  <div className={styles.actionRow}>
                    <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={handleEmptyTrash}>
                      <Trash2 size={14} />
                      Empty Trash Now
                    </UtilityButton>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === 'performance' && (
            <div className={styles.tabContent}>
              {/* Thumbnail Cache Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Database size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Thumbnail Cache</span>
                </div>

                <div className={styles.panelContent}>
                  <div className={styles.statsRow}>
                    <StatDisplay label="Items" value={stats.items} />
                    <StatDisplay label="Size" value={currentBytesMb} unit="MB" />
                  </div>

                  <SettingsRow
                    label="Max Cache Size"
                    description="Maximum memory usage"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName=""
                  >
                    <InputGroup
                      unit="MB"
                      className={styles.inputWithUnit}
                      inputClassName={styles.numberInput}
                      unitClassName={styles.inputUnit}
                      type="number"
                      value={maxMb}
                      onChange={(e) => handleChange(setMaxMb)(Number(e.target.value))}
                      min={1}
                      max={512}
                      step={8}
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Max Items"
                    description="Maximum cached thumbnails"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName=""
                  >
                    <InputGroup
                      unit="items"
                      className={styles.inputWithUnit}
                      inputClassName={styles.numberInput}
                      unitClassName={styles.inputUnit}
                      type="number"
                      value={maxItems}
                      onChange={(e) => handleChange(setMaxItems)(Number(e.target.value))}
                      min={10}
                      max={1000}
                      step={10}
                    />
                  </SettingsRow>

                  <div className={styles.actionRow}>
                    <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={handleClearCache}>
                      <HardDrive size={14} />
                      Clear Cache
                    </UtilityButton>
                  </div>
                </div>
              </div>

              {/* Processing Limits Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Film size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Processing Limits</span>
                </div>

                <div className={styles.panelContent}>
                  <SettingsRow
                    label="Hardware Acceleration"
                    description="Use GPU for encoding"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={hardwareAcceleration}
                      onChange={handleChange(setHardwareAcceleration)}
                      size="sm"
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Log Buffer"
                    description="FFmpeg stderr buffer size"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName=""
                  >
                    <InputGroup
                      unit="KB"
                      className={styles.inputWithUnit}
                      inputClassName={styles.numberInput}
                      unitClassName={styles.inputUnit}
                      type="number"
                      value={stderrMaxKb}
                      onChange={(e) => handleChange(setStderrMaxKb)(Number(e.target.value))}
                      min={16}
                      max={1024}
                      step={16}
                    />
                  </SettingsRow>

                  <div className={styles.divider} />

                  <div className={styles.subsectionHeader}>
                    <Clock size={14} />
                    <span>PCM Audio Limits</span>
                  </div>

                  <div className={styles.twoColumnGrid}>
                    <div className={styles.compactRow}>
                      <span className={styles.compactLabel}>Per-Clip Duration</span>
                      <InputGroup
                        unit="sec"
                        className={styles.inputWithUnit}
                        inputClassName={styles.numberInput}
                        unitClassName={styles.inputUnit}
                        type="number"
                        value={maxClipSeconds}
                        onChange={(e) => handleChange(setMaxClipSeconds)(Number(e.target.value))}
                        min={10}
                        max={600}
                        step={10}
                      />
                    </div>

                    <div className={styles.compactRow}>
                      <span className={styles.compactLabel}>Per-Clip Size</span>
                      <InputGroup
                        unit="MB"
                        className={styles.inputWithUnit}
                        inputClassName={styles.numberInput}
                        unitClassName={styles.inputUnit}
                        type="number"
                        value={maxClipMb}
                        onChange={(e) => handleChange(setMaxClipMb)(Number(e.target.value))}
                        min={8}
                        max={256}
                        step={8}
                      />
                    </div>

                    <div className={styles.compactRow}>
                      <span className={styles.compactLabel}>Total Duration</span>
                      <InputGroup
                        unit="min"
                        className={styles.inputWithUnit}
                        inputClassName={styles.numberInput}
                        unitClassName={styles.inputUnit}
                        type="number"
                        value={Math.round(maxTotalSeconds / 60)}
                        onChange={(e) => handleChange(setMaxTotalSeconds)(Number(e.target.value) * 60)}
                        min={1}
                        max={60}
                        step={1}
                      />
                    </div>

                    <div className={styles.compactRow}>
                      <span className={styles.compactLabel}>Total Size</span>
                      <InputGroup
                        unit="MB"
                        className={styles.inputWithUnit}
                        inputClassName={styles.numberInput}
                        unitClassName={styles.inputUnit}
                        type="number"
                        value={maxTotalMb}
                        onChange={(e) => handleChange(setMaxTotalMb)(Number(e.target.value))}
                        min={64}
                        max={1024}
                        step={64}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === 'advanced' && (
            <div className={styles.tabContent}>
              {/* Developer Options Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Code size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Developer</span>
                </div>

                <div className={styles.panelContent}>
                  <SettingsRow
                    label="Debug Mode"
                    description="Show debug information"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={debugMode}
                      onChange={handleChange(setDebugMode)}
                      size="sm"
                    />
                  </SettingsRow>

                  <SettingsRow
                    label="Verbose Logging"
                    description="Enable detailed logs"
                    className={styles.settingsRow}
                    labelWrapperClassName={styles.rowInfo}
                    labelClassName={styles.rowLabel}
                    descriptionClassName={styles.rowDesc}
                    controlsClassName={styles.rowControls}
                  >
                    <Toggle
                      checked={verboseLogging}
                      onChange={handleChange(setVerboseLogging)}
                      size="sm"
                    />
                  </SettingsRow>

                  {onOpenNotificationTests && (
                    <SettingsRow
                      label="Notification Tests"
                      description="Open notification test tools"
                      className={styles.settingsRow}
                      labelWrapperClassName={styles.rowInfo}
                      labelClassName={styles.rowLabel}
                      descriptionClassName={styles.rowDesc}
                      controlsClassName={styles.rowControls}
                    >
                      <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={onOpenNotificationTests}>
                        <Bell size={14} />
                        Open Tests
                      </UtilityButton>
                    </SettingsRow>
                  )}
                </div>
              </div>

              {/* Maintenance Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <HardDrive size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>Maintenance</span>
                </div>

                <div className={styles.panelContent}>
                  <div className={styles.warningBox}>
                    <AlertTriangle size={14} />
                    <span>Recovery will overwrite current project state</span>
                  </div>

                  <div className={styles.actionButtonsRow}>
                    <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={handleForceRecovery}>
                      <Download size={14} />
                      Force Recovery
                    </UtilityButton>
                    <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={handleResetDefaults}>
                      <RotateCcw size={14} />
                      Reset to Defaults
                    </UtilityButton>
                  </div>
                </div>
              </div>

              {/* About Panel */}
              <div className={styles.settingsPanel}>
                <div className={styles.panelHeader}>
                  <Info size={14} className={styles.panelHeaderIcon} />
                  <span className={styles.panelHeaderTitle}>About</span>
                </div>

                <div className={styles.panelContent}>
                  <div className={styles.aboutGrid}>
                    <span className={styles.aboutLabel}>Application</span>
                    <span className={styles.aboutValue}>Scene Deck Builder</span>
                    <span className={styles.aboutLabel}>Version</span>
                    <span className={styles.aboutValue}>1.0.0</span>
                    <span className={styles.aboutLabel}>Electron</span>
                    <span className={styles.aboutValue}>{versions?.electron || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Body>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {hasChanges && (
              <span className={styles.unsavedBadge}>
                <span className={styles.unsavedDot} />
                Unsaved changes
              </span>
            )}
          </div>
          <div className={styles.footerActions}>
            <Button variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" className={styles.saveBtn} onClick={handleSave}>
              <Check size={16} />
              Save Settings
            </Button>
          </div>
        </div>
      </Container>
    </Overlay>
  );
}
