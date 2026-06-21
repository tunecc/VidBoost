<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let visible: boolean = true;
  export let position: { anchor: 'top' | 'bottom', percent: number };
  export let onDrag: (percent: number) => void = () => {};

  const dispatch = createEventDispatcher();

  let isDragging = false;
  let startY = 0;
  let startPercent = 0;

  function handleMouseDown(e: MouseEvent) {
    isDragging = true;
    startY = e.clientY;
    startPercent = position.percent;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;

    const deltaY = e.clientY - startY;
    const viewportHeight = window.innerHeight;
    const deltaPercent = (deltaY / viewportHeight) * 100;

    let newPercent = startPercent + deltaPercent;

    // Clamp between 0 and 100
    newPercent = Math.max(0, Math.min(100, newPercent));

    dispatch('dragmove', { deltaY, percent: newPercent });
    onDrag(newPercent);
  }

  function handleMouseUp() {
    if (!isDragging) return;

    isDragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  // Cleanup on component destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  });
</script>

<div
  class="drag-handle"
  class:visible
  style="
    top: {position.anchor === 'top' ? `${position.percent}%` : 'auto'};
    bottom: {position.anchor === 'bottom' ? `${100 - position.percent}%` : 'auto'};
  "
  on:mousedown={handleMouseDown}
  role="slider"
  tabindex="0"
  aria-label="Drag to adjust subtitle position"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={position.percent}
></div>

<style>
  .drag-handle {
    position: absolute;
    width: 100%;
    height: 8px;
    cursor: ns-resize;
    pointer-events: auto;
    opacity: 0;
    transition: opacity 0.2s ease;
    background: rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(4px);
  }

  .drag-handle:hover,
  .drag-handle:focus {
    opacity: 0.6;
    outline: none;
  }

  .drag-handle:active {
    opacity: 0.8;
  }

  .drag-handle.visible {
    display: block;
  }

  .drag-handle:not(.visible) {
    display: none;
  }
</style>
