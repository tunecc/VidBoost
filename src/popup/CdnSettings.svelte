<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";
    import { CDN_NODES } from "../lib/bilibiliCdnData";

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

    const dispatch = createEventDispatcher();

    $: t = (key: I18nKey) => i18n(key, language);

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
</script>

<div
    class="h-full flex flex-col bg-white/50 dark:bg-[#1e1e1e]/50 backdrop-blur-3xl"
>
    <!-- Header -->
    <div
        class="px-5 pt-6 pb-3 flex items-start justify-between relative z-10 border-b border-black/5 dark:border-white/5"
    >
        <div class="flex items-start gap-3">
            <button
                class="p-2 -ml-2 mt-[-2px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer text-gray-500 hover:text-gray-900 dark:text-white/70 dark:hover:text-white group"
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

        <!-- Header Speed Test Button -->
        <button
            class="shrink-0 text-[10px] font-bold px-2.5 py-1.5 mt-[-2px] rounded-lg transition-all
        {bbCdnTesting
                ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 dark:text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                : 'bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 hover:scale-[1.03] active:scale-[0.97] dark:text-cyan-400'}"
            disabled={!globalEnabled || !bbCdnEnabled}
            on:click={startSpeedTest}
        >
            {bbCdnTesting ? "Stop Test" : t("bb_cdn_speed_test")}
        </button>
    </div>

    <!-- Content (Scrollable List) -->
    <div
        class="flex-1 overflow-y-auto w-full px-4 py-3 pb-6 flex flex-col gap-2.5 no-scrollbar relative z-10"
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
                    Auto (System Default)
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

        {#each CDN_NODES as node}
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
                                    >MB/s</span
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
