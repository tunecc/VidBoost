<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { i18n } from "../lib/i18n";

    // Props
    export let language: "auto" | "en" | "zh" = "auto";

    const dispatch = createEventDispatcher();

    // Helper
    $: t = (key: any) => i18n(key, language);

    // Settings with defaults
    let speedStep = 0.1;
    let maxSpeed = 16.0;
    let restoreSpeed = 1.0;
    let seekForward = 5;
    let seekRewind = 3;
    // blockNumKeys removed as requested

    onMount(() => {
        chrome.storage.local.get(["h5_config"], (res) => {
            const conf = res.h5_config || {};
            speedStep = conf.speedStep ?? 0.1;
            maxSpeed = conf.maxSpeed ?? 16.0;
            restoreSpeed = conf.restoreSpeed ?? 1.0;
            seekForward = conf.seekForward ?? 5;
            seekRewind = conf.seekRewind ?? 3;
        });
    });

    $: {
        if (typeof chrome !== "undefined" && chrome.storage) {
            chrome.storage.local.set({
                h5_config: {
                    speedStep,
                    maxSpeed,
                    restoreSpeed,
                    seekForward,
                    seekRewind,
                },
            });
        }
    }

    function goBack() {
        dispatch("back");
    }
</script>

<div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-5 pt-6 pb-2 mb-2 flex items-center gap-3 relative z-10">
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
            class="text-lg font-bold text-gray-900 dark:text-white tracking-tight"
        >
            {t("settings_title")}
        </h2>
    </div>

    <!-- Content -->
    <div
        class="flex-1 overflow-y-auto px-4 pb-4 space-y-5 no-scrollbar relative z-10"
    >
        <!-- Speed Controls -->
        <section class="space-y-2">
            <h3
                class="ml-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/40"
            >
                {t("speed_control")}
            </h3>
            <div
                class="rounded-xl overflow-hidden bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 shadow-lg backdrop-blur-md"
            >
                <!-- Step Interval -->
                <div
                    class="p-3 flex items-center justify-between border-b border-black/5 dark:border-white/5 last:border-0"
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
                    <div class="relative">
                        <input
                            type="number"
                            step="0.05"
                            min="0.05"
                            max="1.0"
                            bind:value={speedStep}
                            class="w-20 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-3 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all"
                        />
                    </div>
                </div>

                <!-- Max Speed -->
                <div class="p-3 flex items-center justify-between">
                    <span
                        class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >{t("max_speed")}</span
                    >
                    <div class="relative">
                        <input
                            type="number"
                            step="1.0"
                            min="2.0"
                            max="16.0"
                            bind:value={maxSpeed}
                            class="w-20 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-3 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all"
                        />
                        <span
                            class="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none hidden"
                            >x</span
                        >
                    </div>
                </div>
            </div>
        </section>

        <!-- Seek Controls -->
        <section class="space-y-2">
            <h3
                class="ml-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/40"
            >
                {t("seek_control")}
            </h3>
            <div
                class="rounded-xl overflow-hidden bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 shadow-lg backdrop-blur-md"
            >
                <!-- Forward -->
                <div
                    class="p-3 flex items-center justify-between border-b border-black/5 dark:border-white/5"
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
                            class="w-20 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-3 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all"
                        />
                        <span class="text-xs text-gray-400 w-4">s</span>
                    </div>
                </div>

                <!-- Rewind -->
                <div class="p-3 flex items-center justify-between">
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
                            class="w-20 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-3 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all"
                        />
                        <span class="text-xs text-gray-400 w-4">s</span>
                    </div>
                </div>
            </div>
        </section>
    </div>
</div>
