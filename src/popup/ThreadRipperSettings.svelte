<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";

  export let language: I18nLang = "auto";
  export let globalEnabled: boolean = true;
  export let bbThreadRipperEnabled: boolean = false;
  export let bbThreadRipperRegion: "auto" | "mainland" | "overseas" = "auto";
  export let bbNoP2pEnabled: boolean = false;

  const dispatch = createEventDispatcher();

  $: t = (key: I18nKey) => i18n(key, language);

  function toggleThreadRipper() {
    if (!globalEnabled) return;
    dispatch("toggle-thread-ripper", { enabled: !bbThreadRipperEnabled });
  }

  function selectRegion(event: Event) {
    if (!globalEnabled) return;
    const value = (event.target as HTMLSelectElement).value;
    if (value === "mainland" || value === "overseas" || value === "auto") {
      dispatch("select-region", { region: value });
    }
  }

  function toggleNoP2p() {
    if (!globalEnabled) return;
    dispatch("toggle-no-p2p", { enabled: !bbNoP2pEnabled });
  }
</script>

<div
  class="rounded-lg border border-black/[0.03] dark:border-white/[0.05] bg-black/[0.02] dark:bg-white/[0.02] px-1 py-0.5 space-y-0.5"
>
  <!-- Thread Ripper Toggle (Full Row Clickable) -->
  <button
    type="button"
    class="w-full flex items-center justify-between gap-2 min-h-11 p-1.5 text-left outline-none rounded-lg group transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    disabled={!globalEnabled}
    aria-label={t("bb_thread_ripper_enable")}
    title={t("bb_thread_ripper_enable")}
    on:click={toggleThreadRipper}
  >
    <div class="flex-1 min-w-0 pr-1">
      <span
        class="block truncate text-sm font-medium text-gray-800 dark:text-white/90"
      >
        {t("bb_thread_ripper_title")}
      </span>
      <p
        class="text-[10px] leading-snug text-gray-500 dark:text-white/50 mt-0.5"
      >
        {t("bb_thread_ripper_desc")}
      </p>
    </div>
    <!-- Prevent internal label captures by disabling pointer events on the switch -->
    <div
      class="relative inline-flex h-4 w-7 items-center shrink-0 pointer-events-none"
    >
      <div
        class="w-full h-full rounded-full transition-colors duration-300 {bbThreadRipperEnabled
          ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
          : 'bg-black/10 dark:bg-white/10'}"
      ></div>
      <div
        class="absolute left-[2px] w-3 h-3 rounded-full bg-white transition-transform duration-300 shadow-sm"
        class:translate-x-3={bbThreadRipperEnabled}
      ></div>
    </div>
  </button>

  <!-- Region Preference Select (applies to the thread ripper) -->
  <div class="flex items-center justify-between gap-2 min-h-10 px-1.5 py-1">
    <span
      class="text-[11px] leading-snug text-gray-600 dark:text-white/60 shrink-0"
    >
      {t("bb_thread_ripper_region_title")}
    </span>
    <select
      class="shrink-0 rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 text-[11px] text-gray-700 dark:text-white/80 px-1.5 py-1 outline-none disabled:opacity-50"
      disabled={!globalEnabled || !bbThreadRipperEnabled}
      aria-label={t("bb_thread_ripper_region_title")}
      value={bbThreadRipperRegion}
      on:change={selectRegion}
    >
      <option value="auto">{t("bb_thread_ripper_region_auto")}</option>
      <option value="mainland">{t("bb_thread_ripper_region_mainland")}</option>
      <option value="overseas">{t("bb_thread_ripper_region_overseas")}</option>
    </select>
  </div>

  <!-- No P2P Toggle (Full Row Clickable) -->
  <button
    type="button"
    class="w-full flex items-center justify-between gap-2 min-h-11 p-1.5 text-left outline-none rounded-lg group transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    disabled={!globalEnabled}
    aria-label={t("bb_no_p2p_enable")}
    title={t("bb_no_p2p_enable")}
    on:click={toggleNoP2p}
  >
    <div class="flex-1 min-w-0 pr-1">
      <span
        class="block truncate text-sm font-medium text-gray-800 dark:text-white/90"
      >
        {t("bb_no_p2p_title")}
      </span>
      <p
        class="text-[10px] leading-snug text-gray-500 dark:text-white/50 mt-0.5"
      >
        {t("bb_no_p2p_desc")}
      </p>
    </div>
    <div
      class="relative inline-flex h-4 w-7 items-center shrink-0 pointer-events-none"
    >
      <div
        class="w-full h-full rounded-full transition-colors duration-300 {bbNoP2pEnabled
          ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]'
          : 'bg-black/10 dark:bg-white/10'}"
      ></div>
      <div
        class="absolute left-[2px] w-3 h-3 rounded-full bg-white transition-transform duration-300 shadow-sm"
        class:translate-x-3={bbNoP2pEnabled}
      ></div>
    </div>
  </button>

  <!-- Mutual Exclusivity Hint -->
  <div class="flex items-start gap-1.5 px-1.5 pt-0.5 pb-1">
    <svg
      class="w-3 h-3 mt-[1px] shrink-0 text-gray-400 dark:text-white/30"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <p class="text-[9px] leading-snug text-gray-400 dark:text-white/30">
      {t("bb_thread_ripper_exclusive_hint")}
    </p>
  </div>
</div>
