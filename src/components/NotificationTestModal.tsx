/**
 * NotificationTestModal - Developer tool for testing UI notifications
 */

import { useCallback, useState } from 'react';
import { Bell, Info, AlertTriangle, Zap } from 'lucide-react';
import {
  UtilityButton,
  Overlay,
  Container,
  Header,
  Body,
  SettingsRow,
  useModalKeyboard,
  useToast,
  useDialog,
  useBanner,
  useMiniToast,
} from '../ui';
import styles from './NotificationTestModal.module.css';

export interface NotificationTestModalProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationTestModal({ open, onClose }: NotificationTestModalProps) {
  useModalKeyboard({ onEscape: onClose, enabled: open });

  const { toast } = useToast();
  const { alert, confirm } = useDialog();
  const { banner } = useBanner();
  const { show: showMiniToast, dismiss: dismissMiniToast, element: miniToastElement } = useMiniToast();

  const [progressBannerId, setProgressBannerId] = useState<string | null>(null);
  const [progressValue, setProgressValue] = useState(0);
  const [persistentToastId, setPersistentToastId] = useState<string | null>(null);
  const [lastBannerId, setLastBannerId] = useState<string | null>(null);

  const handleConfirmResult = useCallback(
    async (variant: 'default' | 'warning' | 'danger' | 'info') => {
      const confirmed = await confirm({
        title: variant === 'danger' ? 'Delete Project' : 'Apply Changes',
        message:
          variant === 'danger'
            ? 'This action cannot be undone.'
            : 'Continue with the selected operation?',
        variant,
        targetName: variant === 'danger' ? 'scene_deck_project.sd' : undefined,
        confirmLabel: variant === 'danger' ? 'Delete' : 'Confirm',
      });

      if (confirmed) {
        toast.success('Confirmed', 'Test confirm was accepted.');
      } else {
        toast.info('Cancelled', 'Test confirm was cancelled.');
      }
    },
    [confirm, toast]
  );

  const handleStartProgressBanner = useCallback(() => {
    const nextValue = 20;
    const id = banner.show({
      variant: 'progress',
      message: 'Syncing assets...',
      progress: nextValue,
      icon: 'sync',
      dismissible: true,
    });
    setProgressBannerId(id);
    setProgressValue(nextValue);
  }, [banner]);

  const handleAdvanceProgressBanner = useCallback(() => {
    if (!progressBannerId) {
      handleStartProgressBanner();
      return;
    }

    const nextValue = Math.min(progressValue + 20, 100);
    banner.update(progressBannerId, {
      progress: nextValue,
      message: nextValue >= 100 ? 'Sync complete' : `Syncing assets... ${nextValue}%`,
      variant: nextValue >= 100 ? 'info' : 'progress',
      icon: nextValue >= 100 ? 'info' : 'sync',
      dismissible: true,
    });
    setProgressValue(nextValue);

    if (nextValue >= 100) {
      setProgressBannerId(null);
      setProgressValue(0);
    }
  }, [banner, progressBannerId, progressValue, handleStartProgressBanner]);

  const handleDismissProgressBanner = useCallback(() => {
    if (!progressBannerId) return;
    banner.dismiss(progressBannerId);
    setProgressBannerId(null);
    setProgressValue(0);
  }, [banner, progressBannerId]);

  if (!open) return null;

  return (
    <Overlay onClick={onClose} blur>
      <Container size="md">
        <Header
          title="Notification Tests"
          subtitle="Developer tools for UI feedback"
          icon={<Bell size={20} />}
          iconVariant="info"
          onClose={onClose}
        />

        <Body className={styles.body}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <Info size={14} className={styles.panelHeaderIcon} />
              <span className={styles.panelHeaderTitle}>Toasts</span>
            </div>
            <div className={styles.panelContent}>
              <SettingsRow
                label="Variants"
                description="Success, info, warning, error"
                className={styles.settingsRow}
                labelWrapperClassName={styles.rowInfo}
                labelClassName={styles.rowLabel}
                descriptionClassName={styles.rowDesc}
                controlsClassName={styles.rowControls}
              >
                <div className={styles.buttonGroup}>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => toast.success('Saved', 'All good.')}>
                    Success
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => toast.info('Heads up', 'FYI notice.')}>
                    Info
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => toast.warning('Warning', 'Check your inputs.')}>
                    Warning
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => toast.error('Error', 'Something failed.')}>
                    Error
                  </UtilityButton>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Special"
                description="Persistent + action"
                className={styles.settingsRow}
                labelWrapperClassName={styles.rowInfo}
                labelClassName={styles.rowLabel}
                descriptionClassName={styles.rowDesc}
                controlsClassName={styles.rowControls}
              >
                <div className={styles.buttonGroup}>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => {
                      const id = toast.info('Processing...', 'This stays until dismissed.', { duration: 0 });
                      setPersistentToastId(id);
                    }}
                  >
                    Persistent
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() =>
                      toast.success('Action ready', 'Click to run.', {
                        action: { label: 'Run', onClick: () => toast.info('Action', 'CTA clicked.') },
                      })
                    }
                  >
                    With Action
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => {
                      if (persistentToastId) {
                        toast.dismiss(persistentToastId);
                        setPersistentToastId(null);
                      }
                    }}
                  >
                    Dismiss
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => toast.dismissAll()}>
                    Dismiss All
                  </UtilityButton>
                </div>
              </SettingsRow>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <AlertTriangle size={14} className={styles.panelHeaderIcon} />
              <span className={styles.panelHeaderTitle}>Dialogs</span>
            </div>
            <div className={styles.panelContent}>
              <SettingsRow
                label="Alert"
                description="Single-button modal"
                className={styles.settingsRow}
                labelWrapperClassName={styles.rowInfo}
                labelClassName={styles.rowLabel}
                descriptionClassName={styles.rowDesc}
                controlsClassName={styles.rowControls}
              >
                <div className={styles.buttonGroup}>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => void alert({ title: 'Info', message: 'This is a basic alert.', variant: 'info' })}
                  >
                    Info Alert
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => void alert({ title: 'Warning', message: 'Double-check the settings.', variant: 'warning' })}
                  >
                    Warning Alert
                  </UtilityButton>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Confirm"
                description="Two-button confirm dialog"
                className={styles.settingsRow}
                labelWrapperClassName={styles.rowInfo}
                labelClassName={styles.rowLabel}
                descriptionClassName={styles.rowDesc}
                controlsClassName={styles.rowControls}
              >
                <div className={styles.buttonGroup}>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => void handleConfirmResult('default')}>
                    Standard
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => void handleConfirmResult('warning')}>
                    Warning
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => void handleConfirmResult('danger')}>
                    Danger
                  </UtilityButton>
                </div>
              </SettingsRow>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <Zap size={14} className={styles.panelHeaderIcon} />
              <span className={styles.panelHeaderTitle}>Banners</span>
            </div>
            <div className={styles.panelContent}>
              <SettingsRow
                label="Variants"
                description="Persistent banners"
                className={styles.settingsRow}
                labelWrapperClassName={styles.rowInfo}
                labelClassName={styles.rowLabel}
                descriptionClassName={styles.rowDesc}
                controlsClassName={styles.rowControls}
              >
                <div className={styles.buttonGroup}>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => {
                      const id = banner.show({ variant: 'info', message: 'Connected to sync service.', icon: 'info', dismissible: true });
                      setLastBannerId(id);
                    }}
                  >
                    Info
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => {
                      const id = banner.show({ variant: 'warning', message: 'Network unstable.', icon: 'wifi-off', dismissible: true });
                      setLastBannerId(id);
                    }}
                  >
                    Warning
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => {
                      const id = banner.show({ variant: 'error', message: 'Sync failed. Retry needed.', icon: 'alert', dismissible: true });
                      setLastBannerId(id);
                    }}
                  >
                    Error
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => {
                      if (lastBannerId) {
                        banner.dismiss(lastBannerId);
                        setLastBannerId(null);
                      }
                    }}
                  >
                    Dismiss
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={() => banner.dismissAll()}>
                    Dismiss All
                  </UtilityButton>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Progress"
                description="Progress banner updates"
                className={styles.settingsRow}
                labelWrapperClassName={styles.rowInfo}
                labelClassName={styles.rowLabel}
                descriptionClassName={styles.rowDesc}
                controlsClassName={styles.rowControls}
              >
                <div className={styles.buttonGroup}>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={handleStartProgressBanner}>
                    Start
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={handleAdvanceProgressBanner}>
                    Advance
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={handleDismissProgressBanner}>
                    Dismiss
                  </UtilityButton>
                </div>
              </SettingsRow>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <Bell size={14} className={styles.panelHeaderIcon} />
              <span className={styles.panelHeaderTitle}>Mini Toast</span>
            </div>
            <div className={styles.panelContent}>
              <SettingsRow
                label="Overlay"
                description="Compact overlay toast"
                className={styles.settingsRow}
                labelWrapperClassName={styles.rowInfo}
                labelClassName={styles.rowLabel}
                descriptionClassName={styles.rowDesc}
                controlsClassName={styles.rowControls}
              >
                <div className={styles.buttonGroup}>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => showMiniToast('Saved!', 'success')}
                  >
                    Success
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => showMiniToast('Heads up', 'info')}
                  >
                    Info
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => showMiniToast('Low disk space', 'warning')}
                  >
                    Warning
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => showMiniToast('Sync failed', 'error')}
                  >
                    Error
                  </UtilityButton>
                  <UtilityButton
                    variant="panel"
                    size="sm"
                    className={styles.actionBtn}
                    onClick={() => showMiniToast('Persistent toast', 'info', 0)}
                  >
                    Persistent
                  </UtilityButton>
                  <UtilityButton variant="panel" size="sm" className={styles.actionBtn} onClick={dismissMiniToast}>
                    Dismiss
                  </UtilityButton>
                </div>
              </SettingsRow>
            </div>
          </div>

          {miniToastElement}
        </Body>
      </Container>
    </Overlay>
  );
}
