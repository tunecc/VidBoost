/**
 * Bilibili CDN Switcher — Content Script side bridge.
 *
 * Since the page script is now loaded via manifest (world: "MAIN", run_at: "document_start"),
 * we no longer need to inject a <script> tag. Instead, we:
 * 1. Sync CDN config to localStorage (for the page script's synchronous read at startup)
 * 2. Send config updates via postMessage (for live updates without reload)
 * 3. Relay speed test commands and results
 */

import {
    DEFAULT_BB_CDN_PAGE_CONFIG,
    BB_CDN_BRIDGE_CHANNEL,
    BB_CDN_CONTENT_SOURCE,
    BB_CDN_PAGE_SOURCE,
    cloneBilibiliCdnPageConfig,
    type BilibiliCdnPageConfig,
    type SpeedTestResult
} from './bilibiliCdn.shared';

const LS_KEY = '__vb_bb_cdn_config__';
let bridgeListenerInstalled = false;
let latestConfig: BilibiliCdnPageConfig = { ...DEFAULT_BB_CDN_PAGE_CONFIG };

// Callbacks for speed test results
let onSpeedTestResult: ((result: SpeedTestResult) => void) | null = null;
let onSpeedTestDone: (() => void) | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function syncToLocalStorage(config: BilibiliCdnPageConfig) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            enabled: config.enabled,
            node: config.node,
            bangumiMode: config.bangumiMode
        }));
    } catch { /* localStorage might be unavailable */ }
}

function postConfigToPage(type: 'initial' | 'change') {
    if (typeof window === 'undefined') return;
    window.postMessage({
        source: BB_CDN_CONTENT_SOURCE,
        channel: BB_CDN_BRIDGE_CHANNEL,
        type,
        config: cloneBilibiliCdnPageConfig(latestConfig)
    }, window.location.origin);
}

function handlePageMessage(event: MessageEvent<unknown>) {
    if (event.source !== window) return;
    if (!isRecord(event.data)) return;
    const data = event.data as Record<string, unknown>;
    if (data.source !== BB_CDN_PAGE_SOURCE) return;
    if (data.channel !== BB_CDN_BRIDGE_CHANNEL) return;

    if (data.type === 'init') {
        postConfigToPage('initial');
    } else if (data.type === 'speed-test-result' && isRecord(data.result)) {
        onSpeedTestResult?.(data.result as unknown as SpeedTestResult);
    } else if (data.type === 'speed-test-done') {
        onSpeedTestDone?.();
    }
}

export function abortSpeedTest() {
    if (typeof window === 'undefined') return;
    window.postMessage({
        source: BB_CDN_CONTENT_SOURCE,
        channel: BB_CDN_BRIDGE_CHANNEL,
        type: 'abort-speed-test'
    }, window.location.origin);
}

function ensureBridgeListener() {
    if (typeof window === 'undefined') return;
    if (bridgeListenerInstalled) return;
    window.addEventListener('message', handlePageMessage as EventListener);
    bridgeListenerInstalled = true;
}

export function installBilibiliCdnBridge() {
    // No more <script> injection needed — manifest handles MAIN world script loading.
    // We only install the postMessage bridge listener.
    ensureBridgeListener();
}

export function pushBilibiliCdnConfig(config: BilibiliCdnPageConfig) {
    latestConfig = cloneBilibiliCdnPageConfig(config);
    // Sync to localStorage so page script reads it on next page load
    syncToLocalStorage(latestConfig);
    // Also send via postMessage for immediate update (without reload)
    postConfigToPage('change');
}

export function startSpeedTest(
    nodes: Array<{ id: string; host: string }>,
    onResult: (result: SpeedTestResult) => void,
    onDone: () => void
) {
    onSpeedTestResult = onResult;
    onSpeedTestDone = onDone;

    if (typeof window === 'undefined') return;
    window.postMessage({
        source: BB_CDN_CONTENT_SOURCE,
        channel: BB_CDN_BRIDGE_CHANNEL,
        type: 'start-speed-test',
        nodes
    }, window.location.origin);
}
