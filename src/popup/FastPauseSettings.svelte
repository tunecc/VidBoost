<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { i18n } from "../lib/i18n";

    export let language: "auto" | "en" | "zh" = "auto";
    const dispatch = createEventDispatcher();

    // Helper
    $: t = (key: any) => i18n(key, language);

    let loaded = false;
    let globalEnabled = true; // Master toggle for this feature
    let enableBilibili = true;
    let enableYouTube = true;

    onMount(() => {
        chrome.storage.local.get(
            ["bnd_enabled", "yt_fast_pause", "bnd_config"],
            (res) => {
                // Logic:
                // We have separate legacy keys: 'bnd_enabled' (Bilibili) and 'yt_fast_pause' (YouTube)
                // The user wants a "Master Switch" in UI, and then sub-switches.
                // But strictly legally, these are independent features in the background.
                // Let's create a virtual 'globalEnabled' for this view.
                // If either is enabled, global is true. If both disabled, global false.

                enableBilibili = res.bnd_enabled !== false;
                enableYouTube = res.yt_fast_pause !== false;

                // If user manually turned off both, master is off.
                // If fresh install (undefined -> true), master is on.
                globalEnabled = enableBilibili || enableYouTube;

                loaded = true;
            },
        );
    });

    $: {
        if (loaded && typeof chrome !== "undefined" && chrome.storage) {
            // We sync back to the individual feature flags
            // If master is OFF, both are OFF.
            // If master is ON, they respect their individual toggles.

            const finalBilibili = globalEnabled && enableBilibili;
            const finalYouTube = globalEnabled && enableYouTube;

            chrome.storage.local.set({
                bnd_enabled: finalBilibili,
                yt_fast_pause: finalYouTube,
            });
        }
    }
</script>

<div class="h-full flex flex-col bg-gray-50 dark:bg-[#1a1b1e]">
    <!-- Header -->
    <header
        class="px-4 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800"
    >
        <button
            class="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
            on:click={() => dispatch("back")}
        >
            <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                /></svg
            >
        </button>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-white">
            {t("fast_pause_title")}
        </h2>
    </header>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- Master Switch -->
        <div
            class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700"
        >
            <div class="flex items-center gap-3">
                <div
                    class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-500"
                >
                    <svg
                        class="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        ></path></svg
                    >
                </div>
                <div>
                    <h3 class="font-medium text-gray-900 dark:text-gray-100">
                        {t("fast_pause_master")}
                    </h3>
                    <p class="text-xs text-gray-400">{t("fast_pause_desc")}</p>
                </div>
            </div>
            <div
                class="relative inline-flex h-5 w-9 items-center cursor-pointer transition-colors"
                on:click={() => (globalEnabled = !globalEnabled)}
            >
                <div
                    class="w-full h-full rounded-full transition-colors duration-200"
                    class:bg-indigo-500={globalEnabled}
                    class:bg-gray-200={!globalEnabled}
                    class:dark:bg-gray-600={!globalEnabled}
                ></div>
                <div
                    class="absolute left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow-sm"
                    class:translate-x-4={globalEnabled}
                ></div>
            </div>
        </div>

        {#if globalEnabled}
            <div in:fade class="space-y-3">
                <h3
                    class="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1"
                >
                    {t("platforms")}
                </h3>

                <!-- Bilibili -->
                <div
                    class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
                >
                    <div class="flex items-center gap-3">
                        <span
                            class="w-8 h-8 flex items-center justify-center rounded-md bg-sky-100 dark:bg-sky-900/30 text-sky-500"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                                ></path><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                ></path></svg
                            >
                        </span>
                        <span
                            class="font-medium text-sm text-gray-700 dark:text-gray-200"
                            >Bilibili</span
                        >
                    </div>

                    <div
                        class="relative inline-flex h-4 w-7 items-center cursor-pointer"
                        on:click={() => (enableBilibili = !enableBilibili)}
                    >
                        <div
                            class="w-full h-full rounded-full transition-colors duration-200"
                            class:bg-sky-500={enableBilibili}
                            class:bg-gray-200={!enableBilibili}
                            class:dark:bg-gray-600={!enableBilibili}
                        ></div>
                        <div
                            class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm"
                            class:translate-x-3={enableBilibili}
                        ></div>
                    </div>
                </div>

                <!-- YouTube -->
                <div
                    class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
                >
                    <div class="flex items-center gap-3">
                        <span
                            class="w-8 h-8 flex items-center justify-center rounded-md bg-red-100 dark:bg-red-900/30 text-red-500"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 9l-7 7-7-7"
                                ></path></svg
                            >
                        </span>
                        <span
                            class="font-medium text-sm text-gray-700 dark:text-gray-200"
                            >YouTube</span
                        >
                    </div>

                    <div
                        class="relative inline-flex h-4 w-7 items-center cursor-pointer"
                        on:click={() => (enableYouTube = !enableYouTube)}
                    >
                        <div
                            class="w-full h-full rounded-full transition-colors duration-200"
                            class:bg-red-500={enableYouTube}
                            class:bg-gray-200={!enableYouTube}
                            class:dark:bg-gray-600={!enableYouTube}
                        ></div>
                        <div
                            class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm"
                            class:translate-x-3={enableYouTube}
                        ></div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
