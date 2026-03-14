/**
 * ExportModal - Sequence export settings modal (Redesigned)
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Download, FileText, Film, Settings, Layers, Clock, Check } from 'lucide-react';
import {
  Overlay,
  Container,
  Header,
  Body,
  useModalKeyboard,
} from '../ui/primitives/Modal';
import { Button, Checkbox, Input, RadioGroup, Select, SettingsRow } from '../ui';
import { useStore } from '../store/useStore';
import type { EncodingQuality, ExportSettings, ExportRange } from '../features/export/types';
import { DEFAULT_EXPORT_FPS } from '../features/export/plan';
import { DEFAULT_EXPORT_RESOLUTION } from '../constants/export';
import styles from './ExportModal.module.css';

export interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  initialResolution?: { width: number; height: number };
  title?: string;
  subtitle?: string;
  initialOutputRootPath?: string;
  initialOutputFolderName?: string;
  initialRange?: ExportRange;
  rangeLocked?: boolean;
  statsOverride?: {
    sceneCount: number;
    cutCount: number;
    totalDuration: number;
  };
  onExport: (settings: ExportSettings) => void;
}

const RESOLUTION_OPTIONS = [
  { value: '1920x1080', label: 'FHD (1920×1080)' },
  { value: '1280x720', label: 'HD (1280×720)' },
  { value: '3840x2160', label: '4K (3840×2160)' },
  { value: '640x480', label: 'SD (640×480)' },
  { value: 'custom', label: 'Custom' },
];

const FPS_OPTIONS = [
  { value: '24', label: '24 fps' },
  { value: '30', label: '30 fps' },
  { value: '60', label: '60 fps' },
];

export default function ExportModal({
  open,
  onClose,
  initialResolution,
  title = 'Export Sequence',
  subtitle,
  initialOutputRootPath,
  initialOutputFolderName,
  initialRange = 'all',
  rangeLocked = false,
  statsOverride,
  onExport,
}: ExportModalProps) {
  const { scenes, vaultPath } = useStore();
  const initialWidth = initialResolution?.width && initialResolution.width > 0
    ? initialResolution.width
    : DEFAULT_EXPORT_RESOLUTION.width;
  const initialHeight = initialResolution?.height && initialResolution.height > 0
    ? initialResolution.height
    : DEFAULT_EXPORT_RESOLUTION.height;

  const [mp4Quality, setMp4Quality] = useState<EncodingQuality>('medium');
  const [exportMasterWithAudio, setExportMasterWithAudio] = useState(false);
  const [range, setRange] = useState<ExportRange>(initialRange);
  const [fps, setFps] = useState<string>(String(DEFAULT_EXPORT_FPS));
  const [resolutionPreset, setResolutionPreset] = useState<string>(() => {
    const key = `${initialWidth}x${initialHeight}`;
    return RESOLUTION_OPTIONS.some((option) => option.value === key) ? key : 'custom';
  });
  const [customWidth, setCustomWidth] = useState<string>(() => String(initialWidth));
  const [customHeight, setCustomHeight] = useState<string>(() => String(initialHeight));

  const defaultOutputRoot = useMemo(() => {
    if (initialOutputRootPath && initialOutputRootPath.trim().length > 0) {
      return initialOutputRootPath.replace(/\\/g, '/');
    }
    if (!vaultPath) return '';
    return `${vaultPath}/export`.replace(/\\/g, '/');
  }, [initialOutputRootPath, vaultPath]);
  const defaultFolderName = useMemo(() => {
    if (initialOutputFolderName && initialOutputFolderName.trim().length > 0) {
      return initialOutputFolderName.trim();
    }
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    return `export_${timestamp}`;
  }, [initialOutputFolderName]);
  const [outputFolderName, setOutputFolderName] = useState(defaultFolderName);

  // Calculate summary stats
  const stats = useMemo(() => {
    const sceneCount = scenes.length;
    const cutCount = scenes.reduce((acc, s) => acc + s.cuts.length, 0);
    const totalDuration = scenes.reduce(
      (acc, s) => acc + s.cuts.reduce((cutAcc, c) => cutAcc + c.displayTime, 0),
      0
    );
    return statsOverride ?? { sceneCount, cutCount, totalDuration };
  }, [scenes, statsOverride]);

  useModalKeyboard({ onEscape: onClose, enabled: open });

  useEffect(() => {
    if (!open) return;

    const key = `${initialWidth}x${initialHeight}`;

    setMp4Quality('medium');
    setExportMasterWithAudio(false);
    setRange(initialRange);
    setFps(String(DEFAULT_EXPORT_FPS));
    setResolutionPreset(RESOLUTION_OPTIONS.some((option) => option.value === key) ? key : 'custom');
    setCustomWidth(String(initialWidth));
    setCustomHeight(String(initialHeight));
    setOutputFolderName(defaultFolderName);
  }, [open, initialWidth, initialHeight, initialRange, defaultFolderName]);

  const handleExport = useCallback(() => {
    const parseIntOrDefault = (value: string, fallback: number) => {
      const n = parseInt(value, 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const resolution = resolutionPreset === 'custom'
      ? {
          width: parseIntOrDefault(customWidth, DEFAULT_EXPORT_RESOLUTION.width),
          height: parseIntOrDefault(customHeight, DEFAULT_EXPORT_RESOLUTION.height),
        }
      : (() => {
          const [w, h] = resolutionPreset.split('x');
          return {
            width: parseIntOrDefault(w, DEFAULT_EXPORT_RESOLUTION.width),
            height: parseIntOrDefault(h, DEFAULT_EXPORT_RESOLUTION.height),
          };
        })();
    const settings: ExportSettings = {
      format: 'mp4',
      outputRootPath: defaultOutputRoot,
      outputFolderName: outputFolderName.trim() || defaultFolderName,
      resolution,
      fps: parseIntOrDefault(fps, DEFAULT_EXPORT_FPS),
      range,
      mp4: {
        quality: mp4Quality,
        exportMasterWithAudio,
      },
    };
    onExport(settings);
  }, [
    defaultOutputRoot,
    outputFolderName,
    defaultFolderName,
    fps,
    range,
    resolutionPreset,
    customWidth,
    customHeight,
    mp4Quality,
    exportMasterWithAudio,
    onExport,
  ]);

  if (!open) return null;

  return (
    <Overlay onClick={onClose} blur>
      <Container size="md">
        <Header
          title={title}
          subtitle={subtitle}
          icon={<Download size={22} />}
          iconVariant="info"
          onClose={onClose}
        />

        <Body>
          {/* Format Selection Cards */}
          <div className={styles.formatCards}>
            <button
              type="button"
              className={styles.formatCard}
              data-selected="true"
              onClick={() => {}}
            >
              <span className={styles.formatCardBadge}>Active</span>
              <div className={styles.formatCardIcon}>
                <Film size={24} />
              </div>
              <span className={styles.formatCardTitle}>MP4 Video</span>
              <span className={styles.formatCardDesc}>Export as video file</span>
            </button>

            <button
              type="button"
              className={styles.formatCard}
              data-selected={false}
              data-disabled="true"
              onClick={() => {}}
            >
              <span className={styles.formatCardBadge}>Placeholder</span>
              <div className={styles.formatCardIcon}>
                <FileText size={24} />
              </div>
              <span className={styles.formatCardTitle}>Placeholder</span>
              <span className={styles.formatCardDesc}>Reserved for future export format</span>
            </button>
          </div>

          {/* Settings Panel */}
          <div className={styles.settingsPanel}>
            <div className={styles.settingsHeader}>
              <Settings size={14} className={styles.settingsHeaderIcon} />
              <span className={styles.settingsHeaderTitle}>Settings</span>
            </div>

            <div className={styles.settingsContent}>
              {/* Output Path */}
              <SettingsRow
                label="Output Root"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.pathFieldInline}
              >
                <span className={styles.pathDisplay} title={defaultOutputRoot}>
                  {defaultOutputRoot}
                </span>
              </SettingsRow>

              <SettingsRow
                label="Folder Name"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.pathFieldInline}
              >
                <Input
                  value={outputFolderName}
                  onChange={(e) => setOutputFolderName(e.target.value)}
                  placeholder={defaultFolderName}
                />
              </SettingsRow>

              <SettingsRow
                label="Resolution"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.pathFieldInline}
              >
                <Select
                  value={resolutionPreset}
                  options={RESOLUTION_OPTIONS}
                  onChange={setResolutionPreset}
                />
                {resolutionPreset === 'custom' && (
                  <>
                    <Input
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      placeholder="1280"
                    />
                    <span className={styles.settingsValueMuted}>×</span>
                    <Input
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      placeholder="720"
                    />
                  </>
                )}
              </SettingsRow>

              <SettingsRow
                label="Frame Rate"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.pathFieldInline}
              >
                <Select
                  value={fps}
                  options={FPS_OPTIONS}
                  onChange={setFps}
                />
              </SettingsRow>

              <SettingsRow
                label="Range"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.pathFieldInline}
              >
                <RadioGroup
                  name="export-range"
                  value={range}
                  direction="horizontal"
                  options={rangeLocked
                    ? [{ value: 'selection', label: 'Selection' }]
                    : [
                        { value: 'all', label: 'All Cuts' },
                        { value: 'selection', label: 'Selection' },
                      ]}
                  onChange={(value) => setRange(value as ExportRange)}
                />
              </SettingsRow>
            </div>

            {/* Format-specific Options */}
            <div className={styles.settingsContent}>
              {/* MP4 Options */}
              <div>
                <div className={styles.formatOptionsHeader}>
                  <Film size={14} className={styles.formatOptionsIcon} />
                  <span className={styles.formatOptionsTitle}>MP4 Options</span>
                </div>

                <div className={styles.formatOptionsContent}>
                  <div className={styles.optionRow}>
                    <span className={styles.optionLabel}>Quality</span>
                    <div className={styles.radioPills}>
                      {(['low', 'medium', 'high'] as EncodingQuality[]).map((quality) => (
                        <button
                          key={quality}
                          type="button"
                          className={styles.radioPill}
                          data-selected={mp4Quality === quality}
                          onClick={() => setMp4Quality(quality)}
                        >
                          {quality.charAt(0).toUpperCase() + quality.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`${styles.optionRow} ${styles.optionRowTop}`}>
                    <span className={styles.optionLabel}>Master MP4</span>
                    <Checkbox
                      checked={exportMasterWithAudio}
                      onChange={setExportMasterWithAudio}
                      className={styles.optionCheckbox}
                      label="Adds an MP4 with audio."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Body>

        {/* Footer with Summary */}
        <div className={styles.exportFooter}>
          <div className={styles.footerSummary}>
            <div className={styles.summaryItem}>
              <Layers size={14} />
              <span><strong>{stats.sceneCount}</strong> scenes</span>
            </div>
            <div className={styles.summaryItem}>
              <Clock size={14} />
              <span><strong>{stats.totalDuration.toFixed(1)}s</strong> total</span>
            </div>
            <div className={styles.summaryItem}>
              <Film size={14} />
              <span><strong>{stats.cutCount}</strong> cuts</span>
            </div>
          </div>

          <div className={styles.footerActions}>
            <Button variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="lg"
              className={styles.exportBtn}
              onClick={handleExport}
              disabled={stats.cutCount === 0}
            >
              <Check size={16} />
              Export
            </Button>
          </div>
        </div>
      </Container>
    </Overlay>
  );
}
