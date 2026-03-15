/**
 * Dialog - Promise-based Confirm/Alert dialogs
 *
 * Usage:
 * 1. Wrap app with DialogProvider
 * 2. Use useDialog() hook
 *
 * const { alert, confirm } = useDialog();
 *
 * // Alert (one button)
 * await alert({
 *   title: 'Error',
 *   message: 'Something went wrong',
 * });
 *
 * // Confirm (two buttons)
 * const confirmed = await confirm({
 *   title: 'Delete Item',
 *   message: 'Are you sure?',
 * });
 *
 * // Danger confirm (target name, cancel emphasized)
 * const confirmed = await confirm({
 *   title: 'Delete Clip',
 *   message: 'This action cannot be undone.',
 *   targetName: 'clip_001.mp4',
 *   variant: 'danger',
 * });
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import {
  Button,
  Overlay,
  Container,
  Header,
  Body,
  Footer,
  Actions,
  useModalKeyboard,
} from '../primitives';
import styles from './Dialog.module.css';

// ============================================
// Types
// ============================================
export type DialogVariant = 'default' | 'warning' | 'danger' | 'info';

export interface AlertOptions {
  title: string;
  message: string;
  variant?: DialogVariant;
  confirmLabel?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  variant?: DialogVariant;
  /** Target name to display (for danger variant) */
  targetName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface DialogAPI {
  /** Show an alert dialog (one button). Resolves when dismissed. */
  alert: (options: AlertOptions) => Promise<void>;
  /** Show a confirm dialog (two buttons). Resolves true if confirmed, false if cancelled. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

interface DialogState {
  type: 'alert' | 'confirm';
  options: AlertOptions | ConfirmOptions;
  resolve: (value: boolean) => void;
}

// ============================================
// Context
// ============================================
const DialogContext = createContext<DialogAPI | null>(null);

// ============================================
// useDialog Hook
// ============================================
export function useDialog(): DialogAPI {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

// ============================================
// Provider
// ============================================
export interface DialogProviderProps {
  children: ReactNode;
}

export function DialogProvider({ children }: DialogProviderProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const queueRef = useRef<DialogState[]>([]);

  const processQueue = useCallback(() => {
    if (dialog === null && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      setDialog(next);
    }
  }, [dialog]);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      const state: DialogState = {
        type: 'alert',
        options,
        resolve: () => resolve(),
      };
      queueRef.current.push(state);
      // Process immediately if no dialog showing
      if (queueRef.current.length === 1) {
        setDialog(state);
        queueRef.current.shift();
      }
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      const state: DialogState = {
        type: 'confirm',
        options,
        resolve,
      };
      queueRef.current.push(state);
      // Process immediately if no dialog showing
      if (queueRef.current.length === 1) {
        setDialog(state);
        queueRef.current.shift();
      }
    });
  }, []);

  const handleClose = useCallback(
    (result: boolean) => {
      if (dialog) {
        dialog.resolve(result);
        setDialog(null);
      }
    },
    [dialog]
  );

  // Process queue when dialog closes
  useEffect(() => {
    if (dialog === null) {
      processQueue();
    }
  }, [dialog, processQueue]);

  const api: DialogAPI = { alert, confirm };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && (
        <DialogModal
          type={dialog.type}
          options={dialog.options}
          onClose={handleClose}
        />
      )}
    </DialogContext.Provider>
  );
}

// ============================================
// Dialog Modal
// ============================================
interface DialogModalProps {
  type: 'alert' | 'confirm';
  options: AlertOptions | ConfirmOptions;
  onClose: (result: boolean) => void;
}

function DialogModal({ type, options, onClose }: DialogModalProps) {
  const isConfirm = type === 'confirm';
  const confirmOptions = options as ConfirmOptions;
  const variant = options.variant || 'default';
  const isDanger = variant === 'danger';

  // ESC key handling
  useModalKeyboard({
    onEscape: () => onClose(false),
    enabled: true,
  });

  // Focus management - focus cancel button for danger, confirm otherwise
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (isDanger && cancelRef.current) {
        cancelRef.current.focus();
      } else if (confirmRef.current) {
        confirmRef.current.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isDanger]);

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return <AlertTriangle size={24} />;
      case 'warning':
        return <AlertTriangle size={24} />;
      case 'info':
        return <Info size={24} />;
      default:
        return <AlertCircle size={24} />;
    }
  };

  const getIconVariant = () => {
    switch (variant) {
      case 'danger':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'default';
    }
  };

  const getConfirmLabel = () => {
    if (options.confirmLabel) return options.confirmLabel;
    if (isDanger) return 'Delete';
    return 'OK';
  };

  const getCancelLabel = () => {
    if (confirmOptions.cancelLabel) return confirmOptions.cancelLabel;
    return 'Cancel';
  };

  return (
    <Overlay onClick={() => onClose(false)} className={styles.dialogOverlay}>
      <Container size="sm">
        <Header
          title={options.title}
          icon={getIcon()}
          iconVariant={getIconVariant()}
          onClose={() => onClose(false)}
        />
        <Body>
          <div className={styles.dialogContent}>
            <p className={styles.dialogMessage}>{options.message}</p>
            {isDanger && confirmOptions.targetName && (
              <div className={styles.targetName}>{confirmOptions.targetName}</div>
            )}
          </div>
        </Body>
        <Footer align={isDanger ? 'between' : 'end'}>
          <Actions>
            {isConfirm && (
              <Button
                ref={isDanger ? cancelRef : undefined}
                variant="ghost"
                onClick={() => onClose(false)}
                className={isDanger ? styles.cancelButtonDanger : ''}
              >
                {getCancelLabel()}
              </Button>
            )}
            <Button
              ref={isDanger ? undefined : confirmRef}
              variant={isDanger ? 'danger' : 'primary'}
              size={isDanger ? 'md' : 'lg'}
              onClick={() => onClose(true)}
            >
              {getConfirmLabel()}
            </Button>
          </Actions>
        </Footer>
      </Container>
    </Overlay>
  );
}

export default DialogProvider;
