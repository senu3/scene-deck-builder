import { useEffect, useMemo, useState } from 'react';
import { Crop } from 'lucide-react';
import { readFileAsBase64Bridge } from '../features/platform/electronGateway';
import {
  Overlay,
  Container,
  Header,
  Body,
  Footer,
  Actions,
  ActionButton,
  useModalKeyboard,
} from '../ui/primitives/Modal';
import { SettingsRow } from '../ui/primitives';
import styles from './ImageCropModal.module.css';

type AnchorPresetId =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface AnchorPreset {
  id: AnchorPresetId;
  x: number;
  y: number;
  label: string;
}

const ANCHOR_PRESETS: AnchorPreset[] = [
  { id: 'top-left', x: 0, y: 0, label: 'Top Left' },
  { id: 'top-center', x: 0.5, y: 0, label: 'Top Center' },
  { id: 'top-right', x: 1, y: 0, label: 'Top Right' },
  { id: 'center-left', x: 0, y: 0.5, label: 'Center Left' },
  { id: 'center', x: 0.5, y: 0.5, label: 'Center' },
  { id: 'center-right', x: 1, y: 0.5, label: 'Center Right' },
  { id: 'bottom-left', x: 0, y: 1, label: 'Bottom Left' },
  { id: 'bottom-center', x: 0.5, y: 1, label: 'Bottom Center' },
  { id: 'bottom-right', x: 1, y: 1, label: 'Bottom Right' },
];

export interface ImageCropConfig {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

interface ImageCropModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: ImageCropConfig) => void;
  initialWidth: number;
  initialHeight: number;
  sourcePath?: string | null;
  previewSrc?: string | null;
}

export default function ImageCropModal({
  open,
  onClose,
  onConfirm,
  initialWidth,
  initialHeight,
  sourcePath,
  previewSrc,
}: ImageCropModalProps) {
  const [widthInput, setWidthInput] = useState(String(initialWidth));
  const [heightInput, setHeightInput] = useState(String(initialHeight));
  const [anchorId, setAnchorId] = useState<AnchorPresetId>('center');
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [resolvedPreviewSrc, setResolvedPreviewSrc] = useState<string | null>(previewSrc ?? null);

  useEffect(() => {
    if (!open) return;
    setWidthInput(String(initialWidth));
    setHeightInput(String(initialHeight));
    setAnchorId('center');
  }, [open, initialWidth, initialHeight]);

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      if (!open) return;
      if (previewSrc) {
        setResolvedPreviewSrc(previewSrc);
        return;
      }
      if (!sourcePath) {
        setResolvedPreviewSrc(null);
        return;
      }
      const dataUrl = await readFileAsBase64Bridge(sourcePath);
      if (!cancelled) {
        setResolvedPreviewSrc(dataUrl);
      }
    };
    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [open, previewSrc, sourcePath]);

  useModalKeyboard({ onEscape: onClose, enabled: open });

  const parsedWidth = Number(widthInput);
  const parsedHeight = Number(heightInput);
  const isValid = Number.isFinite(parsedWidth) && Number.isFinite(parsedHeight) && parsedWidth > 0 && parsedHeight > 0;
  const aspectRatio = isValid ? parsedWidth / parsedHeight : null;
  const selectedAnchor = ANCHOR_PRESETS.find((preset) => preset.id === anchorId) ?? ANCHOR_PRESETS[4];

  const previewFrame = useMemo(() => {
    if (!aspectRatio) return null;

    const sourceRatio = imageRatio ?? 16 / 9;
    let frameW = 100;
    let frameH = 100;
    let offsetX = 0;
    let offsetY = 0;

    if (sourceRatio > aspectRatio) {
      frameW = (aspectRatio / sourceRatio) * 100;
      offsetX = (100 - frameW) * selectedAnchor.x;
    } else {
      frameH = (sourceRatio / aspectRatio) * 100;
      offsetY = (100 - frameH) * selectedAnchor.y;
    }

    return {
      width: `${frameW}%`,
      height: `${frameH}%`,
      left: `${offsetX}%`,
      top: `${offsetY}%`,
    };
  }, [aspectRatio, imageRatio, selectedAnchor.x, selectedAnchor.y]);

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      width: Math.max(1, Math.round(parsedWidth)),
      height: Math.max(1, Math.round(parsedHeight)),
      anchorX: selectedAnchor.x,
      anchorY: selectedAnchor.y,
    });
  };

  if (!open) return null;

  return (
    <Overlay onClick={onClose} blur>
      <Container size="sm">
        <Header
          title="Crop Image"
          subtitle="Create a new cropped image cut"
          icon={<Crop size={20} />}
          iconVariant="info"
          onClose={onClose}
        />
        <Body>
          <div className={styles.previewCard}>
            <div className={styles.previewViewport}>
              {resolvedPreviewSrc ? (
                <div className={styles.previewImageBox}>
                  <img
                    src={resolvedPreviewSrc}
                    alt="Crop preview"
                    className={styles.previewImage}
                    onLoad={(e) => {
                      const target = e.currentTarget;
                      if (target.naturalWidth > 0 && target.naturalHeight > 0) {
                        setImageRatio(target.naturalWidth / target.naturalHeight);
                      }
                    }}
                  />
                  {previewFrame && <div className={styles.cropFrame} style={previewFrame} />}
                </div>
              ) : (
                <div className={styles.previewPlaceholder}>Preview unavailable</div>
              )}
            </div>
          </div>
          <div className={styles.formRows}>
            <SettingsRow label="Size (px)">
              <div className={styles.sizeRow}>
                <input
                  type="number"
                  min={1}
                  value={widthInput}
                  onChange={(e) => setWidthInput(e.target.value)}
                  className={styles.numberInput}
                />
                <span className={styles.sizeDivider}>x</span>
                <input
                  type="number"
                  min={1}
                  value={heightInput}
                  onChange={(e) => setHeightInput(e.target.value)}
                  className={styles.numberInput}
                />
              </div>
            </SettingsRow>

            <SettingsRow label="Anchor">
              <div className={styles.anchorGrid} role="radiogroup" aria-label="Anchor">
                {ANCHOR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={anchorId === preset.id}
                    aria-label={preset.label}
                    className={styles.anchorBtn}
                    data-selected={anchorId === preset.id || undefined}
                    onClick={() => setAnchorId(preset.id)}
                  />
                ))}
              </div>
            </SettingsRow>
          </div>
        </Body>
        <Footer>
          <Actions>
            <ActionButton variant="secondary" onClick={onClose}>Cancel</ActionButton>
            <ActionButton variant="primary" onClick={handleConfirm} disabled={!isValid}>
              Crop (Add Cut)
            </ActionButton>
          </Actions>
        </Footer>
      </Container>
    </Overlay>
  );
}
