<script lang="ts">
  import type { SubtitleFragment } from '../utils/types';
  import DragHandle from './DragHandle.svelte';
  import SubtitleText from './SubtitleText.svelte';

  export let fragments: SubtitleFragment[] = [];
  export let currentTime: number = 0;
  export let position: { anchor: 'top' | 'bottom'; percent: number } = { anchor: 'bottom', percent: 20 };
  export let fontSize: number = 32;
  export let color: string = '#FFFFFF';
  export let backgroundColor: string = '#000000';
  export let opacity: number = 0.8;
  export let outlined: boolean = false;
  export let dragEnabled: boolean = true;

  let isDragging = false;
  let currentFragment: SubtitleFragment | null = null;

  $: {
    // Binary search for current subtitle fragment
    currentFragment = findCurrentFragment(fragments, currentTime);
  }

  $: containerStyle = position.anchor === 'top'
    ? `top: ${position.percent}%;`
    : `bottom: ${position.percent}%;`;

  function findCurrentFragment(frags: SubtitleFragment[], time: number): SubtitleFragment | null {
    if (frags.length === 0) return null;

    let left = 0;
    let right = frags.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const frag = frags[mid];

      if (time >= frag.start && time < frag.end) {
        return frag;
      } else if (time < frag.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return null;
  }

  function handleDragMove(event: CustomEvent<{ deltaY: number; percent: number }>) {
    position = {
      anchor: position.anchor,
      percent: event.detail.percent
    };
  }

  function handleDragStart() {
    isDragging = true;
  }

  function handleDragEnd() {
    isDragging = false;
  }
</script>

<div class="subtitle-container" style={containerStyle}>
  {#if dragEnabled}
    <DragHandle
      visible={true}
      {position}
      on:dragmove={handleDragMove}
      on:dragstart={handleDragStart}
      on:dragend={handleDragEnd}
    />
  {/if}

  {#if currentFragment}
    <SubtitleText
      text={currentFragment.text}
      {fontSize}
      {color}
      {backgroundColor}
      {opacity}
      {outlined}
    />
  {/if}
</div>

<style>
  .subtitle-container {
    position: absolute;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    transition: top 0.1s ease-out, bottom 0.1s ease-out;
  }
</style>
