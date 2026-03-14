<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";
    import { CDN_NODES, type CdnNode } from "../lib/bilibiliCdnData";
    import {
        BB_CDN_SPEED_TEST_SAMPLE_SIZE_MAX_MIB,
        BB_CDN_SPEED_TEST_SAMPLE_SIZE_MIN_MIB,
        BB_CDN_SPEED_TEST_TIMEOUT_MAX_SECONDS,
        BB_CDN_SPEED_TEST_TIMEOUT_MIN_SECONDS,
    } from "../features/bilibili/bilibiliCdn.shared";

    export let language: I18nLang = "auto";
    export let globalEnabled: boolean = true;
    export let bbCdnEnabled: boolean = false;
    export let bbCdnNode: string = "";
    // Expose these props so App.svelte can pass them down or bind to them
    export let bbCdnTesting: boolean = false;
    export let bbCdnSpeedResults: Record<
        string,
        { speed: string; error?: boolean }
    > = {};
    export let speedTestIncludeOverseas: boolean = true;
    export let speedTestAutoSelectBest: boolean = false;
    export let speedTestSortBySpeed: boolean = false;
    export let speedTestSampleSizeMiB: number = 8;
    export let speedTestTimeoutSeconds: number = 10;

    const dispatch = createEventDispatcher();
    const originalNodeOrder = new Map(CDN_NODES.map((node, index) => [node.id, index]));
    let showSpeedTestSettings = false;
    let orderedNodes: CdnNode[] = CDN_NODES;

    $: t = (key: I18nKey) => i18n(key, language);
    $: {
        const results = bbCdnSpeedResults;
        orderedNodes = speedTestSortBySpeed
            ? [...CDN_NODES].sort((a, b) => compareNodesBySpeed(a, b, results))
            : CDN_NODES;
    }

    function goBack() {
        dispatch("back");
    }

    function selectNode(host: string) {
        bbCdnNode = host;
        // Dispatch selected event to update parent state immediately
        dispatch("update", { bbCdnNode });
    }

    function startSpeedTest() {
        if (!globalEnabled || !bbCdnEnabled) return;
        showSpeedTestSettings = false;
        if (bbCdnTesting) {
            dispatch("abortspeedtest");
        } else {
            dispatch("speedtest");
        }
    }

    function getProviderBg(id: string, isSelected: boolean) {
        if (isSelected)
            return "bg-cyan-50/80 border-cyan-200 dark:bg-cyan-500/20 dark:border-cyan-500/30 ring-1 ring-inset ring-cyan-500/20 shadow-sm z-10";

        if (id === "")
            return "bg-white/80 dark:bg-[#252525]/80 border-black/5 dark:border-white/5 hover:bg-white dark:hover:bg-[#303030] shadow-[0_2px_4px_rgba(0,0,0,0.02)]";
        if (id.includes("ali"))
            return "bg-blue-50/40 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20 hover:bg-blue-50/80 dark:hover:bg-blue-500/20 shadow-[0_2px_4px_rgba(0,0,0,0.02)]";
        if (id.includes("cos") || id.includes("tx"))
            return "bg-emerald-50/40 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 hover:bg-emerald-50/80 dark:hover:bg-emerald-500/20 shadow-[0_2px_4px_rgba(0,0,0,0.02)]";
        if (id.includes("hw") || id.includes("08"))
            return "bg-rose-50/40 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20 hover:bg-rose-50/80 dark:hover:bg-rose-500/20 shadow-[0_2px_4px_rgba(0,0,0,0.02)]";
        return "bg-purple-50/40 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20 hover:bg-purple-50/80 dark:hover:bg-purple-500/20 shadow-[0_2px_4px_rgba(0,0,0,0.02)]";
    }

    function getSpeedValue(result?: { speed: string; error?: boolean }): number | null {
        if (!result || result.error) return null;
        const parsed = Number.parseFloat(result.speed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getNodeSortBucket(
        node: CdnNode,
        results: Record<string, { speed: string; error?: boolean }>
    ): number {
        const result = results[node.id];
        if (!result) return 1;
        return getSpeedValue(result) === null ? 2 : 0;
    }

    function compareNodesBySpeed(
        a: CdnNode,
        b: CdnNode,
        results: Record<string, { speed: string; error?: boolean }>
    ): number {
        const bucketDiff = getNodeSortBucket(a, results) - getNodeSortBucket(b, results);
        if (bucketDiff !== 0) return bucketDiff;

        const aSpeed = getSpeedValue(results[a.id]);
        const bSpeed = getSpeedValue(results[b.id]);
        if (aSpeed !== null && bSpeed !== null && aSpeed !== bSpeed) {
            return bSpeed - aSpeed;
        }

        return (originalNodeOrder.get(a.id) ?? 0) - (originalNodeOrder.get(b.id) ?? 0);
    }

    function clampInteger(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, Math.round(value)));
    }

    function setSampleSizeValue(raw: string) {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return;
        speedTestSampleSizeMiB = clampInteger(
            parsed,
            BB_CDN_SPEED_TEST_SAMPLE_SIZE_MIN_MIB,
            BB_CDN_SPEED_TEST_SAMPLE_SIZE_MAX_MIB
        );
    }

    function setTimeoutValue(raw: string) {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return;
        speedTestTimeoutSeconds = clampInteger(
            parsed,
            BB_CDN_SPEED_TEST_TIMEOUT_MIN_SECONDS,
            BB_CDN_SPEED_TEST_TIMEOUT_MAX_SECONDS
        );
    }

    function handleSampleSizeInput(event: Event) {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) return;
        setSampleSizeValue(target.value);
    }

    function handleTimeoutInput(event: Event) {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) return;
        setTimeoutValue(target.value);
    }
</script>

<div
    class="relative isolate h-full flex flex-col bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-3xl"
>
    <!-- Header -->
    <div
        class="px-5 pt-6 pb-3 flex items-start justify-between relative z-30 border-b border-black/5 dark:border-white/5"
    >
        <div class="flex items-start gap-3">
            <button
                class="p-2 -ml-2 mt-[-2px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer text-gray-500 hover:text-gray-900 dark:text-white/70 dark:hover:text-white group"
                on:click={goBack}
                title={t("back")}
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
            <div class="flex flex-col gap-0.5">
                <h2
                    class="text-lg font-semibold text-gray-900 dark:text-white tracking-tight leading-none pt-[2px]"
                >
                    {t("bb_cdn_node")}
                </h2>
                <div
                    class="text-[10px] text-gray-500/80 dark:text-white/40 font-medium tracking-wide mt-1"
                >
                    ⚡ {t("bb_cdn_reload_hint")}
                </div>
            </div>
        </div>

        <div class="relative flex items-center gap-2 shrink-0">
            <button
                class="shrink-0 text-[10px] font-bold px-2.5 py-1.5 mt-[-2px] rounded-lg transition-all
            {bbCdnTesting
                    ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 dark:text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                    : 'bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 hover:scale-[1.03] active:scale-[0.97] dark:text-cyan-400'}"
                disabled={!globalEnabled || !bbCdnEnabled}
                on:click={startSpeedTest}
            >
                {bbCdnTesting ? t("stop_test") : t("bb_cdn_speed_test")}
            </button>

            <button
                class="mt-[-2px] inline-flex items-center justify-center w-8 h-8 rounded-xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-white/5 text-gray-500 dark:text-white/60 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/5 dark:hover:bg-cyan-500/10 transition-colors"
                on:click|stopPropagation={() =>
                    (showSpeedTestSettings = !showSpeedTestSettings)}
                title={t("bb_cdn_test_options")}
            >
                <svg
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>
            </button>

            {#if showSpeedTestSettings}
                <div
                    class="absolute top-full right-0 mt-2 w-72 rounded-2xl border border-black/5 dark:border-white/10 bg-white/95 dark:bg-[#202020]/95 backdrop-blur-2xl shadow-[0_18px_50px_rgba(15,23,42,0.16)] p-2.5 space-y-2 z-50"
                >
                    <div class="px-1 pb-1">
                        <div
                            class="text-[10px] font-semibold tracking-[0.12em] uppercase text-gray-500 dark:text-white/40"
                        >
                            {t("bb_cdn_test_options")}
                        </div>
                    </div>

                    <button
                        class="w-full flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                        on:click={() =>
                            (speedTestIncludeOverseas = !speedTestIncludeOverseas)}
                    >
                        <div class="min-w-0">
                            <div
                                class="text-[12px] font-semibold text-gray-800 dark:text-white/90"
                            >
                                {t("bb_cdn_test_overseas")}
                            </div>
                            <div
                                class="mt-1 text-[10px] leading-snug text-gray-500 dark:text-white/45"
                            >
                                {t("bb_cdn_test_overseas_desc")}
                            </div>
                        </div>
                        <div class="relative inline-flex h-4 w-7 items-center shrink-0 mt-0.5">
                            <div
                                class="w-full h-full rounded-full transition-colors duration-200 {speedTestIncludeOverseas
                                    ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.35)]'
                                    : 'bg-black/10 dark:bg-white/10'}"
                            ></div>
                            <div
                                class="absolute left-[2px] w-3 h-3 rounded-full bg-white transition-transform duration-200 shadow-sm"
                                class:translate-x-3={speedTestIncludeOverseas}
                            ></div>
                        </div>
                    </button>

                    <button
                        class="w-full flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                        on:click={() =>
                            (speedTestAutoSelectBest = !speedTestAutoSelectBest)}
                    >
                        <div class="min-w-0">
                            <div
                                class="text-[12px] font-semibold text-gray-800 dark:text-white/90"
                            >
                                {t("bb_cdn_test_autoselect")}
                            </div>
                            <div
                                class="mt-1 text-[10px] leading-snug text-gray-500 dark:text-white/45"
                            >
                                {t("bb_cdn_test_autoselect_desc")}
                            </div>
                        </div>
                        <div class="relative inline-flex h-4 w-7 items-center shrink-0 mt-0.5">
                            <div
                                class="w-full h-full rounded-full transition-colors duration-200 {speedTestAutoSelectBest
                                    ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.35)]'
                                    : 'bg-black/10 dark:bg-white/10'}"
                            ></div>
                            <div
                                class="absolute left-[2px] w-3 h-3 rounded-full bg-white transition-transform duration-200 shadow-sm"
                                class:translate-x-3={speedTestAutoSelectBest}
                            ></div>
                        </div>
                    </button>

                    <button
                        class="w-full flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                        on:click={() =>
                            (speedTestSortBySpeed = !speedTestSortBySpeed)}
                    >
                        <div class="min-w-0">
                            <div
                                class="text-[12px] font-semibold text-gray-800 dark:text-white/90"
                            >
                                {t("bb_cdn_test_sort")}
                            </div>
                            <div
                                class="mt-1 text-[10px] leading-snug text-gray-500 dark:text-white/45"
                            >
                                {t("bb_cdn_test_sort_desc")}
                            </div>
                        </div>
                        <div class="relative inline-flex h-4 w-7 items-center shrink-0 mt-0.5">
                            <div
                                class="w-full h-full rounded-full transition-colors duration-200 {speedTestSortBySpeed
                                    ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.35)]'
                                    : 'bg-black/10 dark:bg-white/10'}"
                            ></div>
                            <div
                                class="absolute left-[2px] w-3 h-3 rounded-full bg-white transition-transform duration-200 shadow-sm"
                                class:translate-x-3={speedTestSortBySpeed}
                            ></div>
                        </div>
                    </button>

                    <div
                        class="rounded-xl px-3 py-2.5 border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
                    >
                        <div
                            class="text-[12px] font-semibold text-gray-800 dark:text-white/90"
                        >
                            {t("bb_cdn_test_sample_size")}
                        </div>
                        <div
                            class="mt-1 text-[10px] leading-snug text-gray-500 dark:text-white/45"
                        >
                            {t("bb_cdn_test_sample_size_desc")}
                        </div>
                        <div class="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min={BB_CDN_SPEED_TEST_SAMPLE_SIZE_MIN_MIB}
                                max={BB_CDN_SPEED_TEST_SAMPLE_SIZE_MAX_MIB}
                                step="1"
                                value={speedTestSampleSizeMiB}
                                on:input={handleSampleSizeInput}
                                on:blur={() =>
                                    (speedTestSampleSizeMiB = clampInteger(
                                        speedTestSampleSizeMiB,
                                        BB_CDN_SPEED_TEST_SAMPLE_SIZE_MIN_MIB,
                                        BB_CDN_SPEED_TEST_SAMPLE_SIZE_MAX_MIB,
                                    ))}
                                class="num-input w-16 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-2 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-cyan-500/50 dark:focus:border-cyan-400/50 outline-none transition-all"
                            />
                            <span
                                class="text-[11px] font-medium text-gray-500 dark:text-white/50"
                            >
                                MiB
                            </span>
                        </div>
                    </div>

                    <div
                        class="rounded-xl px-3 py-2.5 border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
                    >
                        <div
                            class="text-[12px] font-semibold text-gray-800 dark:text-white/90"
                        >
                            {t("bb_cdn_test_timeout")}
                        </div>
                        <div
                            class="mt-1 text-[10px] leading-snug text-gray-500 dark:text-white/45"
                        >
                            {t("bb_cdn_test_timeout_desc")}
                        </div>
                        <div class="mt-2 flex items-center gap-2">
                            <input
                                type="number"
                                min={BB_CDN_SPEED_TEST_TIMEOUT_MIN_SECONDS}
                                max={BB_CDN_SPEED_TEST_TIMEOUT_MAX_SECONDS}
                                step="1"
                                value={speedTestTimeoutSeconds}
                                on:input={handleTimeoutInput}
                                on:blur={() =>
                                    (speedTestTimeoutSeconds = clampInteger(
                                        speedTestTimeoutSeconds,
                                        BB_CDN_SPEED_TEST_TIMEOUT_MIN_SECONDS,
                                        BB_CDN_SPEED_TEST_TIMEOUT_MAX_SECONDS,
                                    ))}
                                class="num-input w-16 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/20 rounded-lg px-2 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-white focus:bg-black/10 dark:focus:bg-white/20 focus:border-cyan-500/50 dark:focus:border-cyan-400/50 outline-none transition-all"
                            />
                            <span
                                class="text-[11px] font-medium text-gray-500 dark:text-white/50"
                            >
                                秒
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    class="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0 m-0"
                    aria-label={t("bb_cdn_test_options")}
                    on:click={() => (showSpeedTestSettings = false)}
                ></button>
            {/if}
        </div>
    </div>

    <!-- Content (Scrollable List) -->
    <div
        class="flex-1 overflow-y-auto w-full px-4 py-3 pb-6 flex flex-col gap-2.5 no-scrollbar relative z-0"
    >
        <!-- Default Option -->
        <button
            class="w-full flex items-center justify-between py-2.5 px-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] group relative {getProviderBg(
                '',
                bbCdnNode === '',
            )}"
            on:click={() => selectNode("")}
        >
            <div class="flex flex-col pr-3">
                <span
                    class="text-[13px] font-semibold leading-tight {bbCdnNode ===
                    ''
                        ? 'text-cyan-600 dark:text-cyan-400'
                        : 'text-gray-800 dark:text-white/90 group-hover:text-gray-900 dark:group-hover:text-white'}"
                >
                    {t("bb_cdn_default")}
                </span>
                <span
                    class="text-[10px] text-gray-500 dark:text-white/40 leading-tight mt-[2px]"
                >
                    {t("auto_system_default")}
                </span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                {#if bbCdnNode === ""}
                    <svg
                        class="w-4 h-4 text-cyan-500 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2.5"
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                {/if}
            </div>
        </button>

        {#each orderedNodes as node}
            <button
                class="w-full flex items-center justify-between py-2.5 px-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] group relative {getProviderBg(
                    node.id,
                    bbCdnNode === node.host,
                )}"
                on:click={() => selectNode(node.host)}
            >
                <div class="flex flex-col truncate pr-2 min-w-0">
                    <span
                        class="text-[13px] font-semibold truncate leading-tight transition-colors {bbCdnNode ===
                        node.host
                            ? 'text-cyan-600 dark:text-cyan-400'
                            : 'text-gray-800 dark:text-white/90 group-hover:text-gray-900 dark:group-hover:text-white'}"
                    >
                        {node.label}
                    </span>
                    <span
                        class="text-[10px] text-gray-500 dark:text-white/40 truncate leading-tight mt-[2px] transition-colors"
                    >
                        {node.host}
                    </span>
                </div>

                <!-- Right Side Content -->
                <div class="flex items-center gap-2.5 shrink-0 pl-2">
                    <!-- Speed Pill -->
                    {#if bbCdnSpeedResults[node.id]}
                        {#if bbCdnSpeedResults[node.id].error}
                            <div
                                class="px-1.5 py-[2px] rounded text-[9px] font-semibold tracking-wide bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/20"
                            >
                                {bbCdnSpeedResults[node.id].speed}
                            </div>
                        {:else}
                            <div
                                class="px-1.5 py-[2px] rounded text-[10px] font-bold tracking-wide flex items-center gap-1
                {parseFloat(bbCdnSpeedResults[node.id].speed) >= 5
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20'
                                    : parseFloat(
                                            bbCdnSpeedResults[node.id].speed,
                                        ) >= 1
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20'
                                      : 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/20'}"
                            >
                                {#if parseFloat(bbCdnSpeedResults[node.id].speed) >= 5}
                                    <div
                                        class="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)] relative"
                                    >
                                        <div
                                            class="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"
                                        ></div>
                                    </div>
                                {/if}
                                {bbCdnSpeedResults[node.id].speed}
                                <span class="text-[8px] font-medium opacity-70"
                                    >MiB/s</span
                                >
                            </div>
                        {/if}
                    {/if}

                    <!-- Checkmark -->
                    <div class="w-4 h-4 flex items-center justify-center">
                        {#if bbCdnNode === node.host}
                            <svg
                                class="w-4 h-4 text-cyan-500 shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2.5"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        {/if}
                    </div>
                </div>
            </button>
        {/each}
    </div>
</div>
