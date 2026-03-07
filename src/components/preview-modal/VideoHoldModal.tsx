import { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import {
  Overlay,
  Container,
  Header,
  Body,
  Footer,
  Actions,
  ActionButton,
  useModalKeyboard,
} from '../../ui/primitives/Modal';

interface VideoHoldModalProps {
  open: boolean;
  initialDurationSec: number;
  onClose: () => void;
  onConfirm: (durationSec: number) => void;
}

export default function VideoHoldModal({
  open,
  initialDurationSec,
  onClose,
  onConfirm,
}: VideoHoldModalProps) {
  const [durationInput, setDurationInput] = useState('1.00');

  useEffect(() => {
    if (!open) return;
    const next = Number.isFinite(initialDurationSec) && initialDurationSec > 0 ? initialDurationSec : 1;
    setDurationInput(next.toFixed(2));
  }, [open, initialDurationSec]);

  useModalKeyboard({ onEscape: onClose, enabled: open });

  const parsedDurationSec = useMemo(() => Number(durationInput.trim()), [durationInput]);
  const isValid = Number.isFinite(parsedDurationSec) && parsedDurationSec > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(parsedDurationSec);
  };

  if (!open) return null;

  return (
    <Overlay onClick={onClose} blur>
      <Container size="sm">
        <Header
          title="VIDEO Hold"
          subtitle="Hold the final frame for the specified duration"
          icon={<Clock3 size={20} />}
          iconVariant="info"
          onClose={onClose}
        />
        <Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="video-hold-duration" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Duration (seconds)
            </label>
            <input
              id="video-hold-duration"
              type="number"
              min={0.01}
              step={0.01}
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              autoFocus
            />
          </div>
        </Body>
        <Footer>
          <Actions>
            <ActionButton variant="secondary" onClick={onClose}>Cancel</ActionButton>
            <ActionButton variant="primary" onClick={handleConfirm} disabled={!isValid}>
              Apply
            </ActionButton>
          </Actions>
        </Footer>
      </Container>
    </Overlay>
  );
}
