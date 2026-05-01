<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { i18n, type I18nKey, type I18nLang } from "../lib/i18n";
  import H5Settings from "./H5Settings.svelte";
  import AutoPauseSettings from "./AutoPauseSettings.svelte";
  import CdnSettings from "./CdnSettings.svelte";
  import {
    cloneYTSubtitleConfig,
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    POPUP_SETTINGS_KEYS,
    type Settings,
    type BilibiliSubtitleTargetMode,
    type YTSubtitleConfig,
    type YTSubtitleEffect,
    type YTSubtitleEffectType,
    type YTSubtitleStyle,
    type YTMemberBlockMode,
  } from "../lib/settings";
  import {
    BILIBILI_QUALITY_OPTIONS,
  } from "../lib/bilibiliQuality";
  import SectionCard from "../components/SectionCard.svelte";
  import ToggleItem from "../components/ToggleItem.svelte";
  import AccordionItem from "../components/AccordionItem.svelte";
  import { CDN_NODES, type CdnNode } from "../lib/bilibiliCdnData";
  import {
    sanitizeBilibiliCdnSpeedTestOptions,
    type BilibiliCdnSpeedTestOptions,
  } from "../features/bilibili/bilibiliCdn.shared";
  import {
    getManifestVersion,
    hasStorageApi,
    storageLocalGet,
    storageLocalRemove,
    tabsQuery,
    tabsSendMessage,
  } from "../lib/webext";
  import {
    SUBTITLE_FONT_FILE_ACCEPT,
    canUseSubtitleFontAssetStore,
    createSubtitleFontAssetFromFile,
    deleteSubtitleFontAsset,
    ensureSubtitleFontAssetCapabilities,
    listSubtitleFontAssetSummaries,
    putSubtitleFontAsset,
    type SubtitleFontAssetCapabilities,
    type SubtitleFontAssetSummary,
  } from "../lib/subtitleFontAssets";

  const manifestVersion = getManifestVersion("1.6.1");
  const GITHUB_REPO_URL = "https://github.com/tunecc/VidBoost";
  const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

  // -- State --
  let loaded = false;

  let globalEnabled = DEFAULT_SETTINGS.enabled;
  let h5Enabled = DEFAULT_SETTINGS.h5_enabled;
  let statsSpeedConverter = DEFAULT_SETTINGS.stats_speed_converter;
  let autoPauseEnabled = DEFAULT_SETTINGS.ap_enabled;

  // New Config for YouTube Optimizer
  let ytBlockNative = DEFAULT_SETTINGS.yt_config.blockNativeSeek ?? true;
  let ytAlwaysUseOriginalAudio =
    DEFAULT_SETTINGS.yt_config.alwaysUseOriginalAudio ?? false;
  let ytShowCdnCountry = DEFAULT_SETTINGS.yt_config.showCdnCountry ?? false;
  let ytSubtitleConfig: YTSubtitleConfig = cloneYTSubtitleConfig(
    DEFAULT_SETTINGS.yt_subtitle,
  );
  let ytSubtitleEnabled = ytSubtitleConfig.enabled;
  let ytSubtitleOpen = false;
  let ytSubtitleStyleDisabled = !globalEnabled || !ytSubtitleEnabled;
  let ytSubtitleFontAssets: SubtitleFontAssetSummary[] = [];
  let ytSubtitleManagedImportedFontId = "";
  let ytSubtitleFontInputRef: HTMLInputElement | null = null;
  let ytSubtitleFontImporting = false;
  let ytSubtitleFontStatus = "";
  let ytSubtitleFontStatusTone: "neutral" | "success" | "error" = "neutral";
  const ytSubtitleFontStoreSupported = canUseSubtitleFontAssetStore();
  let ytSubtitleSelectedImportedFontAsset: SubtitleFontAssetSummary | null = null;
  let ytSubtitleCurrentFontCapabilities: SubtitleFontAssetCapabilities | null = null;

  const YT_SUBTITLE_EFFECT_TYPES: YTSubtitleEffectType[] = [
    "outline",
    "drop-shadow",
    "raised",
    "depressed",
  ];

  // Bilibili Config
  let bbSubtitleEnabled = DEFAULT_SETTINGS.bb_subtitle.enabled;
  let bbSubtitleTargetMode: BilibiliSubtitleTargetMode =
    DEFAULT_SETTINGS.bb_subtitle.targetMode;
  let bbSubtitleTargetsList: string[] = [...DEFAULT_SETTINGS.bb_subtitle.targets];
  let bbSubtitleDraftText = "";
  let bbSubtitleDraftInputRef: HTMLInputElement | null = null;
  let bbSubtitleOpen = false;
  let bbSubtitleTargetsTooltipOpen = false;
  let bbSubtitleAddCurrentPending = false;
  let bbSubtitleAddCurrentStatus = "";
  let bbSubtitleAddCurrentTone: "neutral" | "success" | "error" = "neutral";
  let bbSubtitleAddCurrentStatusTimer: number | null = null;
  let bbQualityEnabled = DEFAULT_SETTINGS.bb_quality.enabled;
  let bbQualityTargetsList: string[] = [...DEFAULT_SETTINGS.bb_quality.targets];
  let bbQualityDraftText = "";
  let bbQualityDraftInputRef: HTMLInputElement | null = null;
  let bbQualityOpen = false;
  let bbQualityTargetsTooltipOpen = false;
  let ytSubtitleFollowNativeTooltipOpen = false;
  let bbQualityAddCurrentPending = false;
  let bbQualityAddCurrentStatus = "";
  let bbQualityAddCurrentTone: "neutral" | "success" | "error" = "neutral";
  let bbQualityAddCurrentStatusTimer: number | null = null;
  let bbQualityTargetQn = DEFAULT_SETTINGS.bb_quality.targetQn;
  let bbQualityDefaultQn = DEFAULT_SETTINGS.bb_quality.defaultQn;
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

  function normalizeBilibiliTargetSeparators(input: string): string {
    return input
      .replace(/\r\n?/g, "\n")
      .replace(/[｜￨]/g, "|")
      .replace(/[，、]/g, ",");
  }

  function normalizeBilibiliTargetEntry(input: string): string {
    const normalized = normalizeBilibiliTargetSeparators(input).trim();
    if (!normalized) return "";

    const [rawBase, ...rawNotes] = normalized.split("|");
    const base = rawBase?.trim() ?? "";
    if (!base) return "";

    const note = rawNotes.join("|").trim();
    return note ? `${base} | ${note}` : base;
  }

  function parseBilibiliTargets(input: string): string[] {
    return [...new Set(
      normalizeBilibiliTargetSeparators(input)
        .split(/[\n,]+/)
        .map((item) => normalizeBilibiliTargetEntry(item))
        .filter((item) => item.length > 0),
    )];
  }

  function normalizeBilibiliTargetKey(input: string): string {
    const trimmed = normalizeBilibiliTargetEntry(input)
      .split("|", 1)[0]?.trim() ?? input.trim();
    if (!trimmed) return "";

    const midMatch = trimmed.match(/space\.bilibili\.com\/(\d+)/i);
    if (midMatch?.[1]) return midMatch[1];
    if (/^\d+$/.test(trimmed)) return trimmed;

    return trimmed
      .replace(/^@/, "")
      .replace(/^https?:\/\/(space\.)?bilibili\.com\//i, "")
      .replace(/^space\.bilibili\.com\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  async function requestCurrentBilibiliUploader() {
    const tabs = await tabsQuery({
      active: true,
      currentWindow: true,
    });
    const tabId = tabs[0]?.id;
    if (!tabId) return null;

    const response = await tabsSendMessage<{
      uploader?: { uid?: string | null; name?: string | null; profileUrl?: string | null } | null;
    }>(tabId, {
      type: "VB_BB_SUBTITLE_CURRENT_UPLOADER",
    }).catch(() => null);

    return response?.uploader as
      | { uid?: string | null; name?: string | null; profileUrl?: string | null }
      | null
      | undefined;
  }

  function buildBilibiliTargetValueFromUploader(
    uploader: { uid?: string | null; name?: string | null; profileUrl?: string | null } | null | undefined,
  ) {
    if (!uploader?.uid && !uploader?.name && !uploader?.profileUrl) {
      return "";
    }

    const baseValue =
      uploader.uid?.trim() ||
      uploader.profileUrl?.trim() ||
      uploader.name?.trim() ||
      "";
    const note = uploader.name?.trim().replace(/\s+/g, " ").replace(/\|/g, "/") || "";
    return normalizeBilibiliTargetEntry(baseValue
      ? note && note !== baseValue
        ? `${baseValue} | ${note}`
        : baseValue
      : "");
  }

  async function addCurrentBilibiliUploaderToAllowlist() {
    if (bbSubtitleAddCurrentPending) {
      return;
    }

    bbSubtitleAddCurrentPending = true;
    showBilibiliSubtitleStatus("", "neutral", 0);

    try {
      const uploader = await requestCurrentBilibiliUploader();

      if (!uploader?.uid && !uploader?.name && !uploader?.profileUrl) {
        showBilibiliSubtitleStatus(t("bb_subtitle_add_current_failed"), "error");
        return;
      }

      const nextValue = buildBilibiliTargetValueFromUploader(uploader);
      if (!nextValue) {
        showBilibiliSubtitleStatus(t("bb_subtitle_add_current_failed"), "error");
        return;
      }

      const existingValues = bbSubtitleTargetsList;
      const existingKeySet = new Set(
        existingValues.map((item) => normalizeBilibiliTargetKey(item)),
      );
      const nextKey = normalizeBilibiliTargetKey(nextValue);

      if (!nextKey || existingKeySet.has(nextKey)) {
        showBilibiliSubtitleStatus(
          uploader.name
            ? `${t("bb_subtitle_add_current_exists")}: ${uploader.name}`
            : t("bb_subtitle_add_current_exists"),
          "neutral",
        );
        return;
      }

      bbSubtitleTargetsList = [...existingValues, nextValue];
      showBilibiliSubtitleStatus(
        uploader.name
          ? `${t("bb_subtitle_add_current_added")}: ${uploader.name}`
          : t("bb_subtitle_add_current_added"),
        "success",
      );
    } finally {
      bbSubtitleAddCurrentPending = false;
    }
  }

  function getBilibiliSubtitleStatusClass() {
    if (bbSubtitleAddCurrentTone === "success") {
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:text-emerald-300";
    }

    if (bbSubtitleAddCurrentTone === "error") {
      return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/12 dark:text-rose-300";
    }

    return "border-black/6 bg-black/[0.03] text-gray-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-white/60";
  }

  function showBilibiliSubtitleStatus(
    message: string,
    tone: "neutral" | "success" | "error",
    autoHideMs = 2200,
  ) {
    bbSubtitleAddCurrentStatus = message;
    bbSubtitleAddCurrentTone = tone;

    if (bbSubtitleAddCurrentStatusTimer) {
      clearTimeout(bbSubtitleAddCurrentStatusTimer);
      bbSubtitleAddCurrentStatusTimer = null;
    }

    if (!message || autoHideMs <= 0) return;

    bbSubtitleAddCurrentStatusTimer = window.setTimeout(() => {
      bbSubtitleAddCurrentStatus = "";
      bbSubtitleAddCurrentStatusTimer = null;
    }, autoHideMs);
  }

  function appendBilibiliSubtitleTargets(values: string[]) {
    if (!values.length) return;

    const existingKeySet = new Set(
      bbSubtitleTargetsList.map((item) => normalizeBilibiliTargetKey(item)),
    );
    const nextItems: string[] = [];

    values.forEach((item) => {
      const normalized = normalizeBilibiliTargetKey(item);
      if (!normalized || existingKeySet.has(normalized)) return;
      existingKeySet.add(normalized);
      nextItems.push(item);
    });

    if (!nextItems.length) return;
    bbSubtitleTargetsList = [...bbSubtitleTargetsList, ...nextItems];
  }

  function commitBilibiliSubtitleDraft() {
    const parsed = parseBilibiliTargets(bbSubtitleDraftText);
    bbSubtitleDraftText = "";
    appendBilibiliSubtitleTargets(parsed);
  }

  function handleBilibiliSubtitleDraftKeyDown(event: KeyboardEvent) {
    if (event.isComposing) {
      return;
    }

    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitBilibiliSubtitleDraft();
      return;
    }

    if (event.key === "Backspace" && bbSubtitleDraftText === "") {
      event.preventDefault();
      bbSubtitleTargetsList = bbSubtitleTargetsList.slice(0, -1);
    }
  }

  function handleBilibiliSubtitleDraftPaste(event: ClipboardEvent) {
    if (!event.clipboardData) return;

    const pastedText = event.clipboardData.getData("text").trim();
    if (!pastedText) return;

    const hasStructuredSeparators = /[\n,，、]/.test(pastedText);
    if (!hasStructuredSeparators && bbSubtitleDraftText.trim()) {
      return;
    }

    event.preventDefault();
    appendBilibiliSubtitleTargets(parseBilibiliTargets(pastedText));
    bbSubtitleDraftText = "";
  }

  function focusBilibiliSubtitleDraftInput() {
    if (!globalEnabled || !bbSubtitleEnabled) return;
    bbSubtitleDraftInputRef?.focus();
  }

  function removeBilibiliSubtitleTarget(target: string) {
    const targetKey = normalizeBilibiliTargetKey(target);
    if (!targetKey) return;

    bbSubtitleTargetsList = bbSubtitleTargetsList
      .filter((item) => normalizeBilibiliTargetKey(item) !== targetKey)
      .slice();
  }

  async function addCurrentBilibiliUploaderToQualityTargets() {
    if (bbQualityAddCurrentPending) {
      return;
    }

    bbQualityAddCurrentPending = true;
    showBilibiliQualityStatus("", "neutral", 0);

    try {
      const uploader = await requestCurrentBilibiliUploader();
      if (!uploader?.uid && !uploader?.name && !uploader?.profileUrl) {
        showBilibiliQualityStatus(t("bb_quality_add_current_failed"), "error");
        return;
      }

      const nextValue = buildBilibiliTargetValueFromUploader(uploader);
      if (!nextValue) {
        showBilibiliQualityStatus(t("bb_quality_add_current_failed"), "error");
        return;
      }

      const existingValues = bbQualityTargetsList;
      const existingKeySet = new Set(
        existingValues.map((item) => normalizeBilibiliTargetKey(item)),
      );
      const nextKey = normalizeBilibiliTargetKey(nextValue);

      if (!nextKey || existingKeySet.has(nextKey)) {
        showBilibiliQualityStatus(
          uploader.name
            ? `${t("bb_quality_add_current_exists")}: ${uploader.name}`
            : t("bb_quality_add_current_exists"),
          "neutral",
        );
        return;
      }

      bbQualityTargetsList = [...existingValues, nextValue];
      showBilibiliQualityStatus(
        uploader.name
          ? `${t("bb_quality_add_current_added")}: ${uploader.name}`
          : t("bb_quality_add_current_added"),
        "success",
      );
    } finally {
      bbQualityAddCurrentPending = false;
    }
  }

  function showBilibiliQualityStatus(
    message: string,
    tone: "neutral" | "success" | "error",
    autoHideMs = 2200,
  ) {
    bbQualityAddCurrentStatus = message;
    bbQualityAddCurrentTone = tone;

    if (bbQualityAddCurrentStatusTimer) {
      clearTimeout(bbQualityAddCurrentStatusTimer);
      bbQualityAddCurrentStatusTimer = null;
    }

    if (!message || autoHideMs <= 0) return;

    bbQualityAddCurrentStatusTimer = window.setTimeout(() => {
      bbQualityAddCurrentStatus = "";
      bbQualityAddCurrentStatusTimer = null;
    }, autoHideMs);
  }

  function appendBilibiliQualityTargets(values: string[]) {
    if (!values.length) return;

    const existingKeySet = new Set(
      bbQualityTargetsList.map((item) => normalizeBilibiliTargetKey(item)),
    );
    const nextItems: string[] = [];

    values.forEach((item) => {
      const normalized = normalizeBilibiliTargetKey(item);
      if (!normalized || existingKeySet.has(normalized)) return;
      existingKeySet.add(normalized);
      nextItems.push(item);
    });

    if (!nextItems.length) return;
    bbQualityTargetsList = [...bbQualityTargetsList, ...nextItems];
  }

  function commitBilibiliQualityDraft() {
    const parsed = parseBilibiliTargets(bbQualityDraftText);
    bbQualityDraftText = "";
    appendBilibiliQualityTargets(parsed);
  }

  function handleBilibiliQualityDraftKeyDown(event: KeyboardEvent) {
    if (event.isComposing) {
      return;
    }

    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitBilibiliQualityDraft();
      return;
    }

    if (event.key === "Backspace" && bbQualityDraftText === "") {
      event.preventDefault();
      bbQualityTargetsList = bbQualityTargetsList.slice(0, -1);
    }
  }

  function handleBilibiliQualityDraftPaste(event: ClipboardEvent) {
    if (!event.clipboardData) return;

    const pastedText = event.clipboardData.getData("text").trim();
    if (!pastedText) return;

    const hasStructuredSeparators = /[\n,，、]/.test(pastedText);
    if (!hasStructuredSeparators && bbQualityDraftText.trim()) {
      return;
    }

    event.preventDefault();
    appendBilibiliQualityTargets(parseBilibiliTargets(pastedText));
    bbQualityDraftText = "";
  }

  function focusBilibiliQualityDraftInput() {
    if (!globalEnabled || !bbQualityEnabled) return;
    bbQualityDraftInputRef?.focus();
  }

  function removeBilibiliQualityTarget(target: string) {
    const targetKey = normalizeBilibiliTargetKey(target);
    if (!targetKey) return;

    bbQualityTargetsList = bbQualityTargetsList
      .filter((item) => normalizeBilibiliTargetKey(item) !== targetKey)
      .slice();
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
    void storageLocalRemove([BB_CDN_SPEED_RESULT_KEY]);
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

  async function pollBilibiliSpeedTest(
    runId: number,
    testedNodes: CdnNode[],
    expectedCount: number,
  ) {
    if (runId !== bbCdnSpeedTestRunId || !bbCdnTesting || !hasStorageApi("local")) {
      return;
    }

    const expectedIds = new Set(testedNodes.map((node) => node.id));
    const res = await storageLocalGet<Record<string, unknown>>([BB_CDN_SPEED_RESULT_KEY]);
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
      () => void pollBilibiliSpeedTest(runId, testedNodes, expectedCount),
      800,
    );
  }

  async function startBilibiliSpeedTest() {
    if (bbCdnTesting) return;

    const testedNodes = getBilibiliSpeedTestNodes();
    const speedTestOptions = getBilibiliSpeedTestOptions();
    if (!testedNodes.length) return;

    bbCdnTesting = true;
    bbCdnSpeedResults = {};

    const runId = ++bbCdnSpeedTestRunId;

    if (!hasStorageApi("local")) {
      bbCdnTesting = false;
      return;
    }

    cleanupBilibiliSpeedTestResults();
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    if (runId !== bbCdnSpeedTestRunId) return;

    const tabId = tabs[0]?.id;
    if (!tabId) {
      bbCdnTesting = false;
      return;
    }

    try {
      const response = await tabsSendMessage<{ started?: boolean }>(tabId, {
        type: "VB_CDN_SPEED_TEST",
        nodes: testedNodes.map((node) => ({ id: node.id, host: node.host })),
        options: speedTestOptions,
      });

      if (runId !== bbCdnSpeedTestRunId) return;
      if (!response?.started) {
        bbCdnTesting = false;
        return;
      }

      window.setTimeout(() => {
        void pollBilibiliSpeedTest(runId, testedNodes, testedNodes.length);
      }, 1500);
    } catch (error) {
      console.warn("Speed test failed: Content script not found on this tab.", error);
      bbCdnTesting = false;
    }
  }

  async function abortBilibiliSpeedTest() {
    bbCdnTesting = false;
    bbCdnSpeedTestRunId += 1;
    cleanupBilibiliSpeedTestResults();
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    void tabsSendMessage(tabId, { type: "VB_CDN_ABORT_SPEED_TEST" }).catch(() => {});
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
  $: ytSubtitleStyleDisabled = !globalEnabled || !ytSubtitleEnabled;
  $: ytSubtitleSelectedImportedFontAsset = getYtSubtitleCurrentImportedFontAsset(
    ytSubtitleConfig.style,
  );
  $: ytSubtitleCurrentFontCapabilities =
    ytSubtitleSelectedImportedFontAsset?.capabilities ?? null;

  function flushSettingsSave() {
    if (!pendingSettings || !hasStorageApi("local")) {
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

  function clampNumber(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function readInputNumber(event: Event, fallback: number) {
    const nextValue = Number((event.currentTarget as HTMLInputElement | HTMLSelectElement)?.value);
    return Number.isFinite(nextValue) ? nextValue : fallback;
  }

  function readTextValue(event: Event) {
    return (event.currentTarget as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
  }

  function normalizeHexColor(value: string, fallback: string) {
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const [, r = "0", g = "0", b = "0"] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return fallback;
  }

  function formatFileSize(size: number) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  function getYtSubtitleCurrentImportedFontAsset(
    style: YTSubtitleStyle = ytSubtitleConfig.style,
  ) {
    if (style.fontFamilyPreset !== "imported" || !style.importedFontId) {
      return null;
    }

    return ytSubtitleFontAssets.find((asset) => asset.id === style.importedFontId) ?? null;
  }

  function resolveNextImportedFontId(preferredId = "") {
    if (preferredId && ytSubtitleFontAssets.some((asset) => asset.id === preferredId)) {
      return preferredId;
    }

    return ytSubtitleFontAssets[0]?.id ?? "";
  }

  function syncManagedImportedFontId(preferredId = "") {
    ytSubtitleManagedImportedFontId = resolveNextImportedFontId(
      preferredId || ytSubtitleManagedImportedFontId,
    );
  }

  function getYtSubtitleFontSelectValue(config: YTSubtitleConfig) {
    if (config.style.fontFamilyPreset === "imported" && config.style.importedFontId) {
      return `imported:${config.style.importedFontId}`;
    }

    if (config.style.fontFamilyPreset === "custom") {
      return "default";
    }

    return config.style.fontFamilyPreset;
  }

  async function loadYtSubtitleFontAssets() {
    if (!ytSubtitleFontStoreSupported) {
      ytSubtitleFontAssets = [];
      return;
    }

    try {
      let summaries = await listSubtitleFontAssetSummaries();
      const pendingCapabilityAssets = summaries.filter(
        (asset) => !asset.capabilities?.analysisVersion,
      );
      if (pendingCapabilityAssets.length > 0) {
        await Promise.all(
          pendingCapabilityAssets.map((asset) =>
            ensureSubtitleFontAssetCapabilities(asset.id).catch(() => null),
          ),
        );
        summaries = await listSubtitleFontAssetSummaries();
      }

      ytSubtitleFontAssets = summaries;
      syncManagedImportedFontId(ytSubtitleConfig.style.importedFontId);
      if (ytSubtitleConfig.style.fontFamilyPreset === "imported") {
        const nextFontId = resolveNextImportedFontId(
          ytSubtitleConfig.style.importedFontId,
        );
        if (!nextFontId) {
          updateYtSubtitleStyle({
            fontFamilyPreset: "default",
            importedFontId: "",
          });
        } else if (nextFontId !== ytSubtitleConfig.style.importedFontId) {
          updateYtSubtitleStyle({
            importedFontId: nextFontId,
          });
        }
      }
    } catch {
      ytSubtitleFontAssets = [];
      ytSubtitleFontStatus = t("yt_subtitle_font_storage_unavailable");
      ytSubtitleFontStatusTone = "error";
    }
  }

  function updateYtSubtitleConfig(patch: Partial<YTSubtitleConfig>) {
    ytSubtitleConfig = cloneYTSubtitleConfig({
      ...ytSubtitleConfig,
      enabled: ytSubtitleEnabled,
      ...patch,
    });
  }

  function updateYtSubtitleStyle(patch: Partial<YTSubtitleStyle>) {
    updateYtSubtitleConfig({
      style: {
        ...ytSubtitleConfig.style,
        ...patch,
      },
    });
  }

  function updateYtSubtitleFontSelection(value: string) {
    if (value.startsWith("imported:")) {
      const importedFontId = value.slice("imported:".length).trim();
      syncManagedImportedFontId(importedFontId);
      updateYtSubtitleStyle({
        fontFamilyPreset: "imported",
        importedFontId,
      });
      return;
    }

    updateYtSubtitleStyle({
      fontFamilyPreset: value === "custom" ? "default" : value as YTSubtitleConfig["style"]["fontFamilyPreset"],
    });
  }

  function updateYtSubtitleManagedImportedFont(value: string) {
    const importedFontId = value.trim();
    ytSubtitleManagedImportedFontId = importedFontId;
  }

  function createYtSubtitleEffect(type: YTSubtitleEffectType): YTSubtitleEffect {
    return {
      type,
      size: 2,
      strength: 70,
    };
  }

  function getYtSubtitleEffectTypeNameKey(effectType: YTSubtitleEffectType): I18nKey {
    switch (effectType) {
      case "drop-shadow":
        return "yt_subtitle_edge_drop_shadow";
      case "raised":
        return "yt_subtitle_edge_raised";
      case "depressed":
        return "yt_subtitle_edge_depressed";
      case "outline":
      default:
        return "yt_subtitle_edge_outline";
    }
  }

  function getYtSubtitleEffectSizeLabel(effectType: YTSubtitleEffectType): I18nKey {
    switch (effectType) {
      case "drop-shadow":
        return "yt_subtitle_drop_shadow_size";
      case "raised":
        return "yt_subtitle_raised_depth";
      case "depressed":
        return "yt_subtitle_depressed_depth";
      case "outline":
      default:
        return "yt_subtitle_outline_width";
    }
  }

  function getYtSubtitleEffectStrengthLabel(effectType: YTSubtitleEffectType): I18nKey {
    switch (effectType) {
      case "drop-shadow":
        return "yt_subtitle_drop_shadow_strength";
      case "outline":
        return "yt_subtitle_outline_strength";
      case "raised":
        return "yt_subtitle_raised_strength";
      case "depressed":
        return "yt_subtitle_depressed_strength";
      default:
        return "yt_subtitle_shadow_strength";
    }
  }

  function getUsedYtSubtitleEffectTypes(excludeIndex = -1): Set<YTSubtitleEffectType> {
    return new Set(
      ytSubtitleConfig.style.effects
        .filter((_, index) => index !== excludeIndex)
        .map((effect) => effect.type),
    );
  }

  function getAvailableYtSubtitleEffectTypes(currentIndex: number): YTSubtitleEffectType[] {
    const usedTypes = getUsedYtSubtitleEffectTypes(currentIndex);
    return YT_SUBTITLE_EFFECT_TYPES.filter((effectType) =>
      !usedTypes.has(effectType) || ytSubtitleConfig.style.effects[currentIndex]?.type === effectType
    );
  }

  function canAddYtSubtitleEffect() {
    return ytSubtitleConfig.style.effects.length < YT_SUBTITLE_EFFECT_TYPES.length;
  }

  function updateYtSubtitleEffect(index: number, patch: Partial<YTSubtitleEffect>) {
    updateYtSubtitleStyle({
      effects: ytSubtitleConfig.style.effects.map((effect, effectIndex) =>
        effectIndex === index ? { ...effect, ...patch } : effect
      ),
    });
  }

  function updateYtSubtitleEffectType(index: number, value: string) {
    const nextType = value as YTSubtitleEffectType;
    if (getUsedYtSubtitleEffectTypes(index).has(nextType)) return;
    updateYtSubtitleEffect(index, { type: nextType });
  }

  function addYtSubtitleEffect() {
    const usedTypes = getUsedYtSubtitleEffectTypes();
    const nextType = YT_SUBTITLE_EFFECT_TYPES.find((effectType) => !usedTypes.has(effectType));
    if (!nextType) return;

    updateYtSubtitleStyle({
      effects: [...ytSubtitleConfig.style.effects, createYtSubtitleEffect(nextType)],
    });
  }

  function removeYtSubtitleEffect(index: number) {
    updateYtSubtitleStyle({
      effects: ytSubtitleConfig.style.effects.filter((_, effectIndex) => effectIndex !== index),
    });
  }

  function formatSliderNumber(value: number): string {
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
  }

  function openYtSubtitleFontPicker() {
    ytSubtitleFontInputRef?.click();
  }

  async function handleYtSubtitleFontFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (input) {
      input.value = "";
    }
    if (!file) return;

    ytSubtitleFontImporting = true;
    ytSubtitleFontStatus = t("yt_subtitle_font_importing");
    ytSubtitleFontStatusTone = "neutral";

    try {
      const record = await createSubtitleFontAssetFromFile(file);
      const summary = await putSubtitleFontAsset(record);
      await loadYtSubtitleFontAssets();
      ytSubtitleManagedImportedFontId = summary.id;
      updateYtSubtitleStyle({
        fontFamilyPreset: "imported",
        importedFontId: summary.id,
      });
      ytSubtitleFontStatus = `${t("yt_subtitle_font_imported")}：${summary.displayName}`;
      ytSubtitleFontStatusTone = "success";
    } catch (error) {
      ytSubtitleFontStatus =
        error instanceof Error && error.message === "unsupported_font_file"
          ? t("yt_subtitle_font_invalid_file")
          : t("yt_subtitle_font_import_failed");
      ytSubtitleFontStatusTone = "error";
    } finally {
      ytSubtitleFontImporting = false;
    }
  }

  async function removeSelectedYtSubtitleFont() {
    const targetId = ytSubtitleManagedImportedFontId.trim();
    if (!targetId) return;

    try {
      await deleteSubtitleFontAsset(targetId);
      await loadYtSubtitleFontAssets();

      const nextFontId = resolveNextImportedFontId(targetId);
      if (nextFontId) {
        ytSubtitleManagedImportedFontId = nextFontId;
        if (
          ytSubtitleConfig.style.fontFamilyPreset === "imported" &&
          ytSubtitleConfig.style.importedFontId === targetId
        ) {
          updateYtSubtitleStyle({
            fontFamilyPreset: "imported",
            importedFontId: nextFontId,
          });
        }
      } else {
        ytSubtitleManagedImportedFontId = "";
        if (
          ytSubtitleConfig.style.fontFamilyPreset === "imported" &&
          ytSubtitleConfig.style.importedFontId === targetId
        ) {
          updateYtSubtitleStyle({
            fontFamilyPreset: "default",
            importedFontId: "",
          });
        }
      }

      ytSubtitleFontStatus = t("yt_subtitle_font_removed");
      ytSubtitleFontStatusTone = "neutral";
    } catch {
      ytSubtitleFontStatus = t("yt_subtitle_font_remove_failed");
      ytSubtitleFontStatusTone = "error";
    }
  }

  async function notifyPopupFocusOverride(active: boolean) {
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return;
    void tabsSendMessage(tabId, {
      type: "VB_POPUP_FOCUS_OVERRIDE",
      active,
    }).catch(() => {
      // Ignore tabs without content script injection.
    });
  }

  onMount(() => {
    void notifyPopupFocusOverride(true);
    getSettings([...POPUP_SETTINGS_KEYS]).then((res) => {
      globalEnabled = res.enabled;
      h5Enabled = res.h5_enabled;
      statsSpeedConverter = res.stats_speed_converter;
      autoPauseEnabled = res.ap_enabled;

      bndEnabled = res.bnd_enabled;
      ytFastPause = res.yt_fast_pause;
      fastPauseMaster = res.fast_pause_master;
      if (res.bb_subtitle) {
        bbSubtitleEnabled = res.bb_subtitle.enabled ?? false;
        bbSubtitleTargetMode = res.bb_subtitle.targetMode ?? "all";
        bbSubtitleTargetsList = Array.isArray(res.bb_subtitle.targets)
          ? [...res.bb_subtitle.targets]
          : [];
        bbSubtitleDraftText = "";
      }
      if (res.bb_quality) {
        bbQualityEnabled = res.bb_quality.enabled ?? false;
        bbQualityTargetsList = Array.isArray(res.bb_quality.targets)
          ? [...res.bb_quality.targets]
          : [];
        bbQualityTargetQn = res.bb_quality.targetQn ?? DEFAULT_SETTINGS.bb_quality.targetQn;
        bbQualityDefaultQn = res.bb_quality.defaultQn ?? DEFAULT_SETTINGS.bb_quality.defaultQn;
        bbQualityDraftText = "";
      }
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
        ytShowCdnCountry = res.yt_config.showCdnCountry ?? false;
      } else if (res.h5_config) {
        ytBlockNative = res.h5_config.blockNumKeys ?? true;
      }

      if (res.yt_subtitle) {
        ytSubtitleConfig = cloneYTSubtitleConfig(res.yt_subtitle);
        if (ytSubtitleConfig.style.fontFamilyPreset === "custom") {
          ytSubtitleConfig = cloneYTSubtitleConfig({
            ...ytSubtitleConfig,
            style: {
              ...ytSubtitleConfig.style,
              fontFamilyPreset: "default",
            },
          });
        }
        ytSubtitleManagedImportedFontId = ytSubtitleConfig.style.importedFontId;
        ytSubtitleEnabled = ytSubtitleConfig.enabled;
      }

      void loadYtSubtitleFontAssets();
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
    if (loaded && hasStorageApi("local")) {
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
        stats_speed_converter: statsSpeedConverter,
        ap_enabled: autoPauseEnabled,
        bnd_enabled: bndEnabled,
        yt_fast_pause: ytFastPause,
        fast_pause_master: fastPauseMaster,
        bb_subtitle: {
          enabled: bbSubtitleEnabled,
          targetMode: bbSubtitleTargetMode,
          targets: bbSubtitleTargetsList,
        },
        bb_quality: {
          enabled: bbQualityEnabled,
          targets: bbQualityTargetsList,
          targetQn: bbQualityTargetQn,
          defaultQn: bbQualityDefaultQn,
        },
        bb_block_space: bbBlockSpace,
        language: language,
        yt_config: {
          blockNativeSeek: ytBlockNative,
          alwaysUseOriginalAudio: ytAlwaysUseOriginalAudio,
          showCdnCountry: ytShowCdnCountry,
        },
        yt_subtitle: {
          ...cloneYTSubtitleConfig(ytSubtitleConfig),
          enabled: ytSubtitleEnabled,
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
    if (bbSubtitleAddCurrentStatusTimer) {
      clearTimeout(bbSubtitleAddCurrentStatusTimer);
      bbSubtitleAddCurrentStatusTimer = null;
    }
    if (bbQualityAddCurrentStatusTimer) {
      clearTimeout(bbQualityAddCurrentStatusTimer);
      bbQualityAddCurrentStatusTimer = null;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    flushSettingsSave();
  });

  function navigate(view: string) {
    bbSubtitleTargetsTooltipOpen = false;
    bbQualityTargetsTooltipOpen = false;
    if (!globalEnabled) return;
    currentView = view;
  }

  function toggleSection(section: "general" | "youtube" | "bilibili") {
    bbSubtitleTargetsTooltipOpen = false;
    bbQualityTargetsTooltipOpen = false;
    ytSubtitleFollowNativeTooltipOpen = false;
    sectionOpen[section] = !sectionOpen[section];
  }

  function toggleBilibiliSubtitleTargetsTooltip() {
    bbSubtitleTargetsTooltipOpen = !bbSubtitleTargetsTooltipOpen;
  }

  function closeBilibiliSubtitleTargetsTooltip() {
    bbSubtitleTargetsTooltipOpen = false;
  }

  function toggleBilibiliQualityTargetsTooltip() {
    bbQualityTargetsTooltipOpen = !bbQualityTargetsTooltipOpen;
  }

  function closeBilibiliQualityTargetsTooltip() {
    bbQualityTargetsTooltipOpen = false;
  }

  function toggleYtSubtitleFollowNativeTooltip() {
    ytSubtitleFollowNativeTooltipOpen = !ytSubtitleFollowNativeTooltipOpen;
  }

  function closeYtSubtitleFollowNativeTooltip() {
    ytSubtitleFollowNativeTooltipOpen = false;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeBilibiliSubtitleTargetsTooltip();
      closeBilibiliQualityTargetsTooltip();
      closeYtSubtitleFollowNativeTooltip();
    }
  }

  $: if (bbSubtitleTargetMode !== "allowlist" && bbSubtitleTargetsTooltipOpen) {
    bbSubtitleTargetsTooltipOpen = false;
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

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

          <ToggleItem
            title={t("stats_speed_converter")}
            desc={t("stats_speed_converter_desc")}
            checked={statsSpeedConverter}
            iconColor="blue"
            disabled={!globalEnabled}
            onClick={() =>
              globalEnabled && (statsSpeedConverter = !statsSpeedConverter)}
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
                  d="M3 17h4v-5H3v5zm7 0h4V7h-4v10zm7 0h4V4h-4v13z"
                />
              </svg>
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

          <ToggleItem
            title={t("yt_cdn_status")}
            desc={t("yt_cdn_status_desc")}
            checked={ytShowCdnCountry}
            iconColor="red"
            disabled={!globalEnabled}
            onClick={() =>
              globalEnabled && (ytShowCdnCountry = !ytShowCdnCountry)}
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
                <circle cx="12" cy="12" r="9" stroke-width="2" />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"
                />
              </svg>
            </div>
          </ToggleItem>

          <AccordionItem
            title={t("yt_subtitle_overlay")}
            desc={t("yt_subtitle_overlay_desc")}
            iconColor="red"
            isOpen={ytSubtitleOpen}
            masterChecked={ytSubtitleEnabled}
            disabled={!globalEnabled}
            onToggleOpen={() => (ytSubtitleOpen = !ytSubtitleOpen)}
            onToggleMaster={() =>
              globalEnabled && (ytSubtitleEnabled = !ytSubtitleEnabled)}
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
                  d="M4 6h16v9a2 2 0 0 1-2 2H9l-5 4V8a2 2 0 0 1 2-2Z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 10h8M8 13h5"
                />
              </svg>
            </div>
            <div slot="content" class="space-y-3 px-1">
              <div class="rounded-2xl border border-black/5 bg-black/[0.02] p-3 space-y-3 dark:border-white/8 dark:bg-white/[0.03]">
                <div class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/55">
                  {t("yt_subtitle_basic")}
                </div>

                <label class="flex items-start justify-between gap-3 rounded-xl border border-black/5 bg-white/70 px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.03]">
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <div class="text-[12px] font-medium text-gray-800 dark:text-white/90">
                        {t("yt_subtitle_follow_native_toggle")}
                      </div>

                      <div class="relative flex shrink-0 items-center">
                        <button
                          type="button"
                          aria-controls="yt-subtitle-follow-native-tooltip"
                          aria-expanded={ytSubtitleFollowNativeTooltipOpen}
                          class="relative z-50 flex shrink-0 items-center justify-center w-[14px] h-[14px] rounded-full text-[10px] font-bold text-gray-400 bg-black/5 hover:bg-black/10 hover:text-gray-600 dark:text-white/40 dark:bg-white/10 dark:hover:bg-white/20 dark:hover:text-white/70 transition-colors focus:bg-cyan-500/10 focus:text-cyan-600 dark:focus:bg-cyan-500/20 dark:focus:text-cyan-300 outline-none"
                          on:click|stopPropagation={toggleYtSubtitleFollowNativeTooltip}
                        >
                          ?
                        </button>

                        {#if ytSubtitleFollowNativeTooltipOpen}
                          <div
                            id="yt-subtitle-follow-native-tooltip"
                            role="tooltip"
                            class="absolute left-1/2 top-full mt-2 z-50 w-[220px] -translate-x-1/2 rounded-xl border border-black/5 bg-white/90 p-2.5 text-[10.5px] leading-relaxed text-gray-600 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#2A2D35]/95 dark:text-white/70"
                            in:fly|local={{ y: 6, duration: 180, opacity: 0.35, easing: quintOut }}
                            out:fade|local={{ duration: 120 }}
                          >
                            {t("yt_subtitle_follow_native_toggle_desc")}
                          </div>

                          <button
                            type="button"
                            class="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0 m-0"
                            aria-label={t("yt_subtitle_follow_native_toggle_desc")}
                            on:click={closeYtSubtitleFollowNativeTooltip}
                          ></button>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    class={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                      ytSubtitleConfig.followNativeToggle
                        ? "bg-red-500"
                        : "bg-gray-300 dark:bg-white/15"
                    } ${ytSubtitleStyleDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                    aria-pressed={ytSubtitleConfig.followNativeToggle}
                    disabled={ytSubtitleStyleDisabled}
                    on:click={() =>
                      !ytSubtitleStyleDisabled &&
                      updateYtSubtitleConfig({
                        followNativeToggle: !ytSubtitleConfig.followNativeToggle,
                      })}
                  >
                    <span
                      class={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                        ytSubtitleConfig.followNativeToggle ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </label>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_font_family")}
                    </span>
                  </div>
                  <select
                    class="w-full rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-[12px] text-gray-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85 disabled:opacity-50 disabled:cursor-not-allowed"
                    value={getYtSubtitleFontSelectValue(ytSubtitleConfig)}
                    disabled={ytSubtitleStyleDisabled}
                    on:change={(event) =>
                      updateYtSubtitleFontSelection(
                        readTextValue(event),
                      )}
                  >
                    <option value="default">{t("yt_subtitle_font_default")}</option>
                    <option value="system-sans">{t("yt_subtitle_font_system_sans")}</option>
                    <option value="system-serif">{t("yt_subtitle_font_system_serif")}</option>
                    <option value="rounded">{t("yt_subtitle_font_rounded")}</option>
                    <option value="monospace-sans">{t("yt_subtitle_font_monospace_sans")}</option>
                    <option value="monospace-serif">{t("yt_subtitle_font_monospace_serif")}</option>
                    <option value="casual">{t("yt_subtitle_font_casual")}</option>
                    <option value="cursive">{t("yt_subtitle_font_cursive")}</option>
                    <option value="small-caps">{t("yt_subtitle_font_small_caps")}</option>
                    {#if ytSubtitleFontAssets.length > 0}
                      <optgroup label={t("yt_subtitle_font_imported_select")}>
                        {#each ytSubtitleFontAssets as asset}
                          <option value={`imported:${asset.id}`}>
                            {asset.displayName}
                          </option>
                        {/each}
                      </optgroup>
                    {/if}
                  </select>

                  {#if ytSubtitleCurrentFontCapabilities?.supportsCjk === false}
                    <div class="text-[11px] text-amber-600 dark:text-amber-300">
                      {t("yt_subtitle_font_cjk_fallback_hint")}
                    </div>
                  {/if}
                </label>

                <input
                  bind:this={ytSubtitleFontInputRef}
                  type="file"
                  accept={SUBTITLE_FONT_FILE_ACCEPT}
                  class="hidden"
                  on:change={handleYtSubtitleFontFileChange}
                />

                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_font_import")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleFontAssets.length} {t("yt_subtitle_font_imported_count")}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center justify-center rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-red-400/60 dark:hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!ytSubtitleFontStoreSupported || ytSubtitleFontImporting}
                      on:click={openYtSubtitleFontPicker}
                    >
                      {ytSubtitleFontImporting
                        ? t("yt_subtitle_font_importing")
                        : t("yt_subtitle_font_import_button")}
                    </button>
                    <div class="text-[11px] text-gray-500 dark:text-white/55">
                      {t("yt_subtitle_font_import_hint")}
                    </div>
                  </div>

                  {#if ytSubtitleFontStatus}
                    <div
                      class:text-emerald-600={ytSubtitleFontStatusTone === "success"}
                      class:text-red-500={ytSubtitleFontStatusTone === "error"}
                      class="text-[11px] text-gray-500 dark:text-white/60"
                    >
                      {ytSubtitleFontStatus}
                    </div>
                  {/if}
                </div>
                <div class="space-y-2 rounded-xl border border-black/5 bg-black/[0.02] px-3 py-2 dark:border-white/8 dark:bg-white/[0.03]">
                  <div class="flex items-center justify-between gap-3">
                    <div class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_font_imported_select")}
                    </div>
                    <div class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleManagedImportedFontId
                        ? formatFileSize(
                            ytSubtitleFontAssets.find(
                              (asset) => asset.id === ytSubtitleManagedImportedFontId,
                            )?.size ?? 0,
                          )
                        : t("yt_subtitle_font_imported_empty")}
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <select
                      class="min-w-0 flex-1 rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-[12px] text-gray-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85 disabled:opacity-50 disabled:cursor-not-allowed"
                      value={ytSubtitleManagedImportedFontId}
                      disabled={ytSubtitleFontAssets.length === 0}
                      on:change={(event) =>
                        updateYtSubtitleManagedImportedFont(
                          readTextValue(event),
                        )}
                    >
                      {#if ytSubtitleFontAssets.length === 0}
                        <option value="">{t("yt_subtitle_font_imported_empty")}</option>
                      {/if}
                      {#each ytSubtitleFontAssets as asset}
                        <option value={asset.id}>
                          {asset.displayName}
                        </option>
                      {/each}
                    </select>

                    <button
                      type="button"
                      class="inline-flex shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-red-400/60 dark:hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!ytSubtitleManagedImportedFontId}
                      on:click={removeSelectedYtSubtitleFont}
                    >
                      {t("remove_tag")}
                    </button>
                  </div>
                </div>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_font_size")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.fontScale}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="220"
                    step="5"
                    value={ytSubtitleConfig.style.fontScale}
                    class="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={ytSubtitleStyleDisabled}
                    on:input={(event) =>
                      updateYtSubtitleStyle({
                        fontScale: clampNumber(
                          readInputNumber(event, ytSubtitleConfig.style.fontScale),
                          40,
                          220,
                        ),
                      })}
                  />
                </label>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_font_weight")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.fontWeight}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="900"
                    step="100"
                    value={ytSubtitleConfig.style.fontWeight}
                    class="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={ytSubtitleStyleDisabled}
                    on:input={(event) =>
                      updateYtSubtitleStyle({
                        fontWeight: clampNumber(
                          readInputNumber(event, ytSubtitleConfig.style.fontWeight),
                          100,
                          900,
                        ),
                      })}
                  />
                </label>
              </div>

              <div class="rounded-2xl border border-black/5 bg-black/[0.02] p-3 space-y-3 dark:border-white/8 dark:bg-white/[0.03]">
                <div class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/55">
                  {t("yt_subtitle_colors")}
                </div>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_text_color")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.color}
                    </span>
                  </div>
                  <div class="flex items-center gap-3">
                    <input
                      type="color"
                      value={ytSubtitleConfig.style.color}
                      class="h-9 w-14 rounded-lg border border-black/8 bg-transparent p-1 dark:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={ytSubtitleStyleDisabled}
                      on:input={(event) =>
                        updateYtSubtitleStyle({
                          color: normalizeHexColor(
                            readTextValue(event),
                            DEFAULT_SETTINGS.yt_subtitle.style.color,
                          ),
                        })}
                    />
                    <div class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.color}
                    </div>
                  </div>
                </label>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_text_opacity")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.textOpacity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={ytSubtitleConfig.style.textOpacity}
                    class="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={ytSubtitleStyleDisabled}
                    on:input={(event) =>
                      updateYtSubtitleStyle({
                        textOpacity: clampNumber(
                          readInputNumber(event, ytSubtitleConfig.style.textOpacity),
                          0,
                          100,
                        ),
                      })}
                  />
                </label>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_background_color")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.backgroundColor}
                    </span>
                  </div>
                  <div class="flex items-center gap-3">
                    <input
                      type="color"
                      value={ytSubtitleConfig.style.backgroundColor}
                      class="h-9 w-14 rounded-lg border border-black/8 bg-transparent p-1 dark:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={ytSubtitleStyleDisabled}
                      on:input={(event) =>
                        updateYtSubtitleStyle({
                          backgroundColor: normalizeHexColor(
                            readTextValue(event),
                            DEFAULT_SETTINGS.yt_subtitle.style.backgroundColor,
                          ),
                        })}
                    />
                    <div class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.backgroundColor}
                    </div>
                  </div>
                </label>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_background_opacity")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.backgroundOpacity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={ytSubtitleConfig.style.backgroundOpacity}
                    class="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={ytSubtitleStyleDisabled}
                    on:input={(event) =>
                      updateYtSubtitleStyle({
                        backgroundOpacity: clampNumber(
                          readInputNumber(event, ytSubtitleConfig.style.backgroundOpacity),
                          0,
                          100,
                        ),
                      })}
                  />
                </label>

                <label class="block space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                      {t("yt_subtitle_background_radius")}
                    </span>
                    <span class="text-[11px] text-gray-500 dark:text-white/55">
                      {ytSubtitleConfig.style.borderRadius}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={ytSubtitleConfig.style.borderRadius}
                    class="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={ytSubtitleStyleDisabled}
                    on:input={(event) =>
                      updateYtSubtitleStyle({
                        borderRadius: clampNumber(
                          readInputNumber(event, ytSubtitleConfig.style.borderRadius),
                          0,
                          20,
                        ),
                      })}
                  />
                </label>
              </div>

              <div class="rounded-2xl border border-black/5 bg-black/[0.02] p-3 space-y-3 dark:border-white/8 dark:bg-white/[0.03]">
                <div class="text-[11px] font-semibold tracking-wide text-gray-500 dark:text-white/55">
                  {t("yt_subtitle_effects")}
                </div>

                {#if ytSubtitleConfig.style.effects.length === 0}
                  <div class="space-y-3 rounded-xl border border-dashed border-black/8 bg-white/40 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div class="text-[11px] text-gray-500 dark:text-white/55">
                      {t("yt_subtitle_effect_empty")}
                    </div>
                    <button
                      type="button"
                      class="inline-flex items-center justify-center rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-red-400/60 dark:hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={ytSubtitleStyleDisabled || !canAddYtSubtitleEffect()}
                      on:click={addYtSubtitleEffect}
                    >
                      {t("yt_subtitle_add_effect")}
                    </button>
                  </div>
                {/if}

                {#each ytSubtitleConfig.style.effects as effect, effectIndex (effect.type)}
                  <div class="space-y-3 rounded-xl border border-black/8 bg-white/40 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                        {effectIndex + 1}. {t(getYtSubtitleEffectTypeNameKey(effect.type))}
                      </div>
                      <button
                        type="button"
                        class="inline-flex items-center justify-center rounded-lg border border-black/8 bg-white/80 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-red-400/60 dark:hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={ytSubtitleStyleDisabled}
                        on:click={() => removeYtSubtitleEffect(effectIndex)}
                      >
                        {t("remove_tag")}
                      </button>
                    </div>

                    <label class="block space-y-2">
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                          {t("yt_subtitle_effect_type")}
                        </span>
                      </div>
                      <select
                        class="w-full rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-[12px] text-gray-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85 disabled:opacity-50 disabled:cursor-not-allowed"
                        value={effect.type}
                        disabled={ytSubtitleStyleDisabled}
                        on:change={(event) =>
                          updateYtSubtitleEffectType(
                            effectIndex,
                            readTextValue(event),
                          )}
                      >
                        {#each getAvailableYtSubtitleEffectTypes(effectIndex) as effectType}
                          <option value={effectType}>
                            {t(getYtSubtitleEffectTypeNameKey(effectType))}
                          </option>
                        {/each}
                      </select>
                    </label>

                    <label class="block space-y-2">
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                          {t(getYtSubtitleEffectSizeLabel(effect.type))}
                        </span>
                        <span class="text-[11px] text-gray-500 dark:text-white/55">
                          {formatSliderNumber(effect.size)}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="6"
                        step="0.5"
                        value={effect.size}
                        class="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={ytSubtitleStyleDisabled}
                        on:input={(event) =>
                          updateYtSubtitleEffect(effectIndex, {
                            size: clampNumber(
                              readInputNumber(event, effect.size),
                              0,
                              6,
                            ),
                          })}
                      />
                    </label>

                    <label class="block space-y-2">
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-[11px] font-medium text-gray-700 dark:text-white/80">
                          {t(getYtSubtitleEffectStrengthLabel(effect.type))}
                        </span>
                        <span class="text-[11px] text-gray-500 dark:text-white/55">
                          {effect.strength}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={effect.strength}
                        class="w-full accent-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={ytSubtitleStyleDisabled}
                        on:input={(event) =>
                          updateYtSubtitleEffect(effectIndex, {
                            strength: clampNumber(
                              readInputNumber(event, effect.strength),
                              0,
                              100,
                            ),
                          })}
                      />
                    </label>

                    {#if effectIndex === ytSubtitleConfig.style.effects.length - 1}
                      <div class="flex justify-end">
                        <button
                          type="button"
                          class="inline-flex items-center justify-center rounded-xl border border-black/8 bg-white/80 px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:border-red-300 hover:text-red-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-red-400/60 dark:hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={ytSubtitleStyleDisabled || !canAddYtSubtitleEffect()}
                          on:click={addYtSubtitleEffect}
                        >
                          {t("yt_subtitle_add_effect")}
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}

              </div>
            </div>
          </AccordionItem>

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
          <AccordionItem
            title={t("bb_subtitle")}
            desc={t("bb_subtitle_desc")}
            iconColor="cyan"
            isOpen={bbSubtitleOpen}
            masterChecked={bbSubtitleEnabled}
            disabled={!globalEnabled}
            onToggleOpen={() => (bbSubtitleOpen = !bbSubtitleOpen)}
            onToggleMaster={() =>
              globalEnabled && (bbSubtitleEnabled = !bbSubtitleEnabled)}
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
                  d="M8 10h8M8 14h5m6 5-3.5-3.5H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v6.5a2 2 0 01-2 2H16.5L13 19z"
                />
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
                    class="absolute left-0 top-0 bottom-0 w-1/2 rounded-[10px] bg-white dark:bg-[#32363F] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] border border-black/[0.04] dark:border-white/[0.05] z-0 pointer-events-none"
                    style="transform: translateX(calc({bbSubtitleTargetMode ===
                    'all'
                      ? 0
                      : 1} * 100%)); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);"
                  ></div>

                  <!-- Mode: All -->
                  <button
                    class="relative z-10 w-[86px] flex items-center justify-center py-1.5 text-[11px] font-medium transition-colors duration-300 {bbSubtitleTargetMode ===
                    'all'
                      ? 'text-cyan-600 dark:text-cyan-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80'}"
                    disabled={!globalEnabled || !bbSubtitleEnabled}
                    on:click={() =>
                      globalEnabled &&
                      bbSubtitleEnabled &&
                      (bbSubtitleTargetMode = 'all')}
                  >
                    <span
                      class="active:scale-95 transition-transform duration-200 ease-out"
                    >
                      {t("bb_subtitle_scope_all")}
                    </span>
                  </button>

                  <!-- Mode: Allowlist -->
                  <button
                    class="relative z-10 w-[86px] flex items-center justify-center py-1.5 text-[11px] font-medium transition-colors duration-300 {bbSubtitleTargetMode ===
                    'allowlist'
                      ? 'text-cyan-600 dark:text-cyan-400'
                      : 'text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80'}"
                    disabled={!globalEnabled || !bbSubtitleEnabled}
                    on:click={() =>
                      globalEnabled &&
                      bbSubtitleEnabled &&
                      (bbSubtitleTargetMode = 'allowlist')}
                  >
                    <span
                      class="active:scale-95 transition-transform duration-200 ease-out"
                    >
                      {t("bb_subtitle_scope_allowlist")}
                    </span>
                  </button>
                </div>
              </div>

              {#if bbSubtitleTargetMode === "allowlist"}
                <div class="pt-1">
                  <div class="flex items-center justify-between mb-1.5 px-0.5 relative z-20">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[11px] text-gray-500 dark:text-white/40 font-medium tracking-wide">
                        {t("bb_subtitle_targets")}
                      </span>

                      <div class="relative flex shrink-0 items-center">
                        <button
                          type="button"
                          aria-controls="bb-subtitle-targets-tooltip"
                          aria-expanded={bbSubtitleTargetsTooltipOpen}
                          class="relative z-50 flex shrink-0 items-center justify-center w-[14px] h-[14px] rounded-full text-[10px] font-bold text-gray-400 bg-black/5 hover:bg-black/10 hover:text-gray-600 dark:text-white/40 dark:bg-white/10 dark:hover:bg-white/20 dark:hover:text-white/70 transition-colors focus:bg-cyan-500/10 focus:text-cyan-600 dark:focus:bg-cyan-500/20 dark:focus:text-cyan-300 outline-none"
                          on:click|stopPropagation={toggleBilibiliSubtitleTargetsTooltip}
                        >
                          ?
                        </button>

                        {#if bbSubtitleTargetsTooltipOpen}
                          <div
                            id="bb-subtitle-targets-tooltip"
                            role="tooltip"
                            class="absolute left-1/2 top-full mt-2 z-50 w-[220px] -translate-x-1/2 rounded-xl border border-black/5 bg-white/90 p-2.5 text-[10.5px] leading-relaxed text-gray-600 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#2A2D35]/95 dark:text-white/70"
                            in:fly|local={{ y: 6, duration: 180, opacity: 0.35, easing: quintOut }}
                            out:fade|local={{ duration: 120 }}
                          >
                            {t("bb_subtitle_targets_desc")}
                          </div>

                          <button
                            type="button"
                            class="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0 m-0"
                            aria-label={t("bb_subtitle_targets_desc")}
                            on:click={closeBilibiliSubtitleTargetsTooltip}
                          ></button>
                        {/if}
                      </div>
                    </div>
                    <span class="text-[10px] text-gray-400 dark:text-white/30 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full font-medium">
                      {bbSubtitleTargetsList.length}
                    </span>
                  </div>

                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div
                    class="w-full rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-2 min-h-[72px] flex flex-wrap gap-1.5 focus-within:ring-1 focus-within:ring-cyan-400/50 focus-within:border-cyan-400/30 transition-all cursor-text overflow-y-auto max-h-[140px] no-scrollbar {bbSubtitleTargetsList.length ===
                    0
                      ? 'items-start'
                      : 'items-center'}"
                    on:click={(event) => {
                      if (event.target === event.currentTarget) {
                        focusBilibiliSubtitleDraftInput();
                      }
                    }}
                  >
                    {#each bbSubtitleTargetsList as item}
                      <div class="flex items-center gap-1.5 bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/10 pl-2.5 pr-1 py-1 rounded-lg text-xs text-gray-700 dark:text-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)] cursor-default max-w-full flex-shrink-0 group hover:bg-white hover:border-cyan-400/30 dark:hover:bg-black/40 transition-all">
                        <span class="truncate font-mono group-hover:text-black dark:group-hover:text-white transition-colors">{item}</span>
                        <button
                          type="button"
                          class="text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/20 dark:text-white/30 dark:hover:text-rose-400 transition-colors ml-0.5 p-0.5 rounded-full inline-flex items-center justify-center h-5 w-5"
                          on:click={() => removeBilibiliSubtitleTarget(item)}
                          title={t("remove_tag")}
                        >
                          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    {/each}

                    <input
                      id="bb-subtitle-targets-input"
                      bind:this={bbSubtitleDraftInputRef}
                      class="flex-1 min-w-[96px] bg-transparent outline-none text-xs font-mono text-gray-700 dark:text-white/80 placeholder:text-gray-400/70 dark:placeholder:text-white/30 py-1 font-medium px-1"
                      placeholder={t("bb_subtitle_targets_placeholder")}
                      disabled={!globalEnabled || !bbSubtitleEnabled}
                      bind:value={bbSubtitleDraftText}
                      on:keydown={handleBilibiliSubtitleDraftKeyDown}
                      on:paste={handleBilibiliSubtitleDraftPaste}
                      on:blur={commitBilibiliSubtitleDraft}
                      spellcheck="false"
                    />
                  </div>
                  
                  <div class="flex items-center justify-between mt-2.5 px-0.5 gap-2">
                    <button
                      type="button"
                      class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1.5 text-[11px] font-medium text-cyan-700 shadow-[0_2px_8px_rgba(8,145,178,0.08)] transition-all hover:bg-cyan-500/[0.12] active:scale-[0.98] dark:border-cyan-400/18 dark:bg-cyan-500/[0.12] dark:text-cyan-300 dark:hover:bg-cyan-500/[0.18] disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!globalEnabled || !bbSubtitleEnabled || bbSubtitleAddCurrentPending}
                      on:click={addCurrentBilibiliUploaderToAllowlist}
                    >
                      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                      </svg>
                      {bbSubtitleAddCurrentPending ? t("bb_subtitle_add_current_loading") : t("bb_subtitle_add_current")}
                    </button>

                    {#if bbSubtitleAddCurrentStatus}
                      <span class={`text-[10px] font-medium px-2 py-0.5 rounded-full border truncate ${bbSubtitleAddCurrentTone === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/20' : bbSubtitleAddCurrentTone === 'error' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-400/20' : 'bg-black/5 text-gray-500 border-black/5 dark:bg-white/10 dark:text-gray-300 dark:border-white/10'}`}>
                        {bbSubtitleAddCurrentStatus}
                      </span>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </AccordionItem>

          <AccordionItem
            title={t("bb_quality")}
            desc={t("bb_quality_desc")}
            iconColor="cyan"
            isOpen={bbQualityOpen}
            masterChecked={bbQualityEnabled}
            disabled={!globalEnabled}
            onToggleOpen={() => (bbQualityOpen = !bbQualityOpen)}
            onToggleMaster={() =>
              globalEnabled && (bbQualityEnabled = !bbQualityEnabled)}
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
                  d="M4 7h16M4 12h10M4 17h7"
                />
              </svg>
            </div>
            <div slot="content" class="space-y-3 px-1">
              <div class="space-y-2 rounded-xl border border-black/5 bg-black/[0.03] px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                <div class="grid grid-cols-[auto,1fr] items-center gap-3">
                  <span class="text-[11px] font-medium text-gray-500 dark:text-white/50">
                    {t("bb_quality_default_quality")}
                  </span>
                  <select
                    class="w-full rounded-lg border border-black/8 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none transition focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/40 dark:border-white/10 dark:bg-[#2A2D35] dark:text-white/85"
                    disabled={!globalEnabled || !bbQualityEnabled}
                    bind:value={bbQualityDefaultQn}
                  >
                    {#each BILIBILI_QUALITY_OPTIONS as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </div>
              </div>

              <div class="pt-1">
                <div class="flex items-center justify-between mb-1.5 px-0.5 relative z-20">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[11px] text-gray-500 dark:text-white/40 font-medium tracking-wide">
                      {t("bb_quality_targets")}
                    </span>

                    <div class="relative flex shrink-0 items-center">
                      <button
                        type="button"
                        aria-controls="bb-quality-targets-tooltip"
                        aria-expanded={bbQualityTargetsTooltipOpen}
                        class="relative z-50 flex shrink-0 items-center justify-center w-[14px] h-[14px] rounded-full text-[10px] font-bold text-gray-400 bg-black/5 hover:bg-black/10 hover:text-gray-600 dark:text-white/40 dark:bg-white/10 dark:hover:bg-white/20 dark:hover:text-white/70 transition-colors focus:bg-cyan-500/10 focus:text-cyan-600 dark:focus:bg-cyan-500/20 dark:focus:text-cyan-300 outline-none"
                        on:click|stopPropagation={toggleBilibiliQualityTargetsTooltip}
                      >
                        ?
                      </button>

                      {#if bbQualityTargetsTooltipOpen}
                        <div
                          id="bb-quality-targets-tooltip"
                          role="tooltip"
                          class="absolute left-1/2 top-full mt-2 z-50 w-[220px] -translate-x-1/2 rounded-xl border border-black/5 bg-white/90 p-2.5 text-[10.5px] leading-relaxed text-gray-600 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#2A2D35]/95 dark:text-white/70"
                          in:fly|local={{ y: 6, duration: 180, opacity: 0.35, easing: quintOut }}
                          out:fade|local={{ duration: 120 }}
                        >
                          {t("bb_quality_targets_desc")}
                        </div>

                        <button
                          type="button"
                          class="fixed inset-0 z-40 cursor-default bg-transparent border-0 p-0 m-0"
                          aria-label={t("bb_quality_targets_desc")}
                          on:click={closeBilibiliQualityTargetsTooltip}
                        ></button>
                      {/if}
                    </div>
                  </div>
                  <span class="text-[10px] text-gray-400 dark:text-white/30 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full font-medium">
                    {bbQualityTargetsList.length}
                  </span>
                </div>

                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div
                  class="w-full rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-2 min-h-[72px] flex flex-wrap gap-1.5 focus-within:ring-1 focus-within:ring-cyan-400/50 focus-within:border-cyan-400/30 transition-all cursor-text overflow-y-auto max-h-[140px] no-scrollbar {bbQualityTargetsList.length === 0 ? 'items-start' : 'items-center'}"
                  on:click={(event) => {
                    if (event.target === event.currentTarget) {
                      focusBilibiliQualityDraftInput();
                    }
                  }}
                >
                  {#each bbQualityTargetsList as item}
                    <div class="flex items-center gap-1.5 bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/10 pl-2.5 pr-1 py-1 rounded-lg text-xs text-gray-700 dark:text-white/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)] cursor-default max-w-full flex-shrink-0 group hover:bg-white hover:border-cyan-400/30 dark:hover:bg-black/40 transition-all">
                      <span class="truncate font-mono group-hover:text-black dark:group-hover:text-white transition-colors">{item}</span>
                      <button
                        type="button"
                        class="text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/20 dark:text-white/30 dark:hover:text-rose-400 transition-colors ml-0.5 p-0.5 rounded-full inline-flex items-center justify-center h-5 w-5"
                        on:click={() => removeBilibiliQualityTarget(item)}
                        title={t("remove_tag")}
                      >
                        <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  {/each}

                  <input
                    id="bb-quality-targets-input"
                    bind:this={bbQualityDraftInputRef}
                    class="flex-1 min-w-[96px] bg-transparent outline-none text-xs font-mono text-gray-700 dark:text-white/80 placeholder:text-gray-400/70 dark:placeholder:text-white/30 py-1 font-medium px-1"
                    placeholder={t("bb_quality_targets_placeholder")}
                    disabled={!globalEnabled || !bbQualityEnabled}
                    bind:value={bbQualityDraftText}
                    on:keydown={handleBilibiliQualityDraftKeyDown}
                    on:paste={handleBilibiliQualityDraftPaste}
                    on:blur={commitBilibiliQualityDraft}
                    spellcheck="false"
                  />
                </div>

                <div class="flex items-center justify-between mt-2.5 px-0.5 gap-2">
                  <button
                    type="button"
                    class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.08] px-3 py-1.5 text-[11px] font-medium text-cyan-700 shadow-[0_2px_8px_rgba(8,145,178,0.08)] transition-all hover:bg-cyan-500/[0.12] active:scale-[0.98] dark:border-cyan-400/18 dark:bg-cyan-500/[0.12] dark:text-cyan-300 dark:hover:bg-cyan-500/[0.18] disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!globalEnabled || !bbQualityEnabled || bbQualityAddCurrentPending}
                    on:click={addCurrentBilibiliUploaderToQualityTargets}
                  >
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    {bbQualityAddCurrentPending ? t("bb_quality_add_current_loading") : t("bb_quality_add_current")}
                  </button>

                  {#if bbQualityAddCurrentStatus}
                    <span class={`text-[10px] font-medium px-2 py-0.5 rounded-full border truncate ${bbQualityAddCurrentTone === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/20' : bbQualityAddCurrentTone === 'error' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-400/20' : 'bg-black/5 text-gray-500 border-black/5 dark:bg-white/10 dark:text-gray-300 dark:border-white/10'}`}>
                      {bbQualityAddCurrentStatus}
                    </span>
                  {/if}
                </div>
              </div>

              <div class="grid grid-cols-[auto,1fr] items-center gap-3 rounded-xl border border-black/5 bg-black/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <span class="text-[11px] font-medium text-gray-500 dark:text-white/50">
                  {t("bb_quality_target")}
                </span>
                <select
                  class="w-full rounded-lg border border-black/8 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none transition focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/40 dark:border-white/10 dark:bg-[#2A2D35] dark:text-white/85"
                  disabled={!globalEnabled || !bbQualityEnabled}
                  bind:value={bbQualityTargetQn}
                >
                  {#each BILIBILI_QUALITY_OPTIONS as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
            </div>
          </AccordionItem>

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

        <!-- Centered Project Links -->
        <div class="flex items-center gap-1.5">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center w-4 h-4 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 transition-colors cursor-pointer"
            title={t("github_repo")}
            aria-label={t("github_repo")}
          >
            <svg
              class="w-3.5 h-3.5"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38
                0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
                -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07
                -.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08
                -.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04
                2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87
                3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55
                .38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
              />
            </svg>
          </a>

          <a
            href={GITHUB_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="text-[10px] text-gray-400 dark:text-white/30 font-medium tracking-wide hover:text-gray-600 dark:hover:text-white/50 transition-colors cursor-pointer"
            title={t("github_releases")}
            aria-label={t("github_releases")}
          >
            v{manifestVersion}
          </a>
        </div>

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
