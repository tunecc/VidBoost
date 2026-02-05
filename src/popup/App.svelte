<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { i18n } from "../lib/i18n";
  import H5Settings from "./H5Settings.svelte";

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
  let language: "auto" | "en" | "zh" = "auto";

  // Navigation
  let currentView = "main";

  // Accordion State (Independent)
  let sectionOpen = {
    general: true,
    youtube: true,
    bilibili: true,
  };

  // Helper
  $: t = (key: any) => i18n(key, language);

  onMount(() => {
    chrome.storage.local.get(
      [
        "enabled",
        "h5_enabled",
        "ap_enabled",
        "bnd_enabled",
        "language",
        "yt_config",
        "h5_config",
        "ui_state",
      ],
      (res) => {
        globalEnabled = res.enabled !== false;
        h5Enabled = res.h5_enabled !== false;
        autoPauseEnabled = res.ap_enabled !== false;
        autoPauseEnabled = res.ap_enabled !== false;

        // Calculate master state for UI
        // Fast Pause States
        bndEnabled = res.bnd_enabled !== false;
        ytFastPause = res.yt_fast_pause !== false;
        fastPauseMaster = res.fast_pause_master !== false; // Load master switch state directly

        language = res.language || "auto";

        if (res.ui_state) {
          sectionOpen = { ...sectionOpen, ...res.ui_state };
        }

        if (res.yt_config) {
          ytBlockNative = res.yt_config.blockNativeSeek ?? true;
        } else if (res.h5_config) {
          ytBlockNative = res.h5_config.blockNumKeys ?? true;
        }

        loaded = true;
      },
    );

    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      document.documentElement.classList.add("dark");
    }
  });

  $: {
    if (loaded && typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({
        enabled: globalEnabled,
        h5_enabled: h5Enabled,
        ap_enabled: autoPauseEnabled,

        bnd_enabled: bndEnabled,
        yt_fast_pause: ytFastPause,
        fast_pause_master: fastPauseMaster, // Persist master switch state
        language: language,
        yt_config: { blockNativeSeek: ytBlockNative },
        ui_state: sectionOpen, // Persist open/close state
      });
    }
  }

  function navigate(view: string) {
    if (!globalEnabled) return;
    currentView = view;
  }

  function toggleSection(section: "general" | "youtube" | "bilibili") {
    sectionOpen[section] = !sectionOpen[section];
  }
</script>

<main
  class="w-[360px] h-[600px] glass-card text-primary font-sans select-none overflow-hidden relative"
>
  {#if currentView === "main"}
    <div class="h-full flex flex-col" in:fade={{ duration: 200 }}>
      <!-- Header -->
      <header class="relative z-10 px-5 pt-6 pb-2">
        <div class="flex items-center justify-between mb-1">
          <div>
            <h1
              class="text-xl font-bold tracking-tight text-gray-900 dark:text-white drop-shadow-sm dark:drop-shadow-md"
            >
              {t("title")}
            </h1>
            <p
              class="text-[10px] font-medium text-gray-500 dark:text-white/70 uppercase tracking-widest ml-0.5"
            >
              {t("subtitle")}
            </p>
          </div>

          <button
            class="group relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-300 focus:outline-none cursor-pointer border border-black/5 dark:border-white/20 shadow-lg backdrop-blur-md {globalEnabled
              ? 'bg-emerald-500'
              : 'bg-black/5 dark:bg-white/10'}"
            style={globalEnabled
              ? "background: rgba(16, 185, 129, 0.6); box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);"
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
        class="h-[1px] w-full bg-gradient-to-r from-transparent via-gray-200 dark:via-white/20 to-transparent my-2"
      ></div>

      <!-- Content -->
      <div
        class="relative z-10 px-4 py-2 space-y-3 flex-1 overflow-y-auto no-scrollbar"
      >
        <!-- SECTION: GENERAL -->
        <div
          class="rounded-xl overflow-hidden bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 shadow-lg backdrop-blur-md"
          class:opacity-50={!globalEnabled}
        >
          <button
            class="w-full px-4 py-3 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors pointer-cursor"
            on:click={() => toggleSection("general")}
          >
            <div class="flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
              ></span>
              <h3
                class="font-semibold text-sm text-gray-800 dark:text-white/90"
              >
                General
              </h3>
            </div>
            <svg
              class="w-4 h-4 text-gray-400 dark:text-white/50 transition-transform duration-200"
              class:rotate-180={sectionOpen["general"]}
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

          {#if sectionOpen["general"]}
            <div
              class="p-2 space-y-2 border-t border-black/5 dark:border-white/10"
              transition:slide|local
            >
              <!-- Language Selector Item -->
              <div
                class="flex items-center justify-between p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 flex items-center justify-center border border-purple-500/10 dark:border-purple-500/20"
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
                        d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                      /></svg
                    >
                  </div>
                  <div>
                    <h4
                      class="text-sm font-medium text-gray-800 dark:text-white/90"
                    >
                      Language
                    </h4>
                  </div>
                </div>
                <div>
                  <select
                    bind:value={language}
                    class="bg-black/5 dark:bg-white/10 text-xs text-gray-700 dark:text-white/80 border border-black/10 dark:border-white/20 rounded-lg px-2 py-1 outline-none focus:bg-black/10 dark:focus:bg-white/20 focus:border-black/20 dark:focus:border-white/40 cursor-pointer backdrop-blur-sm"
                  >
                    <option value="auto" class="text-gray-800">Auto</option>
                    <option value="en" class="text-gray-800">English</option>
                    <option value="zh" class="text-gray-800">简体中文</option>
                  </select>
                </div>
              </div>

              <!-- h5player Item -->
              <div
                class="flex items-center justify-between p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors group"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 flex items-center justify-center border border-blue-500/10 dark:border-blue-500/20"
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
                  <div>
                    <h4
                      class="text-sm font-medium text-gray-800 dark:text-white/90"
                    >
                      {t("enhancer_title")}
                    </h4>
                    <p class="text-[10px] text-gray-500 dark:text-white/50">
                      {t("enhancer_desc")}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    class="p-1.5 text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                    title="Settings"
                    on:click={() => navigate("h5-settings")}
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
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      ></path><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      ></path></svg
                    >
                  </button>

                  <div
                    class="relative inline-flex h-4 w-7 items-center cursor-pointer"
                    on:click={() => globalEnabled && (h5Enabled = !h5Enabled)}
                  >
                    <div
                      class="w-full h-full rounded-full transition-colors duration-200 {h5Enabled
                        ? 'bg-blue-500'
                        : 'bg-black/10 dark:bg-white/20'}"
                      style={h5Enabled
                        ? "box-shadow: 0 0 10px rgba(59,130,246,0.5);"
                        : ""}
                    ></div>
                    <div
                      class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm"
                      class:translate-x-3={h5Enabled}
                    ></div>
                  </div>
                </div>
              </div>

              <!-- Auto Pause Item -->
              <div
                class="flex items-center justify-between p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-pink-500/10 dark:bg-pink-500/20 text-pink-600 dark:text-pink-300 flex items-center justify-center border border-pink-500/10 dark:border-pink-500/20"
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
                      ></path></svg
                    >
                  </div>
                  <div>
                    <h4
                      class="text-sm font-medium text-gray-800 dark:text-white/90"
                    >
                      {t("autopause_title")}
                    </h4>
                    <p class="text-[10px] text-gray-500 dark:text-white/50">
                      {t("autopause_desc")}
                    </p>
                  </div>
                </div>
                <div
                  class="relative inline-flex h-4 w-7 items-center cursor-pointer"
                  on:click={() =>
                    globalEnabled && (autoPauseEnabled = !autoPauseEnabled)}
                >
                  <div
                    class="w-full h-full rounded-full transition-colors duration-200 {autoPauseEnabled
                      ? 'bg-pink-500'
                      : 'bg-black/10 dark:bg-white/20'}"
                    style={autoPauseEnabled
                      ? "box-shadow: 0 0 10px rgba(236,72,153,0.5);"
                      : ""}
                  ></div>
                  <div
                    class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm"
                    class:translate-x-3={autoPauseEnabled}
                  ></div>
                </div>
              </div>
              <!-- Fast Pause Item (Unified & Inline) -->
              <div
                class="rounded-lg transition-colors group {fastPauseOpen
                  ? 'bg-indigo-500/5 dark:bg-indigo-500/10'
                  : 'hover:bg-black/5 dark:hover:bg-white/10'}"
              >
                <div class="flex items-center justify-between p-2">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 flex items-center justify-center border border-indigo-500/10 dark:border-indigo-500/20"
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
                    <div>
                      <h4
                        class="text-sm font-medium text-gray-800 dark:text-white/90"
                      >
                        {t("fast_pause_master")}
                      </h4>
                      <p class="text-[10px] text-gray-500 dark:text-white/50">
                        {t("fast_pause_desc")}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      class="p-1.5 text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      title="Settings"
                      on:click={() => (fastPauseOpen = !fastPauseOpen)}
                    >
                      <svg
                        class="w-4 h-4 transition-transform duration-200"
                        class:rotate-180={fastPauseOpen}
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

                    <div
                      class="relative inline-flex h-4 w-7 items-center cursor-pointer"
                      on:click={() => {
                        if (!globalEnabled) return;
                        fastPauseMaster = !fastPauseMaster;
                      }}
                    >
                      <div
                        class="w-full h-full rounded-full transition-colors duration-200 {fastPauseMaster
                          ? 'bg-indigo-500'
                          : 'bg-black/10 dark:bg-white/20'}"
                        style={fastPauseMaster
                          ? "box-shadow: 0 0 10px rgba(99,102,241,0.5);"
                          : ""}
                      ></div>
                      <div
                        class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm"
                        class:translate-x-3={fastPauseMaster}
                      ></div>
                    </div>
                  </div>
                </div>

                {#if fastPauseOpen}
                  <div class="px-2 pb-2 pl-12 space-y-2" transition:slide|local>
                    <!-- Bilibili Toggle -->
                    <div class="flex items-center justify-between py-1 pr-1">
                      <span class="text-xs text-gray-700 dark:text-white/70"
                        >Bilibili</span
                      >
                      <div
                        class="relative inline-flex h-3.5 w-6 items-center cursor-pointer"
                        class:opacity-50={!fastPauseMaster}
                        on:click={() => {
                          if (!globalEnabled || !fastPauseMaster) return;
                          bndEnabled = !bndEnabled;
                        }}
                      >
                        <div
                          class="w-full h-full rounded-full transition-colors duration-200 {bndEnabled
                            ? 'bg-indigo-500'
                            : 'bg-black/10 dark:bg-white/20'}"
                        ></div>
                        <div
                          class="absolute left-[2px] w-2.5 h-2.5 bg-white rounded-full transition-transform duration-200 shadow-sm"
                          class:translate-x-2.5={bndEnabled}
                        ></div>
                      </div>
                    </div>

                    <!-- YouTube Toggle -->
                    <div class="flex items-center justify-between py-1 pr-1">
                      <span class="text-xs text-gray-700 dark:text-white/70"
                        >YouTube</span
                      >
                      <div
                        class="relative inline-flex h-3.5 w-6 items-center cursor-pointer"
                        class:opacity-50={!fastPauseMaster}
                        on:click={() => {
                          if (!globalEnabled || !fastPauseMaster) return;
                          ytFastPause = !ytFastPause;
                        }}
                      >
                        <div
                          class="w-full h-full rounded-full transition-colors duration-200 {ytFastPause
                            ? 'bg-indigo-500'
                            : 'bg-black/10 dark:bg-white/20'}"
                        ></div>
                        <div
                          class="absolute left-[2px] w-2.5 h-2.5 bg-white rounded-full transition-transform duration-200 shadow-sm"
                          class:translate-x-2.5={ytFastPause}
                        ></div>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- SECTION: YOUTUBE -->
        <div
          class="rounded-xl overflow-hidden bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 shadow-lg backdrop-blur-md"
          class:opacity-50={!globalEnabled}
        >
          <button
            class="w-full px-4 py-3 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors pointer-cursor"
            on:click={() => toggleSection("youtube")}
          >
            <div class="flex items-center gap-2">
              <span
                class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
              ></span>
              <h3
                class="font-semibold text-sm text-gray-800 dark:text-white/90"
              >
                YouTube
              </h3>
            </div>
            <svg
              class="w-4 h-4 text-gray-400 dark:text-white/50 transition-transform duration-200"
              class:rotate-180={sectionOpen["youtube"]}
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

          {#if sectionOpen["youtube"]}
            <div
              class="p-2 space-y-2 border-t border-black/5 dark:border-white/10"
              transition:slide|local
            >
              <!-- Native Seek Blocker -->
              <div
                class="flex items-center justify-between p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-300 flex items-center justify-center border border-red-500/10 dark:border-red-500/20"
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
                  <div>
                    <h4
                      class="text-sm font-medium text-gray-800 dark:text-white/90"
                    >
                      {t("block_seek")}
                    </h4>
                    <p class="text-[10px] text-gray-500 dark:text-white/50">
                      {t("block_seek_desc")}
                    </p>
                  </div>
                </div>
                <div
                  class="relative inline-flex h-4 w-7 items-center cursor-pointer"
                  on:click={() =>
                    globalEnabled && (ytBlockNative = !ytBlockNative)}
                >
                  <div
                    class="w-full h-full rounded-full transition-colors duration-200 {ytBlockNative
                      ? 'bg-red-500'
                      : 'bg-black/10 dark:bg-white/20'}"
                    style={ytBlockNative
                      ? "box-shadow: 0 0 10px rgba(239,68,68,0.5);"
                      : ""}
                  ></div>
                  <div
                    class="absolute left-[2px] w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm"
                    class:translate-x-3={ytBlockNative}
                  ></div>
                </div>
              </div>
            </div>

            <!-- YouTube Fast Pause Removed (Moved to General) -->
            <!-- kept empty space or removed completely -->
          {/if}
        </div>

        <!-- SECTION: BILIBILI (Empty now, or we can just remove this section entirely if Pro was the only thing) -->
        <!-- User said "Prevent Double Click feature also move to regular settings" -->
        <!-- So Bilibili section might be empty? -->
        <!-- Let's check if there are other Bilitools? No, only 'Bilibili Pro' item was there. -->
        <!-- So we should REMOVE the Bilibili section entirely? -->
        <!-- Wait, I'll keep it hidden if empty, or just remove. -->
        <!-- Removing Bilibili Section completely as requested to unify. -->
      </div>

      <!-- Footer -->
      <footer
        class="relative z-10 w-full p-3 text-center border-t border-black/5 dark:border-white/10"
      >
        <p class="text-[10px] text-gray-400 dark:text-white/30 font-medium">
          {t("footer")}
        </p>
      </footer>
    </div>
  {:else if currentView === "h5-settings"}
    <div
      class="h-full"
      in:fly={{ x: 20, duration: 300 }}
      out:fly={{ x: 20, duration: 200 }}
    >
      <H5Settings on:back={() => (currentView = "main")} {language} />
    </div>
  {/if}
</main>
