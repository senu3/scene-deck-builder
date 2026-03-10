import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useDragDropDebugModule } from './modules/dragDropDebug';
import { useEffectActivityDebugModule } from './modules/effectActivityDebug';
import { usePreviewDebugModule } from './modules/previewDebug';

export interface DevOverlayPanel {
  id: string;
  title: string;
  lines: string[];
}

function panelStyle(): CSSProperties {
  return {
    background: 'rgba(0,0,0,0.82)',
    color: '#fff',
    fontSize: 11,
    lineHeight: 1.35,
    fontFamily: 'monospace',
    padding: 8,
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
  };
}

export default function DevOverlayHost() {
  const previewPanel = usePreviewDebugModule();
  const dragDropPanel = useDragDropDebugModule();
  const effectActivityPanel = useEffectActivityDebugModule();

  const panels = useMemo(() => {
    return [previewPanel, dragDropPanel, effectActivityPanel].filter((panel): panel is DevOverlayPanel => panel !== null);
  }, [previewPanel, dragDropPanel, effectActivityPanel]);

  if (panels.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        width: 420,
        maxHeight: 260,
        overflow: 'auto',
        zIndex: 99999,
        pointerEvents: 'none',
        display: 'grid',
        gap: 8,
      }}
    >
      {panels.map((panel) => (
        <section key={panel.id} style={panelStyle()}>
          <div style={{ marginBottom: 6, fontWeight: 700 }}>{panel.title}</div>
          {panel.lines.map((line, index) => (
            <div key={`${panel.id}-${index}`}>{line}</div>
          ))}
        </section>
      ))}
    </div>
  );
}
