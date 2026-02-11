/**
 * ExportModal - Sequence export settings modal (Redesigned)
 */

import { useState, useMemo, useCallback } from 'react';
import { Download, FileText, Film, Settings, Layers, Clock, Check } from 'lucide-react';
import {
  Overlay,
  Container,
  Header,
  Body,
  useModalKeyboard,
} from '../ui/primitives/Modal';
import { SettingsRow } from '../ui';
import { useStore } from '../store/useStore';
import type { EncodingQuality, ExportFormat, ExportSettings, RoundingMode } from '../features/export/types';
import styles from './ExportModal.module.css';

export interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  onExport: (settings: ExportSettings) => void;
}

export default function ExportModal({ open, onClose, onExport }: ExportModalProps) {
  const { scenes, vaultPath } = useStore();

  const [format, setFormat] = useState<ExportFormat>('aviutl');
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('round');
  const [copyMedia, setCopyMedia] = useState(true);
  const [mp4Quality] = useState<EncodingQuality>('medium');

  // Generate default output path
  const defaultOutputPath = useMemo(() => {
    if (!vaultPath) return '';
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const folder = format === 'aviutl' ? 'aviutl' : 'video';
    return `${vaultPath}/exports/${folder}_${timestamp}`.replace(/\\/g, '/');
  }, [vaultPath, format]);

  const [outputPath, setOutputPath] = useState(defaultOutputPath);

  useMemo(() => {
    setOutputPath(defaultOutputPath);
  }, [defaultOutputPath]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const sceneCount = scenes.length;
    const cutCount = scenes.reduce((acc, s) => acc + s.cuts.length, 0);
    const totalDuration = scenes.reduce(
      (acc, s) => acc + s.cuts.reduce((cutAcc, c) => cutAcc + c.displayTime, 0),
      0
    );
    return { sceneCount, cutCount, totalDuration };
  }, [scenes]);

  useModalKeyboard({ onEscape: onClose, enabled: open });

  const handleChangePath = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.selectFolder();
    if (result?.path) {
      setOutputPath(result.path.replace(/\\/g, '/'));
    }
  }, []);

  const handleExport = useCallback(() => {
    const settings: ExportSettings = {
      format,
      outputPath: outputPath || defaultOutputPath,
      aviutl: { roundingMode, copyMedia },
      mp4: { quality: mp4Quality },
    };
    onExport(settings);
  }, [format, outputPath, defaultOutputPath, roundingMode, copyMedia, mp4Quality, onExport]);

  if (!open) return null;

  return (
    <Overlay onClick={onClose} blur>
      <Container size="md">
        <Header
          title="Export Sequence"
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
              data-selected={format === 'aviutl'}
              onClick={() => setFormat('aviutl')}
            >
              <div className={styles.formatCardIcon}>
                <FileText size={24} />
              </div>
              <span className={styles.formatCardTitle}>AviUtl</span>
              <span className={styles.formatCardDesc}>Export as .exo project</span>
            </button>

            <button
              type="button"
              className={styles.formatCard}
              data-selected={format === 'mp4'}
              data-disabled="true"
              onClick={() => {}}
            >
              <span className={styles.formatCardBadge}>Coming Soon</span>
              <div className={styles.formatCardIcon}>
                <Film size={24} />
              </div>
              <span className={styles.formatCardTitle}>MP4 Video</span>
              <span className={styles.formatCardDesc}>Export as video file</span>
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
                label="Output Folder"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.pathFieldInline}
              >
                <span className={styles.pathDisplay} title={outputPath || defaultOutputPath}>
                  {outputPath || defaultOutputPath}
                </span>
                <button
                  type="button"
                  className={styles.pathChangeBtn}
                  onClick={handleChangePath}
                >
                  Change
                </button>
              </SettingsRow>

              {/* Project Settings (read-only) */}
              <SettingsRow
                label="Resolution"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.settingsValueMuted}
              >
                1920 × 1080
              </SettingsRow>

              <SettingsRow
                label="Frame Rate"
                className={styles.settingsRow}
                labelWrapperClassName=""
                labelClassName={styles.settingsLabel}
                controlsClassName={styles.settingsValueMuted}
              >
                30 fps
              </SettingsRow>
            </div>

            {/* Format-specific Options */}
            <div className={styles.settingsContent}>
              {/* AviUtl Options */}
              <div className={format !== 'aviutl' ? styles.formatOptionsDisabled : ''}>
                <div className={styles.formatOptionsHeader}>
                  <FileText size={14} className={styles.formatOptionsIcon} />
                  <span className={styles.formatOptionsTitle}>AviUtl Options</span>
                </div>

                <div className={styles.formatOptionsContent}>
                  <div className={styles.optionRow}>
                    <span className={styles.optionLabel}>Frame Rounding</span>
                    <div className={styles.radioPills}>
                      {(['round', 'floor', 'ceil'] as RoundingMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={styles.radioPill}
                          data-selected={roundingMode === mode}
                          onClick={() => setRoundingMode(mode)}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.optionRow}>
                    <span className={styles.optionLabel}>Media Files</span>
                    <label className={styles.checkboxInline}>
                      <span
                        className={styles.checkboxBox}
                        data-checked={copyMedia}
                        onClick={() => setCopyMedia(!copyMedia)}
                      />
                      <span className={styles.checkboxLabel}>Copy to media/ folder</span>
                    </label>
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
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleExport}
              disabled={stats.cutCount === 0}
            >
              <Check size={16} />
              Export
            </button>
          </div>
        </div>
      </Container>
    </Overlay>
  );
}
