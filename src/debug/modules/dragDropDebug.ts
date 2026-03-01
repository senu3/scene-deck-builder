import { useEffect, useMemo, useRef, useState } from 'react';
import type { DevOverlayPanel } from '../overlay/DevOverlayHost';
import { DND_DEBUG_EVENT_NAME, logDragDebug } from '../../utils/dragDrop';
import type { DragDebugEventDetail } from '../../utils/dragDrop';

const MAX_EVENTS = 10;
const MAX_UPDATE_HZ = 10;
const UPDATE_INTERVAL_MS = 1000 / MAX_UPDATE_HZ;

function buildLines(entry: DragDebugEventDetail): string[] {
  return [
    entry.label,
    `types=${entry.snapshot.types.join('|') || '-'} items=${entry.snapshot.itemCount} files=${entry.snapshot.fileCount}`,
    `paths=${entry.snapshot.files.filter((file) => file.hasPath).length}/${entry.snapshot.files.length} kind=${String(entry.details?.dragKind ?? '-')}`,
  ];
}

export function useDragDropDebugModule(): DevOverlayPanel | null {
  const [events, setEvents] = useState<DragDebugEventDetail[]>([]);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<DragDebugEventDetail>;
      if (!customEvent.detail) return;
      const now = performance.now();
      if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
      lastUpdateRef.current = now;
      setEvents((prev) => {
        const next = [...prev, customEvent.detail];
        return next.slice(-MAX_EVENTS);
      });
    };

    window.addEventListener(DND_DEBUG_EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(DND_DEBUG_EVENT_NAME, handler as EventListener);
  }, []);

  useEffect(() => {
    const dragEvents: Array<keyof WindowEventMap> = ['dragenter', 'dragover', 'dragleave', 'drop'];

    const onWindowDragEvent = (event: Event) => {
      const e = event as DragEvent;
      if (!e.dataTransfer) return;
      logDragDebug(`probe.window.${e.type}`, e.dataTransfer, {
        defaultPrevented: e.defaultPrevented,
      });
    };

    const onDocumentDragEvent = (event: Event) => {
      const e = event as DragEvent;
      if (!e.dataTransfer) return;
      logDragDebug(`probe.document.${e.type}`, e.dataTransfer, {
        defaultPrevented: e.defaultPrevented,
      });
    };

    for (const eventName of dragEvents) {
      window.addEventListener(eventName, onWindowDragEvent, true);
      document.addEventListener(eventName, onDocumentDragEvent, true);
    }
    return () => {
      for (const eventName of dragEvents) {
        window.removeEventListener(eventName, onWindowDragEvent, true);
        document.removeEventListener(eventName, onDocumentDragEvent, true);
      }
    };
  }, []);

  const lines = useMemo(() => {
    if (events.length === 0) return ['no events'];
    return events.flatMap((entry) => buildLines(entry));
  }, [events]);

  return {
    id: 'drag-drop-debug',
    title: '[DND DEBUG HUD]',
    lines,
  };
}
