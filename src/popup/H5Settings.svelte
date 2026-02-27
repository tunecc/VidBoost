<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from "svelte";
    import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";
    import {
        getSettings,
        setSettings,
        DEFAULT_SETTINGS,
        type Settings,
    } from "../lib/settings";

    // Props
    export let language: I18nLang = "auto";

    const dispatch = createEventDispatcher();

    // Helper
    $: t = (key: I18nKey) => i18n(key, language);

    // Settings with defaults
    let speedStep = 0.1;
    let maxSpeed = 16.0;
    let restoreSpeed = 1.0;
    let seekForward = 5;
    let seekRewind = 3;
    let loaded = false;
    const SAVE_DEBOUNCE_MS = 180;
    let saveTimer: number | null = null;
    let pendingSettings: Partial<Settings> | null = null;
    // blockNumKeys removed as requested

    onMount(() => {
        getSettings(["h5_config"]).then((res) => {
            const conf = res.h5_config || {};
            speedStep = conf.speedStep ?? DEFAULT_SETTINGS.h5_config.speedStep!;
            maxSpeed = conf.maxSpeed ?? DEFAULT_SETTINGS.h5_config.maxSpeed!;
            restoreSpeed =
                conf.restoreSpeed ?? DEFAULT_SETTINGS.h5_config.restoreSpeed!;
            seekForward =
                conf.seekForward ?? DEFAULT_SETTINGS.h5_config.seekForward!;
            seekRewind =
                conf.seekRewind ?? DEFAULT_SETTINGS.h5_config.seekRewind!;
            loaded = true;
        });
    });

    $: {
        if (loaded && typeof chrome !== "undefined" && chrome.storage) {
            pendingSettings = {
                h5_config: {
                    speedStep,
                    maxSpeed,
                    restoreSpeed,
                    seekForward,
                    seekRewind,
                },
            };
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => {
                saveTimer = null;
                if (pendingSettings) {
                    setSettings(pendingSettings);
                    pendingSettings = null;
                }
            }, SAVE_DEBOUNCE_MS);
        }
    }

    onDestroy(() => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        if (pendingSettings && typeof chrome !== "undefined" && chrome.storage) {
            setSettings(pendingSettings);
            pendingSettings = null;
        }
    });

    function goBack() {
        dispatch("back");
    }

    function adjustValue(
        current: number,
        delta: number,
        min?: number,
        max?: number,
        precision: number = 2,
    ) {
        let next = current + delta;
        if (typeof min === "number") next = Math.max(min, next);
        if (typeof max === "number") next = Math.min(max, next);
        const factor = Math.pow(10, precision);
        return Math.round(next * factor) / factor;
    }
</script>

<div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-5 pt-6 pb-3 flex items-center gap-3 relative z-10">
        <button
            class="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer text-gray-500 hover:text-gray-900 dark:text-white/70 dark:hover:text-white group"
            on:click={goBack}
            title="Back"
        >
            <svg
                class="w-5 h-5 transform group-hover:-translate-x-0.5 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M15 19l-7-7 7-7"
                /></svg
            >
        </button>
        <h2
            class="text-lg font-semibold text-gray-900 dark:text-white tracking-tight"
        >
            {t("settings_title")}
        </h2>
    </div>
    <div
        class="h-[1px] w-full bg-gradient-to-r from-transparent via-gray-200 dark:via-white/10 to-transparent mb-2"
    ></div>

    <!-- Content -->
    <div
        class="flex-1 overflow-y-auto px-4 pb-4 space-y-5 no-scrollbar relative z-10"
    >
        <!-- Speed Controls -->
        <section class="space-y-2">
            <div class="flex items-center gap-2 ml-1">
                <span class="h-[10px] w-[2px] rounded-full bg-blue-500/60"
                ></span>
                <h3
                    class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/50"
                >
                    {t("speed_control")}
                </h3>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden">
                <!-- Step Interval -->
                <div
                    class="p-3 flex items-center justify-between border-b border-black/5 dark:border-white/5 last:border-0 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                    <div>
                        <span
                            class="text-sm font-medium text-gray-800 dark:text-white/90"
                            >{t("step_interval")}</span
                        >
                        <p
                            class="text-[10px] text-gray-500 dark:text-white/40 mt-0.5"
                        >
                            {t("step_desc")}
                        </p>
                    </div>
                    <div class="relative flex items-center gap-2">
                        <input
                            type="number"
                            step="0.05"
                            min="0.05"
                            max="1.0"
                            bind:value={speedStep}
                            class="num-input w-14 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-2 py-1 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all hover:bg-black/10 dark:hover:bg-white/20 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                        />
                        <div
                            class="flex flex-col overflow-hidden rounded-md border border-white/30 dark:border-white/15 bg-white/40 dark:bg-white/10 backdrop-blur-sm shadow-sm"
                        >
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors"
                                on:click={() =>
                                    (speedStep = adjustValue(
                                        speedStep,
                                        0.05,
                                        0.05,
                                        1.0,
                                        2,
                                    ))}
                                aria-label="Increase step"
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M18 15l-6-6-6 6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                on:click={() =>
                                    (speedStep = adjustValue(
                                        speedStep,
                                        -0.05,
                                        0.05,
                                        1.0,
                                        2,
                                    ))}
                                aria-label="Decrease step"
                                disabled={speedStep <= 0.05}
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M6 9l6 6 6-6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Max Speed -->
                <div
                    class="p-3 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                    <span
                        class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >{t("max_speed")}</span
                    >
                    <div class="relative flex items-center gap-2">
                        <input
                            type="number"
                            step="1.0"
                            min="2.0"
                            max="16.0"
                            bind:value={maxSpeed}
                            class="num-input w-14 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-2 py-1 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all hover:bg-black/10 dark:hover:bg-white/20 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                        />
                        <div
                            class="flex flex-col overflow-hidden rounded-md border border-white/30 dark:border-white/15 bg-white/40 dark:bg-white/10 backdrop-blur-sm shadow-sm"
                        >
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                on:click={() =>
                                    (maxSpeed = adjustValue(
                                        maxSpeed,
                                        1,
                                        2,
                                        16,
                                        0,
                                    ))}
                                aria-label="Increase max speed"
                                disabled={maxSpeed >= 16}
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M18 15l-6-6-6 6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                on:click={() =>
                                    (maxSpeed = adjustValue(
                                        maxSpeed,
                                        -1,
                                        2,
                                        16,
                                        0,
                                    ))}
                                aria-label="Decrease max speed"
                                disabled={maxSpeed <= 2}
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M6 9l6 6 6-6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Seek Controls -->
        <section class="space-y-2">
            <div class="flex items-center gap-2 ml-1">
                <span class="h-[10px] w-[2px] rounded-full bg-blue-500/60"
                ></span>
                <h3
                    class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/50"
                >
                    {t("seek_control")}
                </h3>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden">
                <!-- Forward -->
                <div
                    class="p-3 flex items-center justify-between border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                    <span
                        class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >{t("seek_forward")}</span
                    >
                    <div class="relative flex items-center gap-2">
                        <input
                            type="number"
                            step="1"
                            min="1"
                            bind:value={seekForward}
                            class="num-input w-14 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-2 py-1 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all hover:bg-black/10 dark:hover:bg-white/20 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                        />
                        <div
                            class="flex flex-col overflow-hidden rounded-md border border-white/30 dark:border-white/15 bg-white/40 dark:bg-white/10 backdrop-blur-sm shadow-sm"
                        >
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors"
                                on:click={() =>
                                    (seekForward = adjustValue(
                                        seekForward,
                                        1,
                                        1,
                                        undefined,
                                        0,
                                    ))}
                                aria-label="Increase seek forward"
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M18 15l-6-6-6 6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                on:click={() =>
                                    (seekForward = adjustValue(
                                        seekForward,
                                        -1,
                                        1,
                                        undefined,
                                        0,
                                    ))}
                                aria-label="Decrease seek forward"
                                disabled={seekForward <= 1}
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M6 9l6 6 6-6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                        </div>
                        <span class="text-xs text-gray-400 w-4">s</span>
                    </div>
                </div>

                <!-- Rewind -->
                <div
                    class="p-3 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                    <span
                        class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >{t("seek_rewind")}</span
                    >
                    <div class="relative flex items-center gap-2">
                        <input
                            type="number"
                            step="1"
                            min="1"
                            bind:value={seekRewind}
                            class="num-input w-14 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-2 py-1 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all hover:bg-black/10 dark:hover:bg-white/20 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                        />
                        <div
                            class="flex flex-col overflow-hidden rounded-md border border-white/30 dark:border-white/15 bg-white/40 dark:bg-white/10 backdrop-blur-sm shadow-sm"
                        >
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors"
                                on:click={() =>
                                    (seekRewind = adjustValue(
                                        seekRewind,
                                        1,
                                        1,
                                        undefined,
                                        0,
                                    ))}
                                aria-label="Increase seek rewind"
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M18 15l-6-6-6 6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                            <button
                                class="px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-white/70 hover:bg-white/40 dark:hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                on:click={() =>
                                    (seekRewind = adjustValue(
                                        seekRewind,
                                        -1,
                                        1,
                                        undefined,
                                        0,
                                    ))}
                                aria-label="Decrease seek rewind"
                                disabled={seekRewind <= 1}
                            >
                                <svg
                                    class="w-2.5 h-2.5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M6 9l6 6 6-6"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    ></path>
                                </svg>
                            </button>
                        </div>
                        <span class="text-xs text-gray-400 w-4">s</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- Shortcuts -->
        <section class="space-y-2">
            <div class="flex items-center gap-2 ml-1">
                <span class="h-[10px] w-[2px] rounded-full bg-blue-500/60"
                ></span>
                <h3
                    class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/50"
                >
                    {t("h5_shortcuts")}
                </h3>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden p-3 space-y-2">
                <p class="text-[11px] text-gray-600 dark:text-white/60">
                    {t("h5_shortcuts_desc")}
                </p>
                <div
                    class="grid grid-cols-2 gap-2 text-[11px] text-gray-700 dark:text-white/70"
                >
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 text-[10px]"
                            >1-6</span
                        >
                        <span>{t("h5_key_speed_numeric")}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 text-[10px]"
                            >C</span
                        >
                        <span>{t("h5_key_speed_up")}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 text-[10px]"
                            >X</span
                        >
                        <span>{t("h5_key_speed_down")}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 text-[10px]"
                            >Z</span
                        >
                        <span>{t("h5_key_speed_reset")}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 text-[10px]"
                            >Enter</span
                        >
                        <span>{t("h5_key_fullscreen")}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 text-[10px]"
                            >→</span
                        >
                        <span>{t("h5_key_seek_forward")}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span
                            class="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 text-[10px]"
                            >←</span
                        >
                        <span>{t("h5_key_seek_back")}</span>
                    </div>
                </div>
            </div>
        </section>
    </div>
</div>

<style>
    :global(.num-input) {
        appearance: textfield;
        -moz-appearance: textfield;
    }
    :global(.num-input::-webkit-outer-spin-button),
    :global(.num-input::-webkit-inner-spin-button) {
        -webkit-appearance: none;
        margin: 0;
    }
</style>
