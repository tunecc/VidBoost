<script lang="ts">
  export let title: string;
  export let desc: string = "";
  export let checked: boolean = false;
  export let iconColor: string = "blue"; // blue, red, pink, purple, indigo
  export let onClick: () => void = () => {};
  export let onSettings: (() => void) | undefined = undefined;
  export let disabled: boolean = false;
  export let compact: boolean = false;
</script>

<div
  class="flex items-center justify-between rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors group cursor-pointer"
  class:p-2={!compact}
  class:p-1.5={compact}
  class:opacity-60={disabled}
  class:grayscale={disabled || !checked}
  role="button"
  tabindex="0"
  on:click={onClick}
  on:keydown={(e) => {
    if (e.key === "Enter" || e.key === " ") onClick();
  }}
>
  <div class="flex items-center gap-3">
    <!-- Icon Placeholder -->
    <div
      class="rounded-lg flex items-center justify-center border transition-colors duration-300"
      class:w-8={!compact}
      class:h-8={!compact}
      class:w-6={compact}
      class:h-6={compact}
      class:bg-blue-500-10={iconColor === "blue"}
      class:dark-bg-blue-500-20={iconColor === "blue"}
      class:text-blue-600={iconColor === "blue"}
      class:dark-text-blue-300={iconColor === "blue"}
      class:border-blue-500-10={iconColor === "blue"}
      style="
        background-color: {iconColor === 'blue'
        ? 'rgba(59,130,246,0.1)'
        : iconColor === 'red'
          ? 'rgba(239,68,68,0.1)'
          : iconColor === 'pink'
            ? 'rgba(236,72,153,0.1)'
            : iconColor === 'purple'
              ? 'rgba(168,85,247,0.1)'
              : iconColor === 'indigo'
                ? 'rgba(99,102,241,0.1)'
                : 'rgba(59,130,246,0.1)'};
        border-color: {iconColor === 'blue'
        ? 'rgba(59,130,246,0.1)'
        : iconColor === 'red'
          ? 'rgba(239,68,68,0.1)'
          : iconColor === 'pink'
            ? 'rgba(236,72,153,0.1)'
            : iconColor === 'purple'
              ? 'rgba(168,85,247,0.1)'
              : iconColor === 'indigo'
                ? 'rgba(99,102,241,0.1)'
                : 'rgba(59,130,246,0.1)'};
        color: {iconColor === 'blue'
        ? '#2563eb'
        : iconColor === 'red'
          ? '#dc2626'
          : iconColor === 'pink'
            ? '#db2777'
            : iconColor === 'purple'
              ? '#9333ea'
              : iconColor === 'indigo'
                ? '#4f46e5'
                : '#2563eb'};
      "
    >
      <slot name="icon">
        <!-- Default Icon if none provided -->
        <div
          class="bg-current rounded-full opacity-50"
          class:w-4={!compact}
          class:h-4={!compact}
          class:w-3={compact}
          class:h-3={compact}
        ></div>
      </slot>
    </div>

    <div>
      <h4
        class="font-medium text-gray-800 dark:text-white/90"
        class:text-sm={!compact}
        class:text-xs={compact}
      >
        {title}
      </h4>
      {#if desc}
        <p
          class="text-gray-500 dark:text-white/50"
          class:text-[10px]={!compact}
          class:text-[9px]={compact}
        >
          {desc}
        </p>
      {/if}
    </div>
  </div>

  <div class="flex items-center gap-2">
    {#if onSettings}
      <button
        class="p-1.5 text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer outline-none"
        title="Settings"
        on:click|stopPropagation={onSettings}
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          ></path>
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          ></path>
        </svg>
      </button>
    {/if}

    <div class="relative inline-flex h-4 w-7 items-center">
      <div
        class="w-full h-full rounded-full transition-colors duration-300"
        style="background-color: {checked
          ? iconColor === 'blue'
            ? '#3b82f6'
            : iconColor === 'red'
              ? '#ef4444'
              : iconColor === 'pink'
                ? '#ec4899'
                : iconColor === 'purple'
                  ? '#a855f7'
                  : iconColor === 'indigo'
                    ? '#6366f1'
                    : '#3b82f6'
          : 'rgba(156, 163, 175, 0.2)'};
                 box-shadow: {checked
          ? `0 0 10px ${iconColor === 'blue' ? 'rgba(59,130,246,0.5)' : iconColor === 'red' ? 'rgba(239,68,68,0.5)' : iconColor === 'pink' ? 'rgba(236,72,153,0.5)' : iconColor === 'purple' ? 'rgba(168,85,247,0.5)' : iconColor === 'indigo' ? 'rgba(99,102,241,0.5)' : 'rgba(59,130,246,0.5)'}`
          : 'none'}"
      ></div>
      <div
        class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm"
        class:translate-x-3={checked}
      ></div>
    </div>
  </div>
</div>
