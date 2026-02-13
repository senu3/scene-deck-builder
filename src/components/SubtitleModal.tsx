import { useEffect, useMemo, useState } from 'react';
import { Check, LocateFixed, MessageSquare } from 'lucide-react';
import {
  Overlay,
  Container,
  Header,
  Body,
  Footer,
  ActionButton,
  InputGroup,
  RadioGroup,
  Field,
} from '../ui';
import type { CutSubtitle } from '../types';
import { normalizeSubtitleRange } from '../utils/subtitleUtils';
import styles from './SubtitleModal.module.css';

interface SubtitleModalProps {
  open: boolean;
  subtitle?: CutSubtitle;
  cutDurationSec: number;
  currentLocalTimeSec: number;
  onClose: () => void;
  onSave: (subtitle?: CutSubtitle) => void;
}

type RangeMode = 'full' | 'custom';

function toInputNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2);
}

export default function SubtitleModal({
  open,
  subtitle,
  cutDurationSec,
  currentLocalTimeSec,
  onClose,
  onSave,
}: SubtitleModalProps) {
  const [text, setText] = useState('');
  const [rangeMode, setRangeMode] = useState<RangeMode>('full');
  const [startInput, setStartInput] = useState('0.00');
  const [endInput, setEndInput] = useState('0.00');

  const currentTime = useMemo(() => {
    const max = Math.max(0, cutDurationSec);
    return Math.min(Math.max(currentLocalTimeSec, 0), max);
  }, [currentLocalTimeSec, cutDurationSec]);

  useEffect(() => {
    if (!open) return;
    setText(subtitle?.text ?? '');
    if (subtitle?.range) {
      const normalized = normalizeSubtitleRange(subtitle.range, cutDurationSec);
      if (normalized) {
        setRangeMode('custom');
        setStartInput(toInputNumber(normalized.start));
        setEndInput(toInputNumber(normalized.end));
        return;
      }
    }
    setRangeMode('full');
    setStartInput('0.00');
    setEndInput(toInputNumber(Math.max(0, cutDurationSec)));
  }, [open, subtitle, cutDurationSec]);

  if (!open) return null;

  const handleSetStartCurrent = () => {
    setRangeMode('custom');
    setStartInput(toInputNumber(currentTime));
  };

  const handleSetEndCurrent = () => {
    setRangeMode('custom');
    setEndInput(toInputNumber(currentTime));
  };

  const handleResetFull = () => {
    setRangeMode('full');
    setStartInput('0.00');
    setEndInput(toInputNumber(Math.max(0, cutDurationSec)));
  };

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onSave(undefined);
      onClose();
      return;
    }

    if (rangeMode === 'full') {
      onSave({ text });
      onClose();
      return;
    }

    const parsedStart = Number(startInput);
    const parsedEnd = Number(endInput);
    const normalized = normalizeSubtitleRange(
      { start: Number.isFinite(parsedStart) ? parsedStart : 0, end: Number.isFinite(parsedEnd) ? parsedEnd : cutDurationSec },
      cutDurationSec
    );
    onSave({
      text,
      range: normalized,
    });
    onClose();
  };

  return (
    <Overlay onClick={onClose} blur className={styles.overlay}>
      <Container size="md">
        <Header
          title="Subtitle"
          subtitle="Edit cut subtitle text and display range"
          icon={<MessageSquare size={18} />}
          iconVariant="info"
          onClose={onClose}
        />
        <Body>
          <div className={styles.body}>
            <Field label="Text">
              <textarea
                className={styles.textarea}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type subtitle text. Use Enter for line breaks."
                rows={5}
              />
            </Field>

            <div className={styles.section}>
              <Field label="Display Range">
                <RadioGroup
                  name="subtitle-range-mode"
                  value={rangeMode}
                  direction="horizontal"
                  onChange={(value) => setRangeMode(value as RangeMode)}
                  options={[
                    { value: 'full', label: 'Full' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </Field>
              <div className={styles.currentTime}>Current: {currentTime.toFixed(2)}s</div>
              <div className={styles.rangeGrid} data-disabled={rangeMode !== 'custom'}>
                <div className={styles.rangeRow}>
                  <span className={styles.rangeLabel}>Start</span>
                  <InputGroup
                    type="number"
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    step={0.01}
                    min={0}
                    max={Math.max(0, cutDurationSec)}
                    disabled={rangeMode !== 'custom'}
                    unit="s"
                  />
                  <ActionButton variant="outlined" onClick={handleSetStartCurrent}>
                    <LocateFixed size={14} />
                    Set = Playhead
                  </ActionButton>
                </div>
                <div className={styles.rangeRow}>
                  <span className={styles.rangeLabel}>End</span>
                  <InputGroup
                    type="number"
                    value={endInput}
                    onChange={(e) => setEndInput(e.target.value)}
                    step={0.01}
                    min={0}
                    max={Math.max(0, cutDurationSec)}
                    disabled={rangeMode !== 'custom'}
                    unit="s"
                  />
                  <ActionButton variant="outlined" onClick={handleSetEndCurrent}>
                    <LocateFixed size={14} />
                    Set = Playhead
                  </ActionButton>
                </div>
              </div>
              <button type="button" className={styles.resetBtn} onClick={handleResetFull}>
                Reset Full
              </button>
            </div>
          </div>
        </Body>
        <Footer className={styles.footer}>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => {
                onSave(undefined);
                onClose();
              }}
            >
              Clear
            </button>
            <button type="button" className={styles.primaryBtn} onClick={handleSave}>
              <Check size={16} />
              Save
            </button>
          </div>
        </Footer>
      </Container>
    </Overlay>
  );
}
