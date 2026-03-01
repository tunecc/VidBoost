<script lang="ts">
    import { slide } from "svelte/transition";
    import ToggleItem from "./ToggleItem.svelte";

    export let title: string;
    export let desc: string = "";
    export let isOpen: boolean = false;
    export let iconColor: string = "blue";
    export let masterChecked: boolean = false;

    // Events
    export let onToggleOpen: () => void = () => {};
    export let onToggleMaster: () => void = () => {};
    export let disabled: boolean = false;
</script>

<div
    class="rounded-lg transition-colors group {isOpen
        ? 'bg-indigo-500/5 dark:bg-indigo-500/10'
        : 'hover:bg-black/5 dark:hover:bg-white/10'}"
>
    <div class="flex items-center justify-between p-2">
        <div class="flex items-center gap-3">
            <!-- Icon -->
            <div
                class="w-8 h-8 rounded-lg flex items-center justify-center border transition-colors duration-300"
                style="
            background-color: {iconColor === 'blue'
                    ? 'rgba(59,130,246,0.1)'
                    : iconColor === 'red'
                      ? 'rgba(239,68,68,0.1)'
                      : iconColor === 'cyan'
                        ? 'rgba(6,182,212,0.1)'
                        : iconColor === 'indigo'
                          ? 'rgba(99,102,241,0.1)'
                          : 'rgba(59,130,246,0.1)'};
            border-color: {iconColor === 'blue'
                    ? 'rgba(59,130,246,0.1)'
                    : iconColor === 'red'
                      ? 'rgba(239,68,68,0.1)'
                      : iconColor === 'cyan'
                        ? 'rgba(6,182,212,0.1)'
                        : iconColor === 'indigo'
                          ? 'rgba(99,102,241,0.1)'
                          : 'rgba(59,130,246,0.1)'};
            color: {iconColor === 'blue'
                    ? '#2563eb'
                    : iconColor === 'red'
                      ? '#ef4444'
                      : iconColor === 'cyan'
                        ? '#06b6d4'
                        : iconColor === 'indigo'
                          ? '#4f46e5'
                          : '#2563eb'};
        "
            >
                <slot name="icon"></slot>
            </div>

            <div>
                <h4
                    class="text-sm font-medium text-gray-800 dark:text-white/90"
                >
                    {title}
                </h4>
                <p class="text-[10px] text-gray-500 dark:text-white/50">
                    {desc}
                </p>
            </div>
        </div>
        <div class="flex items-center gap-2">
            <button
                class="p-1.5 text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer outline-none"
                title="Settings"
                on:click={onToggleOpen}
            >
                <svg
                    class="w-4 h-4 transition-transform duration-200"
                    class:rotate-180={isOpen}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                    /></svg
                >
            </button>

            <!-- Mini Toggle for Master Switch of this accordion -->
            <div
                class="relative inline-flex h-4 w-7 items-center cursor-pointer outline-none"
                class:opacity-50={disabled}
                class:grayscale={disabled}
                role="button"
                tabindex="0"
                on:click={(e) => {
                    e.stopPropagation();
                    !disabled && onToggleMaster();
                }}
                on:keydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        !disabled && onToggleMaster();
                    }
                }}
            >
                <div
                    class="w-full h-full rounded-full transition-colors duration-200"
                    style="background-color: {masterChecked
                        ? iconColor === 'blue'
                            ? '#3b82f6'
                            : iconColor === 'red'
                              ? '#ef4444'
                              : iconColor === 'cyan'
                                ? '#06b6d4'
                                : iconColor === 'indigo'
                                  ? '#6366f1'
                                  : '#3b82f6'
                        : 'rgba(156, 163, 175, 0.2)'};
                   box-shadow: {masterChecked
                        ? `0 0 10px ${iconColor === 'blue' ? 'rgba(59,130,246,0.5)' : iconColor === 'red' ? 'rgba(239,68,68,0.5)' : iconColor === 'cyan' ? 'rgba(6,182,212,0.5)' : iconColor === 'indigo' ? 'rgba(99,102,241,0.5)' : 'rgba(59,130,246,0.5)'}`
                        : 'none'}"
                ></div>
                <div
                    class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm"
                    class:translate-x-3={masterChecked}
                ></div>
            </div>
        </div>
    </div>

    {#if isOpen}
        <div class="px-2 pb-2 pl-12 space-y-2" transition:slide|local>
            <slot name="content" />
        </div>
    {/if}
</div>
