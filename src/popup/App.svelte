<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";
  import H5Settings from "./H5Settings.svelte";
  import AutoPauseSettings from "./AutoPauseSettings.svelte";
  import CdnSettings from "./CdnSettings.svelte";
  import {
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    POPUP_SETTINGS_KEYS,
    type Settings,
    type YTMemberBlockMode,
  } from "../lib/settings";
  import SectionCard from "../components/SectionCard.svelte";
  import ToggleItem from "../components/ToggleItem.svelte";
  import AccordionItem from "../components/AccordionItem.svelte";
  import { CDN_NODES, type CdnNode } from "../lib/bilibiliCdnData";
  import {
    sanitizeBilibiliCdnSpeedTestOptions,
    type BilibiliCdnSpeedTestOptions,
  } from "../features/bilibili/bilibiliCdn.shared";

  const manifestVersion =
    globalThis.chrome?.runtime?.getManifest?.().version ?? "1.3.2";

  // -- State --
  let loaded = false;

  let globalEnabled = DEFAULT_SETTINGS.enabled;
  let h5Enabled = DEFAULT_SETTINGS.h5_enabled;
  let autoPauseEnabled = DEFAULT_SETTINGS.ap_enabled;

  // New Config for YouTube Optimizer
  let ytBlockNative = DEFAULT_SETTINGS.yt_config.blockNativeSeek ?? true;
  let ytAlwaysUseOriginalAudio =
    DEFAULT_SETTINGS.yt_config.alwaysUseOriginalAudio ?? false;

  // Bilibili Config
  let bbBlockSpace = DEFAULT_SETTINGS.bb_block_space;

  // YouTube Member Block Config
  let ytMemberBlock = DEFAULT_SETTINGS.yt_member_block;
  let ytMemberBlockMode: YTMemberBlockMode =
    DEFAULT_SETTINGS.yt_member_block_mode;
  let ytMemberBlocklist: string[] = [...DEFAULT_SETTINGS.yt_member_blocklist];
  let newBlockItem = "";
  let ytMemberAllowlist: string[] = [...DEFAULT_SETTINGS.yt_member_allowlist];
  let newAllowItem = "";
  let ytMemberOpen = false;

  // Tag editing state
  let editingTag: { mode: "block" | "allow"; index: number } | null = null;
  let editingValue = "";
  let tagInputRef: HTMLInputElement | null = null;

  // Bilibili CDN Config
  let bbCdnEnabled = DEFAULT_SETTINGS.bb_cdn.enabled;
  let bbCdnNode = DEFAULT_SETTINGS.bb_cdn.node;
  let bbCdnBangumi = DEFAULT_SETTINGS.bb_cdn.bangumiMode;
  let bbCdnOpen = false;
  let bbCdnSpeedResults: Record<string, { speed: string; error: boolean }> = {};
  let bbCdnTesting = false;
  let bbCdnTestIncludeOverseas =
    DEFAULT_SETTINGS.bb_cdn_test.includeOverseas;
  let bbCdnTestAutoSelectBest =
    DEFAULT_SETTINGS.bb_cdn_test.autoSelectBest;
  let bbCdnTestSortBySpeed = DEFAULT_SETTINGS.bb_cdn_test.sortBySpeed;
  let bbCdnTestSampleSizeMiB = DEFAULT_SETTINGS.bb_cdn_test.sampleSizeMiB;
  let bbCdnTestTimeoutSeconds = DEFAULT_SETTINGS.bb_cdn_test.timeoutSeconds;
  let bbCdnSpeedTestRunId = 0;

  const BB_CDN_SPEED_RESULT_KEY = "bb_cdn_speed_results";

  function getBilibiliSpeedTestNodes(): CdnNode[] {
    return CDN_NODES.filter(
      (node) => bbCdnTestIncludeOverseas || !node.overseas,
    );
  }

  function getBilibiliSpeedTestOptions(): BilibiliCdnSpeedTestOptions {
    return sanitizeBilibiliCdnSpeedTestOptions({
      sampleSizeMiB: bbCdnTestSampleSizeMiB,
      timeoutSeconds: bbCdnTestTimeoutSeconds,
    });
  }

  function parseBilibiliSpeed(
    result?: { speed: string; error?: boolean },
  ): number | null {
    if (!result || result.error) return null;
    const value = Number.parseFloat(result.speed);
    return Number.isFinite(value) ? value : null;
  }

  function findFastestBilibiliNode(
    results: Record<string, { speed: string; error: boolean }>,
    testedNodes: CdnNode[],
  ): CdnNode | null {
    let bestNode: CdnNode | null = null;
    let bestSpeed = -1;

    testedNodes.forEach((node) => {
      const speed = parseBilibiliSpeed(results[node.id]);
      if (speed === null || speed <= bestSpeed) return;
      bestSpeed = speed;
      bestNode = node;
    });

    return bestNode;
  }

  function cleanupBilibiliSpeedTestResults() {
    globalThis.chrome?.storage?.local?.remove?.([BB_CDN_SPEED_RESULT_KEY]);
  }

  function finishBilibiliSpeedTest(
    runId: number,
    testedNodes: CdnNode[],
    results: Record<string, { speed: string; error: boolean }>,
  ) {
    if (runId !== bbCdnSpeedTestRunId) return;

    bbCdnTesting = false;
    bbCdnSpeedResults = { ...results };

    if (bbCdnTestAutoSelectBest) {
      const fastestNode = findFastestBilibiliNode(results, testedNodes);
      if (fastestNode) {
        bbCdnNode = fastestNode.host;
      }
    }

    cleanupBilibiliSpeedTestResults();
  }

  function pollBilibiliSpeedTest(
    runId: number,
    testedNodes: CdnNode[],
    expectedCount: number,
  ) {
    if (
      runId !== bbCdnSpeedTestRunId ||
      !bbCdnTesting ||
      !globalThis.chrome?.storage?.local
    ) {
      return;
    }

    const expectedIds = new Set(testedNodes.map((node) => node.id));

    globalThis.chrome.storage.local.get([BB_CDN_SPEED_RESULT_KEY], (res) => {
      if (runId !== bbCdnSpeedTestRunId || !bbCdnTesting) return;

      const storedResults =
        (res[BB_CDN_SPEED_RESULT_KEY] as Record<
          string,
          { speed: string; error: boolean }
        > | null) ?? null;

      if (storedResults) {
        const results = Object.fromEntries(
          Object.entries(storedResults).filter(([nodeId]) => expectedIds.has(nodeId)),
        ) as Record<string, { speed: string; error: boolean }>;

        bbCdnSpeedResults = { ...results };
        if (Object.keys(results).length >= expectedCount) {
          finishBilibiliSpeedTest(runId, testedNodes, results);
          return;
        }
      }

      window.setTimeout(
        () => pollBilibiliSpeedTest(runId, testedNodes, expectedCount),
        800,
      );
    });
  }

  function startBilibiliSpeedTest() {
    if (bbCdnTesting) return;

    const testedNodes = getBilibiliSpeedTestNodes();
    const speedTestOptions = getBilibiliSpeedTestOptions();
    if (!testedNodes.length) return;

    bbCdnTesting = true;
    bbCdnSpeedResults = {};

    const runId = ++bbCdnSpeedTestRunId;

    if (
      !globalThis.chrome?.tabs?.query ||
      !globalThis.chrome?.tabs?.sendMessage ||
      !globalThis.chrome?.storage?.local
    ) {
      bbCdnTesting = false;
      return;
    }

    cleanupBilibiliSpeedTestResults();

    globalThis.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (runId !== bbCdnSpeedTestRunId) return;

      const tabId = tabs[0]?.id;
      if (!tabId) {
        bbCdnTesting = false;
        return;
      }

      globalThis.chrome.tabs.sendMessage(
        tabId,
        {
          type: "VB_CDN_SPEED_TEST",
          nodes: testedNodes.map((node) => ({ id: node.id, host: node.host })),
          options: speedTestOptions,
        },
        (response) => {
          if (runId !== bbCdnSpeedTestRunId) return;

          if (globalThis.chrome.runtime.lastError) {
            console.warn(
              "Speed test failed: Content script not found on this tab.",
              globalThis.chrome.runtime.lastError.message,
            );
            bbCdnTesting = false;
            return;
          }

          if (!response?.started) {
            bbCdnTesting = false;
            return;
          }

          window.setTimeout(() => {
            pollBilibiliSpeedTest(runId, testedNodes, testedNodes.length);
          }, 1500);
        },
      );
    });
  }

  function abortBilibiliSpeedTest() {
    bbCdnTesting = false;
    bbCdnSpeedTestRunId += 1;
    cleanupBilibiliSpeedTestResults();

    if (!globalThis.chrome?.tabs?.query || !globalThis.chrome?.tabs?.sendMessage) {
      return;
    }

    globalThis.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      globalThis.chrome.tabs.sendMessage(
        tabId,
        { type: "VB_CDN_ABORT_SPEED_TEST" },
        () => {},
      );
    });
  }

  function handleBilibiliCdnNodeUpdate(
    event: CustomEvent<{ bbCdnNode: string }>,
  ) {
    bbCdnNode = event.detail.bbCdnNode;
  }

  function addTags(mode: "block" | "allow", input: string) {
    if (!input.trim()) return;
    const items = input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (mode === "block") {
      ytMemberBlocklist = [...new Set([...ytMemberBlocklist, ...items])];
      newBlockItem = "";
    } else {
      ytMemberAllowlist = [...new Set([...ytMemberAllowlist, ...items])];
      newAllowItem = "";
    }
  }

  function handleTagKeyDown(e: KeyboardEvent, mode: "block" | "allow") {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = mode === "block" ? newBlockItem : newAllowItem;
      addTags(mode, val);
    } else if (e.key === "Backspace") {
      const val = mode === "block" ? newBlockItem : newAllowItem;
      if (val === "") {
        e.preventDefault();
        if (mode === "block" && ytMemberBlocklist.length > 0) {
          ytMemberBlocklist = ytMemberBlocklist.slice(0, -1);
        } else if (mode === "allow" && ytMemberAllowlist.length > 0) {
          ytMemberAllowlist = ytMemberAllowlist.slice(0, -1);
        }
      }
    }
  }

  function removeTag(mode: "block" | "allow", index: number) {
    if (mode === "block") {
      ytMemberBlocklist = ytMemberBlocklist.filter((_, i) => i !== index);
    } else {
      ytMemberAllowlist = ytMemberAllowlist.filter((_, i) => i !== index);
    }
  }

  function handleTagPaste(e: ClipboardEvent, mode: "block" | "allow") {
    if (e.clipboardData) {
      const paste = e.clipboardData.getData("text");
      if (paste) {
        e.preventDefault();
        addTags(mode, paste);
      }
    }
  }

  function startEditingTag(
    mode: "block" | "allow",
    index: number,
    currentValue: string,
  ) {
    editingTag = { mode, index };
    editingValue = currentValue;
    setTimeout(() => {
      if (tagInputRef) {
        tagInputRef.focus();
        tagInputRef.select();
      }
    }, 10);
  }

  function finishEditingTag() {
    if (!editingTag) return;
    const trimmed = editingValue.trim();
    const { mode, index } = editingTag;

    if (!trimmed) {
      // If empty, remove the tag
      removeTag(mode, index);
    } else {
      // Update the tag
      if (mode === "block") {
        ytMemberBlocklist[index] = trimmed;
        ytMemberBlocklist = [...ytMemberBlocklist];
      } else {
        ytMemberAllowlist[index] = trimmed;
        ytMemberAllowlist = [...ytMemberAllowlist];
      }
    }
    editingTag = null;
    editingValue = "";
  }

  function cancelEditingTag() {
    editingTag = null;
    editingValue = "";
  }

  // Fast Pause Config
  let bndEnabled = DEFAULT_SETTINGS.bnd_enabled; // Bilibili
  let ytFastPause = DEFAULT_SETTINGS.yt_fast_pause; // YouTube
  let fastPauseMaster = DEFAULT_SETTINGS.fast_pause_master; // Master Switch (visual only, derived or controls both)
  let fastPauseOpen = false; // Inline accordion state

  // Settings
  let language: I18nLang = "auto";

  // Navigation
  let currentView = "main";

  // Accordion State (Independent)
  let sectionOpen = {
    general: DEFAULT_SETTINGS.ui_state.general ?? true,
    youtube: DEFAULT_SETTINGS.ui_state.youtube ?? true,
    bilibili: DEFAULT_SETTINGS.ui_state.bilibili ?? true,
  };

  let showLangMenu = false;
  const SAVE_DEBOUNCE_MS = 180;
  let saveTimer: number | null = null;
  let pendingSettings: Partial<Settings> | null = null;

  // Helper
  $: t = (key: I18nKey) => i18n(key, language);

  function flushSettingsSave() {
    if (!pendingSettings || typeof chrome === "undefined" || !chrome.storage) {
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

  function notifyPopupFocusOverride(active: boolean) {
    if (!globalThis.chrome?.tabs?.query || !globalThis.chrome?.tabs?.sendMessage) return;
    globalThis.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      globalThis.chrome.tabs
        .sendMessage(tabId, {
          type: "VB_POPUP_FOCUS_OVERRIDE",
          active,
        })
        .catch(() => {
          // Ignore tabs without content script injection.
        });
    });
  }

  onMount(() => {
    notifyPopupFocusOverride(true);
    getSettings([...POPUP_SETTINGS_KEYS]).then((res) => {
      globalEnabled = res.enabled;
      h5Enabled = res.h5_enabled;
      autoPauseEnabled = res.ap_enabled;

      bndEnabled = res.bnd_enabled;
      ytFastPause = res.yt_fast_pause;
      fastPauseMaster = res.fast_pause_master;
      bbBlockSpace = res.bb_block_space;

      ytMemberBlock = res.yt_member_block;
      ytMemberBlockMode = res.yt_member_block_mode;
      ytMemberBlocklist = res.yt_member_blocklist;
      ytMemberAllowlist = res.yt_member_allowlist;

      if (res.bb_cdn) {
        bbCdnEnabled = res.bb_cdn.enabled ?? false;
        bbCdnNode = res.bb_cdn.node ?? "";
        bbCdnBangumi = res.bb_cdn.bangumiMode ?? false;
      }
      if (res.bb_cdn_test) {
        const speedTestOptions = sanitizeBilibiliCdnSpeedTestOptions({
          sampleSizeMiB: res.bb_cdn_test.sampleSizeMiB,
          timeoutSeconds: res.bb_cdn_test.timeoutSeconds,
        });
        bbCdnTestIncludeOverseas = res.bb_cdn_test.includeOverseas ?? true;
        bbCdnTestAutoSelectBest = res.bb_cdn_test.autoSelectBest ?? false;
        bbCdnTestSortBySpeed = res.bb_cdn_test.sortBySpeed ?? false;
        bbCdnTestSampleSizeMiB = speedTestOptions.sampleSizeMiB;
        bbCdnTestTimeoutSeconds = speedTestOptions.timeoutSeconds;
      }

      language = res.language || DEFAULT_SETTINGS.language;

      if (res.ui_state) {
        sectionOpen = { ...sectionOpen, ...res.ui_state };
      }

      if (res.yt_config) {
        ytBlockNative = res.yt_config.blockNativeSeek ?? true;
        ytAlwaysUseOriginalAudio =
          res.yt_config.alwaysUseOriginalAudio ?? false;
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
        ...(() => {
          const speedTestOptions = getBilibiliSpeedTestOptions();
          return {
            bb_cdn_test: {
              includeOverseas: bbCdnTestIncludeOverseas,
              autoSelectBest: bbCdnTestAutoSelectBest,
              sortBySpeed: bbCdnTestSortBySpeed,
              sampleSizeMiB: speedTestOptions.sampleSizeMiB,
              timeoutSeconds: speedTestOptions.timeoutSeconds,
            },
          };
        })(),
        enabled: globalEnabled,
        h5_enabled: h5Enabled,
        ap_enabled: autoPauseEnabled,
        bnd_enabled: bndEnabled,
        yt_fast_pause: ytFastPause,
        fast_pause_master: fastPauseMaster,
        bb_block_space: bbBlockSpace,
        language: language,
        yt_config: {
          blockNativeSeek: ytBlockNative,
          alwaysUseOriginalAudio: ytAlwaysUseOriginalAudio,
        },
        ui_state: sectionOpen,
        yt_member_block: ytMemberBlock,
        yt_member_block_mode: ytMemberBlockMode,
        yt_member_blocklist: ytMemberBlocklist,
        yt_member_allowlist: ytMemberAllowlist,
        bb_cdn: {
          enabled: bbCdnEnabled,
          node: bbCdnNode,
          bangumiMode: bbCdnBangumi,
        },
      });
    }
  }

  onDestroy(() => {
    notifyPopupFocusOverride(false);
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

          <ToggleItem
            title={t("yt_original_audio")}
            desc={t("yt_original_audio_desc")}
            checked={ytAlwaysUseOriginalAudio}
            iconColor="red"
            disabled={!globalEnabled}
            onClick={() =>
              globalEnabled &&
              (ytAlwaysUseOriginalAudio = !ytAlwaysUseOriginalAudio)}
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
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 18V6l10-2v12"
                />
                <circle cx="6" cy="18" r="3" stroke-width="2" />
                <circle cx="16" cy="16" r="3" stroke-width="2" />
              </svg>
            </div>
          </ToggleItem>

          <!-- Hide Members Videos -->
          <AccordionItem
            title={t("yt_member_block")}
            desc={t("yt_member_block_desc")}
            iconColor="red"
            isOpen={ytMemberOpen}
            masterChecked={ytMemberBlock}
            disabled={!globalEnabled}
            onToggleOpen={() => (ytMemberOpen = !ytMemberOpen)}
            onToggleMaster={() =>
              globalEnabled && (ytMemberBlock = !ytMemberBlock)}
          >
            <div
              slot="icon"
              class="w-full h-full flex items-center justify-center text-red-500"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke="currentColor"
              >
                <path
                  d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
                />
                <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                <path
                  d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
                />
                <path d="m2 2 20 20" />
              </svg>
            </div>
            <div slot="content" class="space-y-3 px-1">
              <!-- Artwork-Level Elegance: Mode Slider -->
              <div
                class="relative p-1 bg-black/5 dark:bg-black/20 rounded-[12px] border border-black/[0.04] dark:border-white/5 w-fit mx-auto mt-2 mb-3 shadow-[inset_0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-[inset_0_2px_5px_rgba(0,0,0,0.2)] isolate"
              >
                <div class="relative flex items-center">
                  <!-- Animated Thumb -->
                  <div
                    class="absolute left-0 top-0 bottom-0 w-1/3 rounded-[10px] bg-white dark:bg-[#32363F] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-black/[0.04] dark:border-white/[0.05] z-0 pointer-events-none"
                    style="transform: translateX(calc({ytMemberBlockMode ===
                    'all'
                      ? 0
                      : ytMemberBlockMode === 'blocklist'
                        ? 1
                        : 2} * 100%)); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);"
                  ></div>

                  <!-- Mode: All -->
                  <button
                    class="relative z-10 w-[68px] flex items-center justify-center py-1.5 text-[11px] font-medium transition-colors duration-300 {ytMemberBlockMode ===
                    'all'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80'}"
                    disabled={!globalEnabled || !ytMemberBlock}
                    on:click={() =>
                      globalEnabled &&
                      ytMemberBlock &&
                      (ytMemberBlockMode = "all")}
                  >
                    <span
                      class="active:scale-95 transition-transform duration-200 ease-out"
                    >
                      {t("yt_member_mode_all_short")}
                    </span>
                  </button>

                  <!-- Mode: Blocklist -->
                  <button
                    class="relative z-10 w-[68px] flex items-center justify-center py-1.5 text-[11px] font-medium transition-colors duration-300 {ytMemberBlockMode ===
                    'blocklist'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80'}"
                    disabled={!globalEnabled || !ytMemberBlock}
                    on:click={() =>
                      globalEnabled &&
                      ytMemberBlock &&
                      (ytMemberBlockMode = "blocklist")}
                  >
                    <span
                      class="active:scale-95 transition-transform duration-200 ease-out"
                    >
                      {t("yt_member_mode_blocklist_short")}
                    </span>
                  </button>

                  <!-- Mode: Allowlist -->
                  <button
                    class="relative z-10 w-[68px] flex items-center justify-center py-1.5 text-[11px] font-medium transition-colors duration-300 {ytMemberBlockMode ===
                    'allowlist'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80'}"
                    disabled={!globalEnabled || !ytMemberBlock}
                    on:click={() =>
                      globalEnabled &&
                      ytMemberBlock &&
                      (ytMemberBlockMode = "allowlist")}
                  >
                    <span
                      class="active:scale-95 transition-transform duration-200 ease-out"
                    >
                      {t("yt_member_mode_allowlist_short")}
                    </span>
                  </button>
                </div>
              </div>

              <!-- Blocklist Tags -->
              {#if ytMemberBlockMode === "blocklist"}
                <div class="pt-1">
                  <div class="flex items-center justify-between mb-1.5 px-0.5">
                    <span
                      class="text-[11px] text-gray-500 dark:text-white/40 font-medium tracking-wide"
                    >
                      {t("yt_member_blocklist_label")}
                    </span>
                    <span
                      class="text-[10px] text-gray-400 dark:text-white/30 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full font-medium"
                    >
                      {ytMemberBlocklist.length}
                    </span>
                  </div>
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div
                    class="w-full rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-2 min-h-[72px] flex flex-wrap gap-1.5 focus-within:ring-1 focus-within:ring-red-400/50 focus-within:border-red-400/30 transition-all cursor-text overflow-y-auto max-h-[140px] no-scrollbar {ytMemberBlocklist.length ===
                    0
                      ? 'items-start'
                      : 'items-center'}"
                    on:click={(e) => {
                      if (e.target === e.currentTarget) {
                        document.getElementById("blocklist-input")?.focus();
                      }
                    }}
                  >
                    {#each ytMemberBlocklist as item, i}
                      {#if editingTag?.mode === "block" && editingTag?.index === i}
                        <div class="flex items-center max-w-full">
                          <input
                            bind:this={tagInputRef}
                            class="bg-white dark:bg-black/40 border border-blue-400/50 dark:border-blue-400/50 outline-none text-xs font-mono text-gray-800 dark:text-white/90 px-2 py-1 rounded-lg focus:ring-2 focus:ring-blue-400/20 shadow-inner"
                            style="width: {Math.max(
                              4,
                              editingValue.length + 3,
                            )}ch;"
                            bind:value={editingValue}
                            on:blur={finishEditingTag}
                            on:keydown={(e) => {
                              if (e.key === "Enter") finishEditingTag();
                              if (e.key === "Escape") cancelEditingTag();
                            }}
                          />
                        </div>
                      {:else}
                        <button
                          class="flex items-center gap-1.5 bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/10 pl-2.5 pr-1 py-1 rounded-lg text-xs text-gray-700 dark:text-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)] group hover:bg-white hover:border-red-400/30 dark:hover:bg-black/40 dark:hover:border-red-400/30 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400/30 cursor-pointer text-left max-w-full flex-shrink-0"
                          on:click|stopPropagation={() =>
                            startEditingTag("block", i, item)}
                          title={item}
                        >
                          <span
                            class="truncate font-mono group-hover:text-black dark:group-hover:text-white transition-colors"
                            >{item}</span
                          >
                          <div
                            class="text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 dark:text-white/30 dark:hover:text-red-400 transition-colors ml-0.5 p-0.5 rounded-full"
                            on:click|stopPropagation={() =>
                              removeTag("block", i)}
                            role="button"
                            tabindex="0"
                            aria-label={t("remove_tag")}
                            on:keydown={(e) =>
                              e.key === "Enter" && removeTag("block", i)}
                          >
                            <svg
                              class="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              stroke-width="2.5"
                              ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              /></svg
                            >
                          </div>
                        </button>
                      {/if}
                    {/each}
                    {#if editingTag?.mode !== "block"}
                      <input
                        id="blocklist-input"
                        class="flex-1 min-w-[30px] w-full bg-transparent outline-none text-xs font-mono text-gray-700 dark:text-white/80 placeholder:text-gray-400/70 dark:placeholder:text-white/30 py-1 font-medium px-1"
                        placeholder={t("yt_member_blocklist_placeholder")}
                        disabled={!globalEnabled || !ytMemberBlock}
                        bind:value={newBlockItem}
                        on:keydown={(e) => handleTagKeyDown(e, "block")}
                        on:paste={(e) => handleTagPaste(e, "block")}
                      />
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- Allowlist Tags -->
              {#if ytMemberBlockMode === "allowlist"}
                <div class="pt-1">
                  <div class="flex items-center justify-between mb-1.5 px-0.5">
                    <span
                      class="text-[11px] text-gray-500 dark:text-white/40 font-medium tracking-wide"
                    >
                      {t("yt_member_allowlist_label")}
                    </span>
                    <span
                      class="text-[10px] text-gray-400 dark:text-white/30 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full font-medium"
                    >
                      {ytMemberAllowlist.length}
                    </span>
                  </div>
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div
                    class="w-full rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-2 min-h-[72px] flex flex-wrap gap-1.5 focus-within:ring-1 focus-within:ring-red-400/50 focus-within:border-red-400/30 transition-all cursor-text overflow-y-auto max-h-[140px] no-scrollbar {ytMemberAllowlist.length ===
                    0
                      ? 'items-start'
                      : 'items-center'}"
                    on:click={(e) => {
                      if (e.target === e.currentTarget) {
                        document.getElementById("allowlist-input")?.focus();
                      }
                    }}
                  >
                    {#each ytMemberAllowlist as item, i}
                      {#if editingTag?.mode === "allow" && editingTag?.index === i}
                        <div class="flex items-center max-w-full">
                          <input
                            bind:this={tagInputRef}
                            class="bg-white dark:bg-black/40 border border-blue-400/50 dark:border-blue-400/50 outline-none text-xs font-mono text-gray-800 dark:text-white/90 px-2 py-1 rounded-lg focus:ring-2 focus:ring-blue-400/20 shadow-inner"
                            style="width: {Math.max(
                              4,
                              editingValue.length + 3,
                            )}ch;"
                            bind:value={editingValue}
                            on:blur={finishEditingTag}
                            on:keydown={(e) => {
                              if (e.key === "Enter") finishEditingTag();
                              if (e.key === "Escape") cancelEditingTag();
                            }}
                          />
                        </div>
                      {:else}
                        <button
                          class="flex items-center gap-1.5 bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/10 pl-2.5 pr-1 py-1 rounded-lg text-xs text-gray-700 dark:text-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)] group hover:bg-white hover:border-red-400/30 dark:hover:bg-black/40 dark:hover:border-red-400/30 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400/30 cursor-pointer text-left max-w-full flex-shrink-0"
                          on:click|stopPropagation={() =>
                            startEditingTag("allow", i, item)}
                          title={item}
                        >
                          <span
                            class="truncate font-mono group-hover:text-black dark:group-hover:text-white transition-colors"
                            >{item}</span
                          >
                          <div
                            class="text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 dark:text-white/30 dark:hover:text-red-400 transition-colors ml-0.5 p-0.5 rounded-full"
                            on:click|stopPropagation={() =>
                              removeTag("allow", i)}
                            role="button"
                            tabindex="0"
                            aria-label={t("remove_tag")}
                            on:keydown={(e) =>
                              e.key === "Enter" && removeTag("allow", i)}
                          >
                            <svg
                              class="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              stroke-width="2.5"
                              ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              /></svg
                            >
                          </div>
                        </button>
                      {/if}
                    {/each}
                    {#if editingTag?.mode !== "allow"}
                      <input
                        id="allowlist-input"
                        class="flex-1 min-w-[30px] w-full bg-transparent outline-none text-xs font-mono text-gray-700 dark:text-white/80 placeholder:text-gray-400/70 dark:placeholder:text-white/30 py-1 font-medium px-1"
                        placeholder={t("yt_member_allowlist_placeholder")}
                        disabled={!globalEnabled || !ytMemberBlock}
                        bind:value={newAllowItem}
                        on:keydown={(e) => handleTagKeyDown(e, "allow")}
                        on:paste={(e) => handleTagPaste(e, "allow")}
                      />
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </AccordionItem>
        </SectionCard>

        <!-- SECTION: BILIBILI -->
        <SectionCard
          title="Bilibili"
          iconColor="cyan"
          isOpen={sectionOpen["bilibili"]}
          enabled={globalEnabled}
          onToggle={() => toggleSection("bilibili")}
        >
          <!-- Block Space Scrolling -->
          <ToggleItem
            title={t("bb_block_space")}
            desc={t("bb_block_space_desc")}
            checked={bbBlockSpace}
            iconColor="cyan"
            disabled={!globalEnabled}
            onClick={() => globalEnabled && (bbBlockSpace = !bbBlockSpace)}
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

          <!-- CDN Switcher -->
          <AccordionItem
            title={t("bb_cdn_title")}
            desc={t("bb_cdn_desc")}
            iconColor="cyan"
            isOpen={bbCdnOpen}
            masterChecked={bbCdnEnabled}
            disabled={!globalEnabled}
            onToggleOpen={() => (bbCdnOpen = !bbCdnOpen)}
            onToggleMaster={() =>
              globalEnabled && (bbCdnEnabled = !bbCdnEnabled)}
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
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                /></svg
              >
            </div>
            <div slot="content" class="space-y-3 px-1">
              <!-- CDN Node Selector (Pill w/ Separator) -->
              <div
                class="py-1.5 border-b border-black/[0.03] dark:border-white/[0.03] flex items-center justify-between px-0.5 gap-3"
              >
                <span
                  class="text-[11px] text-gray-500 dark:text-white/40 font-medium tracking-wide shrink-0"
                >
                  {t("bb_cdn_node")}
                </span>

                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 hover:bg-cyan-500/5 hover:border-cyan-500/20 dark:hover:bg-cyan-500/10 dark:hover:border-cyan-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group shadow-[0_1px_2px_rgba(0,0,0,0.02)] min-w-0"
                  disabled={!globalEnabled || !bbCdnEnabled}
                  on:click={() => navigate("bb-cdn-settings")}
                >
                  <span
                    class="text-[11px] font-medium text-gray-700 dark:text-white/90 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate"
                  >
                    {bbCdnNode
                      ? CDN_NODES.find((n) => n.host === bbCdnNode)?.label ||
                        bbCdnNode
                      : t("bb_cdn_default")}
                  </span>
                  <svg
                    class="w-3.5 h-3.5 text-gray-400 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>

              <!-- Bangumi Enhanced Mode (Full Row Clickable) -->
              <button
                class="w-full flex items-center justify-between py-2 px-0.5 text-left outline-none rounded-lg group active:bg-black/5 dark:active:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!globalEnabled || !bbCdnEnabled}
                on:click={() =>
                  globalEnabled &&
                  bbCdnEnabled &&
                  (bbCdnBangumi = !bbCdnBangumi)}
              >
                <div class="flex-1 min-w-0 pr-2">
                  <span
                    class="text-[11px] text-gray-600 dark:text-white/60 font-medium group-active:text-gray-800 dark:group-active:text-white/80 transition-colors"
                  >
                    {t("bb_cdn_bangumi")}
                  </span>
                  <p
                    class="text-[9px] text-gray-400 dark:text-white/30 mt-0.5 leading-tight group-active:text-gray-500 dark:group-active:text-white/50 transition-colors"
                  >
                    {t("bb_cdn_bangumi_desc")}
                  </p>
                </div>
                <!-- Prevent internal label captures by disabling pointer events on the switch -->
                <div
                  class="relative inline-flex items-center ml-2 shrink-0 pointer-events-none"
                >
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked={bbCdnBangumi}
                    readOnly
                  />
                  <div
                    class="w-8 h-[18px] bg-black/10 dark:bg-white/10 rounded-full peer peer-checked:bg-cyan-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:after:translate-x-[14px]"
                  ></div>
                </div>
              </button>
            </div></AccordionItem
          >
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
        <a
          href="https://github.com/tunecc/VidBoost"
          target="_blank"
          rel="noopener noreferrer"
          class="text-[10px] text-gray-400 dark:text-white/30 font-medium tracking-wide hover:text-gray-600 dark:hover:text-white/50 transition-colors cursor-pointer"
        >
          v{manifestVersion}
        </a>

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
                  <span class="relative z-10">{t("lang_auto")}</span>
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
                  <span class="relative z-10">{t("lang_en")}</span>
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
                  <span class="relative z-10">{t("lang_zh")}</span>
                </button>
              </div>

              <!-- Backdrop to close menu -->
              <button
                type="button"
                class="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0 m-0"
                aria-label={t("close_language_menu")}
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
  {:else if currentView === "bb-cdn-settings"}
    <div
      class="absolute inset-0 flex flex-col z-20"
      in:fly={{ x: 20, duration: 400, opacity: 0, easing: quintOut }}
      out:fly={{ x: 20, duration: 300, opacity: 0, easing: quintOut }}
    >
      <CdnSettings
        on:back={() => (currentView = "main")}
        on:update={handleBilibiliCdnNodeUpdate}
        on:speedtest={startBilibiliSpeedTest}
        on:abortspeedtest={abortBilibiliSpeedTest}
        {language}
        {globalEnabled}
        {bbCdnEnabled}
        {bbCdnNode}
        {bbCdnTesting}
        {bbCdnSpeedResults}
        bind:speedTestIncludeOverseas={bbCdnTestIncludeOverseas}
        bind:speedTestAutoSelectBest={bbCdnTestAutoSelectBest}
        bind:speedTestSortBySpeed={bbCdnTestSortBySpeed}
        bind:speedTestSampleSizeMiB={bbCdnTestSampleSizeMiB}
        bind:speedTestTimeoutSeconds={bbCdnTestTimeoutSeconds}
      />
    </div>
  {/if}
</main>
