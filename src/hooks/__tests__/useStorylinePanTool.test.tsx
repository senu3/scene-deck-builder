import { useRef } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, beforeAll } from 'vitest';
import { useStorylinePanTool } from '../useStorylinePanTool';

function PanToolProbe() {
  const ref = useRef<HTMLDivElement>(null);
  const panTool = useStorylinePanTool(ref);

  return (
    <div
      ref={ref}
      data-testid="storyline"
      data-ready={panTool.isPanModeReady ? 'true' : 'false'}
      data-panning={panTool.isPanning ? 'true' : 'false'}
      style={{ overflowX: 'auto', width: '120px' }}
      {...panTool.bind}
    >
      <div style={{ width: '800px', height: '24px' }} />
    </div>
  );
}

function dispatchSpaceKey(type: 'keydown' | 'keyup', target: EventTarget = window): boolean {
  const event = new KeyboardEvent(type, {
    key: ' ',
    code: 'Space',
    bubbles: true,
    cancelable: true,
  });
  return target.dispatchEvent(event);
}

function dispatchPointer(
  target: Element,
  type: string,
  pointerId: number,
  clientX: number
): boolean {
  const event = new PointerEvent(type, {
    pointerId,
    clientX,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  return target.dispatchEvent(event);
}

function hoverEnter(target: Element): void {
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
}

describe('useStorylinePanTool', () => {
  beforeAll(() => {
    if (typeof PointerEvent === 'undefined') {
      class PointerEventPolyfill extends MouseEvent {
        pointerId: number;

        constructor(type: string, init?: MouseEventInit & { pointerId?: number }) {
          super(type, init);
          this.pointerId = init?.pointerId ?? 1;
        }
      }
      (globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventPolyfill;
    }
  });

  it('enables pan mode only while hovered and Space is held', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<PanToolProbe />);
    });

    const el = host.querySelector('[data-testid="storyline"]') as HTMLDivElement;
    expect(el.dataset.ready).toBe('false');

    act(() => {
      hoverEnter(el);
    });

    let notPrevented = true;
    act(() => {
      notPrevented = dispatchSpaceKey('keydown');
    });
    expect(notPrevented).toBe(false);
    expect(el.dataset.ready).toBe('true');

    act(() => {
      dispatchSpaceKey('keyup');
    });
    expect(el.dataset.ready).toBe('false');

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('does not start panning without Space', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<PanToolProbe />);
    });

    const el = host.querySelector('[data-testid="storyline"]') as HTMLDivElement;
    el.scrollLeft = 100;
    let notPrevented = true;
    act(() => {
      notPrevented = dispatchPointer(el, 'pointerdown', 1, 120);
    });

    expect(notPrevented).toBe(true);
    expect(el.dataset.panning).toBe('false');
    expect(el.scrollLeft).toBe(100);

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('pans horizontally while Space is held and drag is active', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<PanToolProbe />);
    });

    const el = host.querySelector('[data-testid="storyline"]') as HTMLDivElement;

    act(() => {
      hoverEnter(el);
      dispatchSpaceKey('keydown');
    });
    el.scrollLeft = 100;

    let preventedOnDown = true;
    act(() => {
      preventedOnDown = dispatchPointer(el, 'pointerdown', 3, 200);
    });
    expect(preventedOnDown).toBe(false);
    expect(el.dataset.panning).toBe('true');

    act(() => {
      dispatchPointer(el, 'pointermove', 3, 160);
    });
    expect(el.scrollLeft).toBe(140);

    act(() => {
      dispatchPointer(el, 'pointerup', 3, 160);
    });
    expect(el.dataset.panning).toBe('false');

    act(() => {
      dispatchSpaceKey('keyup');
    });

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('keeps Space inactive when key event comes from editable element', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<PanToolProbe />);
    });

    const el = host.querySelector('[data-testid="storyline"]') as HTMLDivElement;
    act(() => {
      hoverEnter(el);
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    let notPrevented = true;
    act(() => {
      notPrevented = dispatchSpaceKey('keydown', input);
    });

    expect(notPrevented).toBe(true);
    expect(el.dataset.ready).toBe('false');

    input.remove();
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('stops panning when window loses focus', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(<PanToolProbe />);
    });

    const el = host.querySelector('[data-testid="storyline"]') as HTMLDivElement;
    act(() => {
      hoverEnter(el);
      dispatchSpaceKey('keydown');
    });
    act(() => {
      dispatchPointer(el, 'pointerdown', 9, 100);
    });
    expect(el.dataset.panning).toBe('true');

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(el.dataset.panning).toBe('false');
    expect(el.dataset.ready).toBe('false');

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
