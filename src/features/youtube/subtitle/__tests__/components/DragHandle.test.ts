import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import DragHandle from '../../components/DragHandle.svelte';

describe('DragHandle', () => {
  beforeEach(() => {
    // Mock window.innerHeight for percentage calculations
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1000
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders with correct initial position', () => {
    const { container } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 50 }
      }
    });

    const handle = container.querySelector('.drag-handle');
    expect(handle).toBeTruthy();
    expect(handle?.classList.contains('visible')).toBe(true);
  });

  it('hides when visible is false', () => {
    const { container } = render(DragHandle, {
      props: {
        visible: false,
        position: { anchor: 'top', percent: 50 }
      }
    });

    const handle = container.querySelector('.drag-handle');
    expect(handle?.classList.contains('visible')).toBe(false);
  });

  it('positions correctly with top anchor', () => {
    const { container } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 30 }
      }
    });

    const handle = container.querySelector('.drag-handle') as HTMLElement;
    expect(handle?.style.top).toBe('30%');
    expect(handle?.style.bottom).toBe('auto');
  });

  it('positions correctly with bottom anchor', () => {
    const { container } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'bottom', percent: 20 }
      }
    });

    const handle = container.querySelector('.drag-handle') as HTMLElement;
    expect(handle?.style.top).toBe('auto');
    expect(handle?.style.bottom).toBe('80%');
  });

  it('dispatches dragmove event on drag', async () => {
    const onDrag = vi.fn();
    const { container, component } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 50 },
        onDrag
      }
    });

    const handle = container.querySelector('.drag-handle') as HTMLElement;
    const dragmoveEvents: any[] = [];

    component.$on('dragmove', (e) => {
      dragmoveEvents.push(e.detail);
    });

    // Simulate mousedown
    await fireEvent.mouseDown(handle, { clientY: 500 });

    // Simulate mousemove (move down 100px)
    await fireEvent.mouseMove(document, { clientY: 600 });

    expect(dragmoveEvents.length).toBeGreaterThan(0);
    expect(dragmoveEvents[0].deltaY).toBe(100);
    expect(dragmoveEvents[0].percent).toBe(60); // 50% + (100/1000)*100

    // Cleanup - simulate mouseup
    await fireEvent.mouseUp(document);
  });

  it('calls onDrag callback during drag', async () => {
    const onDrag = vi.fn();
    const { container } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 50 },
        onDrag
      }
    });

    const handle = container.querySelector('.drag-handle') as HTMLElement;

    await fireEvent.mouseDown(handle, { clientY: 500 });
    await fireEvent.mouseMove(document, { clientY: 600 });

    expect(onDrag).toHaveBeenCalled();
    expect(onDrag).toHaveBeenCalledWith(60);

    await fireEvent.mouseUp(document);
  });

  it('clamps percent between 0 and 100', async () => {
    const onDrag = vi.fn();
    const { container } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 10 },
        onDrag
      }
    });

    const handle = container.querySelector('.drag-handle') as HTMLElement;

    // Try to drag up beyond 0%
    await fireEvent.mouseDown(handle, { clientY: 500 });
    await fireEvent.mouseMove(document, { clientY: 0 }); // Move up 500px = -50%

    expect(onDrag).toHaveBeenCalledWith(0);

    await fireEvent.mouseUp(document);

    // Reset and try to drag down beyond 100%
    const { container: container2 } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 90 },
        onDrag
      }
    });

    const handle2 = container2.querySelector('.drag-handle') as HTMLElement;

    await fireEvent.mouseDown(handle2, { clientY: 500 });
    await fireEvent.mouseMove(document, { clientY: 1000 }); // Move down 500px = +50%

    expect(onDrag).toHaveBeenCalledWith(100);

    await fireEvent.mouseUp(document);
  });

  it('stops dragging on mouseup', async () => {
    const onDrag = vi.fn();
    const { container } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 50 },
        onDrag
      }
    });

    const handle = container.querySelector('.drag-handle') as HTMLElement;

    await fireEvent.mouseDown(handle, { clientY: 500 });
    await fireEvent.mouseMove(document, { clientY: 600 });

    const callCount = onDrag.mock.calls.length;

    await fireEvent.mouseUp(document);

    // Move again after mouseup - should not trigger callback
    await fireEvent.mouseMove(document, { clientY: 700 });

    expect(onDrag.mock.calls.length).toBe(callCount);
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(DragHandle, {
      props: {
        visible: true,
        position: { anchor: 'top', percent: 50 }
      }
    });

    const handle = container.querySelector('.drag-handle') as HTMLElement;
    expect(handle?.getAttribute('role')).toBe('slider');
    expect(handle?.getAttribute('tabindex')).toBe('0');
    expect(handle?.getAttribute('aria-label')).toBeTruthy();
    expect(handle?.getAttribute('aria-valuemin')).toBe('0');
    expect(handle?.getAttribute('aria-valuemax')).toBe('100');
    expect(handle?.getAttribute('aria-valuenow')).toBe('50');
  });
});
