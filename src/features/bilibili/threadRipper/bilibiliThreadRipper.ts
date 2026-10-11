/**
 * Bilibili thread-ripper / no-p2p — Content Script side bridge (ISOLATED world).
 *
 * The page script is loaded via manifest (world: "MAIN", run_at: "document_start"),
 * so we do not inject a <script> tag. Instead, we:
 * 1. Sync the thread-ripper / no-p2p config to localStorage
 *    (for the page script's synchronous read at startup)
 * 2. Send config updates via postMessage (for live updates without reload)
 * 3. Answer the page script's `init` handshake with the latest config
 */

import {
    BB_TR_BRIDGE_CHANNEL,
    BB_TR_CONTENT_SOURCE,
    BB_TR_LS_KEY,
    BB_TR_PAGE_SOURCE,
    DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG,
    cloneBilibiliThreadRipperPageConfig,
    type BilibiliThreadRipperPageConfig
} from './bilibiliThreadRipper.shared';

let bridgeListenerInstalled = false;
let latestConfig: BilibiliThreadRipperPageConfig = { ...DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG };

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function syncToLocalStorage(config: BilibiliThreadRipperPageConfig) {
    try {
        localStorage.setItem(BB_TR_LS_KEY, JSON.stringify({
            threadRipper: { enabled: config.threadRipper.enabled, region: config.threadRipper.region },
            noP2p: { enabled: config.noP2p.enabled }
        }));
    } catch { /* localStorage might be unavailable */ }
}

function postConfigToPage(type: 'initial' | 'change') {
    if (typeof window === 'undefined') return;
    window.postMessage({
        source: BB_TR_CONTENT_SOURCE,
        channel: BB_TR_BRIDGE_CHANNEL,
        type,
        config: cloneBilibiliThreadRipperPageConfig(latestConfig)
    }, window.location.origin);
}

function handlePageMessage(event: MessageEvent<unknown>) {
    if (event.source !== window) return;
    if (!isRecord(event.data)) return;
    const data = event.data as Record<string, unknown>;
    if (data.source !== BB_TR_PAGE_SOURCE) return;
    if (data.channel !== BB_TR_BRIDGE_CHANNEL) return;

    if (data.type === 'init') {
        postConfigToPage('initial');
    }
}

function ensureBridgeListener() {
    if (typeof window === 'undefined') return;
    if (bridgeListenerInstalled) return;
    window.addEventListener('message', handlePageMessage as EventListener);
    bridgeListenerInstalled = true;
}

export function installBilibiliThreadRipperBridge() {
    ensureBridgeListener();
}

export function uninstallBilibiliThreadRipperBridge() {
    if (typeof window === 'undefined') return;
    if (!bridgeListenerInstalled) return;
    window.removeEventListener('message', handlePageMessage as EventListener);
    bridgeListenerInstalled = false;
}

export function pushBilibiliThreadRipperPageConfig(config: BilibiliThreadRipperPageConfig) {
    latestConfig = cloneBilibiliThreadRipperPageConfig(config);
    // Sync to localStorage so page script reads it on next page load
    syncToLocalStorage(latestConfig);
    // Also send via postMessage for immediate update (without reload)
    postConfigToPage('change');
}
