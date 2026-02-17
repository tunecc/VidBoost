<script lang="ts">
  import { slide } from "svelte/transition";

  export let title: string;
  export let iconColor: string = "blue";
  export let isOpen: boolean = true;
  export let enabled: boolean = true;
  export let onToggle: () => void;
</script>

<div
  class="rounded-xl overflow-hidden glass-panel transition-opacity duration-300"
  class:opacity-50={!enabled}
>
  <button
    class="w-full px-4 py-3 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer outline-none"
    on:click={onToggle}
  >
    <div class="flex items-center gap-2">
      <!-- Note: Ideally we pass the color class, but dynamic Tailwind classes need safelist. 
           For now using inline style for the shadow glow or simple mapping. 
           Let's stick to simple props or slots if needed. 
           Actually, let's use a mapping for the dot color to be safe with Tailwind. -->

      <div
        class="w-2 h-2 rounded-full {iconColor === 'blue'
          ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
          : ''} {iconColor === 'red'
          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
          : ''} {iconColor === 'purple'
          ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]'
          : ''} {iconColor === 'cyan'
          ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
          : ''} {iconColor === 'pink'
          ? 'bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.5)]'
          : ''}"
      ></div>

      <h3 class="font-semibold text-sm text-gray-800 dark:text-white/90">
        {title}
      </h3>
    </div>
    <svg
      class="w-4 h-4 text-gray-400 dark:text-white/50 transition-transform duration-300"
      class:rotate-180={isOpen}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  </button>

  {#if isOpen}
    <div
      class="p-2 space-y-2 border-t border-black/5 dark:border-white/10"
      transition:slide|local={{ duration: 300 }}
    >
      <slot />
    </div>
  {/if}
</div>
