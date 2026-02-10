<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";
  import H5Settings from "./H5Settings.svelte";
  import AutoPauseSettings from "./AutoPauseSettings.svelte";
  import {
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    type Settings,
  } from "../lib/settings";
  import SectionCard from "../components/SectionCard.svelte";
  import ToggleItem from "../components/ToggleItem.svelte";
  import AccordionItem from "../components/AccordionItem.svelte";

  // -- State --
  let loaded = false;

  let globalEnabled = true;
  let h5Enabled = true;
  let autoPauseEnabled = true;

  // New Config for YouTube Optimizer
  let ytBlockNative = true;

  // Fast Pause Config
  let bndEnabled = true; // Bilibili
  let ytFastPause = true; // YouTube
  let fastPauseMaster = true; // Master Switch (visual only, derived or controls both)
  let fastPauseOpen = false; // Inline accordion state

  // Settings
  let language: I18nLang = "auto";

  // Navigation
  let currentView = "main";

  // Accordion State (Independent)
  let sectionOpen = {
    general: true,
    youtube: true,
    bilibili: true,
  };

  let showLangMenu = false;
  const SAVE_DEBOUNCE_MS = 180;
  let saveTimer: number | null = null;
  let pendingSettings: Partial<Settings> | null = null;

  // Helper
  $: t = (key: I18nKey) => i18n(key, language);

  function flushSettingsSave() {
    if (
      !pendingSettings ||
      typeof chrome === "undefined" ||
      !chrome.storage
    ) {
      return;
    }
    const payload = pendingSettings;
    pendingSettings = null;
    setSettings(payload);
  }

  function scheduleSettingsSave(values: Partial<Settings>) {
    pendingSettings = values;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      flushSettingsSave();
    }, SAVE_DEBOUNCE_MS);
  }

  onMount(() => {
    getSettings([
      "enabled",
      "h5_enabled",
      "ap_enabled",
      "bnd_enabled",
      "yt_fast_pause",
      "fast_pause_master",
      "language",
      "yt_config",
      "h5_config",
      "ui_state",
    ]).then((res) => {
      globalEnabled = res.enabled;
      h5Enabled = res.h5_enabled;
      autoPauseEnabled = res.ap_enabled;

      bndEnabled = res.bnd_enabled;
      ytFastPause = res.yt_fast_pause;
      fastPauseMaster = res.fast_pause_master;

      language = res.language || DEFAULT_SETTINGS.language;

      if (res.ui_state) {
        sectionOpen = { ...sectionOpen, ...res.ui_state };
      }

      if (res.yt_config) {
        ytBlockNative = res.yt_config.blockNativeSeek ?? true;
      } else if (res.h5_config) {
        ytBlockNative = res.h5_config.blockNumKeys ?? true;
      }

      loaded = true;
    });

    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      document.documentElement.classList.add("dark");
    }
  });

  $: {
    if (loaded && typeof chrome !== "undefined" && chrome.storage) {
      scheduleSettingsSave({
        enabled: globalEnabled,
        h5_enabled: h5Enabled,
        ap_enabled: autoPauseEnabled,
        bnd_enabled: bndEnabled,
        yt_fast_pause: ytFastPause,
        fast_pause_master: fastPauseMaster,
        language: language,
        yt_config: { blockNativeSeek: ytBlockNative },
        ui_state: sectionOpen,
      });
    }
  }

  onDestroy(() => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    flushSettingsSave();
  });

  function navigate(view: string) {
    if (!globalEnabled) return;
    currentView = view;
  }

  function toggleSection(section: "general" | "youtube" | "bilibili") {
    sectionOpen[section] = !sectionOpen[section];
  }
</script>

<main
  class="w-[360px] h-[600px] glass-card text-primary font-sans select-none overflow-hidden relative flex flex-col"
>
  {#if currentView === "main"}
    <div
      class="absolute inset-0 flex flex-col z-10"
      in:fade={{ duration: 300, easing: quintOut }}
    >
      <!-- Header -->
      <header class="relative z-10 px-5 pt-6 pb-4">
        <div class="flex items-center justify-between mb-1">
          <div class="flex flex-col justify-center">
            <h1
              class="text-2xl font-light tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-white/70 drop-shadow-sm"
              style="font-family: 'Outfit', sans-serif;"
            >
              {t("title")}
            </h1>
          </div>

          <!-- Master Switch -->
          <button
            class="group relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 focus:outline-none cursor-pointer border border-black/5 dark:border-white/20 shadow-lg backdrop-blur-md {globalEnabled
              ? 'bg-emerald-500'
              : 'bg-black/5 dark:bg-white/10'}"
            style={globalEnabled
              ? "background: rgba(16, 185, 129, 0.8); box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);"
              : ""}
            on:click={() => (globalEnabled = !globalEnabled)}
            title="Master Switch"
          >
            <div
              class="inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out"
              class:translate-x-7={globalEnabled}
              class:translate-x-1={!globalEnabled}
            />
          </button>
        </div>
      </header>

      <div
        class="h-[1px] w-full bg-gradient-to-r from-transparent via-gray-200 dark:via-white/10 to-transparent mb-2"
      ></div>

      <!-- Content -->
      <div
        class="relative z-10 px-4 py-2 space-y-3 flex-1 overflow-y-auto no-scrollbar pb-6"
      >
        <!-- SECTION: GENERAL -->
        <SectionCard
          title={t("general")}
          iconColor="blue"
          isOpen={sectionOpen["general"]}
          enabled={globalEnabled}
          onToggle={() => toggleSection("general")}
        >
          <!-- H5 Enhancer Item -->
          <ToggleItem
            title={t("enhancer_title")}
            desc={t("enhancer_desc")}
            checked={h5Enabled}
            iconColor="blue"
            disabled={!globalEnabled}
            onClick={() => globalEnabled && (h5Enabled = !h5Enabled)}
            onSettings={() => navigate("h5-settings")}
          >
            <div
              slot="icon"
              class="w-full h-full flex items-center justify-center"
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                /></svg
              >
            </div>
          </ToggleItem>

          <!-- Auto Pause Item -->
          <ToggleItem
            title={t("autopause_title")}
            desc={t("autopause_desc")}
            checked={autoPauseEnabled}
            iconColor="pink"
            disabled={!globalEnabled}
            onClick={() =>
              globalEnabled && (autoPauseEnabled = !autoPauseEnabled)}
            onSettings={() => navigate("ap-settings")}
          >
            <div
              slot="icon"
              class="w-full h-full flex items-center justify-center"
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
                  d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                /></svg
              >
            </div>
          </ToggleItem>

          <!-- Fast Pause Accordion -->
          <AccordionItem
            title={t("fast_pause_master")}
            desc={t("fast_pause_desc")}
            iconColor="indigo"
            isOpen={fastPauseOpen}
            masterChecked={fastPauseMaster}
            disabled={!globalEnabled}
            onToggleOpen={() => (fastPauseOpen = !fastPauseOpen)}
            onToggleMaster={() =>
              globalEnabled && (fastPauseMaster = !fastPauseMaster)}
          >
            <div
              slot="icon"
              class="w-full h-full flex items-center justify-center"
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                /></svg
              >
            </div>
            <div slot="content" class="space-y-1">
              <!-- Bilibili -->
              <ToggleItem
                title="Bilibili"
                checked={bndEnabled}
                iconColor="indigo"
                compact={true}
                disabled={!globalEnabled || !fastPauseMaster}
                onClick={() =>
                  globalEnabled &&
                  fastPauseMaster &&
                  (bndEnabled = !bndEnabled)}
              >
                <div
                  slot="icon"
                  class="w-full h-full flex items-center justify-center"
                >
                  <!-- Bilibili Icon -->
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      clip-rule="evenodd"
                      d="M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z"
                      fill="currentColor"
                      fill-rule="evenodd"
                    ></path>
                  </svg>
                </div>
              </ToggleItem>
              <!-- YouTube -->
              <ToggleItem
                title="YouTube"
                checked={ytFastPause}
                iconColor="indigo"
                compact={true}
                disabled={!globalEnabled || !fastPauseMaster}
                onClick={() =>
                  globalEnabled &&
                  fastPauseMaster &&
                  (ytFastPause = !ytFastPause)}
              >
                <div
                  slot="icon"
                  class="w-full h-full flex items-center justify-center"
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 28.57 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 2.24288e-07 14.285 0 14.285 0C14.285 0 5.35042 2.24288e-07 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C2.24288e-07 5.35042 0 10 0 10C0 10 2.24288e-07 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"
                      fill="currentColor"
                    ></path>
                    <path
                      d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z"
                      fill="white"
                    ></path>
                  </svg>
                </div>
              </ToggleItem>
            </div>
          </AccordionItem>
        </SectionCard>

        <!-- SECTION: YOUTUBE -->
        <SectionCard
          title="YouTube"
          iconColor="red"
          isOpen={sectionOpen["youtube"]}
          enabled={globalEnabled}
          onToggle={() => toggleSection("youtube")}
        >
          <!-- Block Seek -->
          <ToggleItem
            title={t("block_seek")}
            desc={t("block_seek_desc")}
            checked={ytBlockNative}
            iconColor="red"
            disabled={!globalEnabled}
            onClick={() => globalEnabled && (ytBlockNative = !ytBlockNative)}
          >
            <div
              slot="icon"
              class="w-full h-full flex items-center justify-center"
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
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                /></svg
              >
            </div>
          </ToggleItem>
        </SectionCard>
      </div>

      <!-- Footer -->
      <footer
        class="relative z-10 w-full px-5 py-3 flex items-center justify-center mt-auto bg-gradient-to-t from-white/40 to-transparent dark:from-black/40"
      >
        <!-- Gradient Border Top (Simulated) -->
        <div
          class="absolute top-0 left-0 w-full h-[1px]"
          style="background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);"
        ></div>

        <!-- Centered Version -->
        <p
          class="text-[10px] text-gray-400 dark:text-white/30 font-medium tracking-wide"
        >
          {t("footer")}
        </p>

        <!-- Right-aligned Compact Language Selector (Custom Glass Dropdown) -->
        <div class="absolute right-6 flex items-center">
          <div class="relative">
            <button
              class="flex items-center justify-center w-7 h-7 rounded-full bg-white/40 dark:bg-white/5 border border-white/40 dark:border-white/10 shadow-sm hover:bg-white/60 dark:hover:bg-white/10 transition-colors cursor-pointer outline-none"
              on:click|stopPropagation={() => (showLangMenu = !showLangMenu)}
              title={t("language")}
            >
              <!-- Translate Icon (A/文) - Universal -->
              <svg
                class="w-4 h-4 text-gray-500 dark:text-white/60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                />
              </svg>
            </button>

            {#if showLangMenu}
              <!-- Enhanced Glass Dropdown: centered, native glass-card style -->
              <!-- Use p-1 and gap-0.5 for a clean, pill-based list -->
              <div
                class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 p-1 gap-1 rounded-xl glass-card flex flex-col z-50 origin-bottom"
                transition:slide|local={{ duration: 250 }}
              >
                <button
                  class="text-[12px] py-1 px-2 text-center rounded-md transition-colors whitespace-nowrap {language ===
                  'auto'
                    ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-500/5 dark:bg-blue-400/10'
                    : 'text-gray-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10'}"
                  on:click={() => {
                    language = "auto";
                    showLangMenu = false;
                  }}
                >
                  <span class="relative z-10">Auto</span>
                </button>
                <button
                  class="text-[12px] py-1 px-2 text-center rounded-md transition-colors whitespace-nowrap {language ===
                  'en'
                    ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-500/5 dark:bg-blue-400/10'
                    : 'text-gray-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10'}"
                  on:click={() => {
                    language = "en";
                    showLangMenu = false;
                  }}
                >
                  <span class="relative z-10">English</span>
                </button>
                <button
                  class="text-[12px] py-1 px-2 text-center rounded-md transition-colors whitespace-nowrap {language ===
                  'zh'
                    ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-500/5 dark:bg-blue-400/10'
                    : 'text-gray-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10'}"
                  on:click={() => {
                    language = "zh";
                    showLangMenu = false;
                  }}
                >
                  <span class="relative z-10">简体中文</span>
                </button>
              </div>

              <!-- Backdrop to close menu -->
              <button
                type="button"
                class="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0 m-0"
                aria-label="Close language menu"
                on:click={() => (showLangMenu = false)}
              ></button>
            {/if}
          </div>
        </div>
      </footer>
    </div>
  {:else if currentView === "h5-settings"}
    <div
      class="absolute inset-0 flex flex-col z-20"
      in:fly={{ x: 20, duration: 400, opacity: 0, easing: quintOut }}
      out:fly={{ x: 20, duration: 300, opacity: 0, easing: quintOut }}
    >
      <H5Settings on:back={() => (currentView = "main")} {language} />
    </div>
  {:else if currentView === "ap-settings"}
    <div
      class="absolute inset-0 flex flex-col z-20"
      in:fly={{ x: 20, duration: 400, opacity: 0, easing: quintOut }}
      out:fly={{ x: 20, duration: 300, opacity: 0, easing: quintOut }}
    >
      <AutoPauseSettings on:back={() => (currentView = "main")} {language} />
    </div>
  {/if}
</main>
