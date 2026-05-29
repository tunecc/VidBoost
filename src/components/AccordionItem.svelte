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

    const iconPalettes: Record<string, { background: string; border: string; color: string }> = {
        blue: {
            background: "rgba(59,130,246,0.1)",
            border: "rgba(59,130,246,0.1)",
            color: "#2563eb",
        },
        red: {
            background: "rgba(239,68,68,0.1)",
            border: "rgba(239,68,68,0.1)",
            color: "#ef4444",
        },
        cyan: {
            background: "rgba(6,182,212,0.1)",
            border: "rgba(6,182,212,0.1)",
            color: "#06b6d4",
        },
        indigo: {
            background: "rgba(99,102,241,0.1)",
            border: "rgba(99,102,241,0.1)",
            color: "#4f46e5",
        },
    };

    const mutedIconPalette = {
        background: "rgba(107,114,128,0.1)",
        border: "rgba(107,114,128,0.18)",
        color: "#6b7280",
    };

    $: iconMuted = disabled || !masterChecked;
    $: iconPalette = iconMuted
        ? mutedIconPalette
        : iconPalettes[iconColor] ?? iconPalettes.blue;
</script>

<div
    class="rounded-lg transition-colors group {isOpen
        ? 'bg-indigo-500/5 dark:bg-indigo-500/10'
        : 'hover:bg-black/5 dark:hover:bg-white/10'}"
>
    <div class="flex items-center gap-2 p-1.5">
        <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left outline-none transition-colors hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-blue-400/25 dark:hover:bg-white/[0.04]"
            aria-expanded={isOpen}
            on:click={onToggleOpen}
        >
            <!-- Icon -->
            <div
                class="w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center border transition-colors duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                class:feature-icon-muted={iconMuted}
                style="
            background-color: {iconPalette.background};
            border-color: {iconPalette.border};
            color: {iconPalette.color};
        "
            >
                <slot name="icon"></slot>
            </div>

            <div class="min-w-0">
                <h4
                    class="truncate text-sm font-medium text-gray-800 dark:text-white/90"
                >
                    {title}
                </h4>
                <p class="truncate text-[10px] text-gray-500 dark:text-white/50">
                    {desc}
                </p>
            </div>
            <svg
                class="ml-auto w-4 h-4 shrink-0 text-gray-400 dark:text-white/50 transition-transform duration-200"
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

        <div class="flex items-center gap-2">
            <!-- Mini Toggle for Master Switch of this accordion -->
            <div
                class="relative inline-flex h-4 w-7 items-center cursor-pointer outline-none"
                class:opacity-50={disabled}
                class:grayscale={disabled}
                role="button"
                tabindex={disabled ? -1 : 0}
                aria-disabled={disabled}
                on:click={(e) => {
                    e.stopPropagation();
                    !disabled && onToggleMaster();
                }}
                on:keydown={(e) => {
                    if (disabled) return;
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleMaster();
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
        <div class="px-2 pb-2 space-y-2" transition:slide|local>
            <slot name="content" />
        </div>
    {/if}
</div>

<style>
    .feature-icon-muted :global(*) {
        color: inherit !important;
    }

    .feature-icon-muted :global([fill]:not([fill="none"])) {
        fill: currentColor !important;
    }

    .feature-icon-muted :global([stroke]:not([stroke="none"])) {
        stroke: currentColor !important;
    }
</style>
