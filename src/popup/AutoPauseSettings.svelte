<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from "svelte";
    import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";
    import {
        getSettings,
        setSettings,
        DEFAULT_SETTINGS,
        type Settings,
    } from "../lib/settings";
    import { normalizeDomainList } from "../lib/domain";

    export let language: I18nLang = "auto";
    const dispatch = createEventDispatcher();

    $: t = (key: I18nKey) => i18n(key, language);

    let loaded = false;
    let scope: "all" | "selected" = "all";
    let siteYouTube = true;
    let siteBilibili = true;
    let customSitesText = "";
    const SAVE_DEBOUNCE_MS = 180;
    let saveTimer: number | null = null;
    let pendingSettings: Partial<Settings> | null = null;

    onMount(() => {
        getSettings(["ap_scope", "ap_sites", "ap_custom_sites"]).then((res) => {
            scope = res.ap_scope || DEFAULT_SETTINGS.ap_scope;
            siteYouTube = res.ap_sites?.["youtube.com"] !== false;
            siteBilibili = res.ap_sites?.["bilibili.com"] !== false;
            if (Array.isArray(res.ap_custom_sites)) {
                customSitesText = normalizeDomainList(res.ap_custom_sites).join("\n");
            }
            loaded = true;
        });
    });

    $: {
        if (loaded && typeof chrome !== "undefined" && chrome.storage) {
            const customSites = normalizeDomainList(
                customSitesText
                    .split(/\s+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
            );
            pendingSettings = {
                ap_scope: scope,
                ap_sites: {
                    "youtube.com": siteYouTube,
                    "bilibili.com": siteBilibili,
                },
                ap_custom_sites: customSites,
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
</script>

<div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-5 pt-6 pb-3 flex items-center gap-3 relative z-10">
        <button
            class="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer text-gray-500 hover:text-gray-900 dark:text-white/70 dark:hover:text-white group"
            on:click={() => dispatch("back")}
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
            {t("autopause_settings")}
        </h2>
    </div>
    <div
        class="h-[1px] w-full bg-gradient-to-r from-transparent via-gray-200 dark:via-white/10 to-transparent mb-2"
    ></div>

    <!-- Content -->
    <div
        class="flex-1 overflow-y-auto px-4 pb-4 space-y-5 no-scrollbar relative z-10"
    >
        <section class="space-y-2">
            <div class="flex items-center gap-2 ml-1">
                <span class="h-[10px] w-[2px] rounded-full bg-blue-500/60"
                ></span>
                <h3
                    class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/50"
                >
                    {t("autopause_scope")}
                </h3>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden">
                <label
                    class="p-3 flex items-center justify-between border-b border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                    <div>
                        <span
                            class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >
                            {t("autopause_scope_all")}
                        </span>
                        <p
                            class="text-[10px] text-gray-500 dark:text-white/40 mt-0.5"
                        >
                            {t("autopause_scope_all_desc")}
                        </p>
                    </div>
                    <input
                        type="radio"
                        name="ap-scope"
                        value="all"
                        bind:group={scope}
                        class="accent-blue-500"
                    />
                </label>

                <label
                    class="p-3 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                    <div>
                        <span
                            class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >
                            {t("autopause_scope_selected")}
                        </span>
                        <p
                            class="text-[10px] text-gray-500 dark:text-white/40 mt-0.5"
                        >
                            {t("autopause_scope_selected_desc")}
                        </p>
                    </div>
                    <input
                        type="radio"
                        name="ap-scope"
                        value="selected"
                        bind:group={scope}
                        class="accent-blue-500"
                    />
                </label>
            </div>
        </section>

        <section class="space-y-2">
            <div class="flex items-center gap-2 ml-1">
                <span class="h-[10px] w-[2px] rounded-full bg-blue-500/60"
                ></span>
                <h3
                    class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/50"
                >
                    {t("autopause_sites")}
                </h3>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden">
                <button
                    class="w-full px-3 py-2 flex items-center justify-between border-b border-black/5 dark:border-white/5 transition-colors {scope ===
                    'all'
                        ? 'opacity-50'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'} {siteYouTube
                        ? ''
                        : 'grayscale opacity-70'}"
                    on:click={() => {
                        if (scope === "all") return;
                        siteYouTube = !siteYouTube;
                    }}
                >
                    <div class="flex items-center gap-3">
                        <span
                            class="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] {siteYouTube
                                ? 'bg-red-500'
                                : 'bg-black/10 dark:bg-white/20'}"
                        ></span>
                        <span
                            class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >
                            {t("autopause_site_youtube")}
                        </span>
                    </div>
                    <div class="relative inline-flex h-3.5 w-6 items-center">
                        <div
                            class="w-full h-full rounded-full transition-colors duration-200 {siteYouTube
                                ? 'bg-red-500'
                                : 'bg-black/10 dark:bg-white/20'}"
                        ></div>
                        <div
                            class="absolute left-[2px] w-2.5 h-2.5 bg-white rounded-full transition-transform duration-200 shadow-sm"
                            class:translate-x-2.5={siteYouTube}
                        ></div>
                    </div>
                </button>

                <button
                    class="w-full px-3 py-2 flex items-center justify-between transition-colors {scope ===
                    'all'
                        ? 'opacity-50'
                        : 'hover:bg-black/5 dark:hover:bg-white/5'} {siteBilibili
                        ? ''
                        : 'grayscale opacity-70'}"
                    on:click={() => {
                        if (scope === "all") return;
                        siteBilibili = !siteBilibili;
                    }}
                >
                    <div class="flex items-center gap-3">
                        <span
                            class="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(14,165,233,0.6)] {siteBilibili
                                ? 'bg-sky-500'
                                : 'bg-black/10 dark:bg-white/20'}"
                        ></span>
                        <span
                            class="text-sm font-medium text-gray-800 dark:text-white/90"
                        >
                            {t("autopause_site_bilibili")}
                        </span>
                    </div>
                    <div class="relative inline-flex h-3.5 w-6 items-center">
                        <div
                            class="w-full h-full rounded-full transition-colors duration-200 {siteBilibili
                                ? 'bg-sky-500'
                                : 'bg-black/10 dark:bg-white/20'}"
                        ></div>
                        <div
                            class="absolute left-[2px] w-2.5 h-2.5 bg-white rounded-full transition-transform duration-200 shadow-sm"
                            class:translate-x-2.5={siteBilibili}
                        ></div>
                    </div>
                </button>
            </div>
        </section>

        <section class="space-y-2">
            <div class="flex items-center gap-2 ml-1">
                <span class="h-[10px] w-[2px] rounded-full bg-blue-500/60"
                ></span>
                <h3
                    class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/50"
                >
                    {t("autopause_custom_sites")}
                </h3>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden p-3 space-y-2">
                <p class="text-[10px] text-gray-500 dark:text-white/40">
                    {t("autopause_custom_desc")}
                </p>
                <textarea
                    rows="4"
                    bind:value={customSitesText}
                    placeholder={t("autopause_custom_placeholder")}
                    class="w-full bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 outline-none transition-all resize-none hover:bg-black/10 dark:hover:bg-white/20 focus:shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                ></textarea>
            </div>
        </section>
    </div>
</div>
