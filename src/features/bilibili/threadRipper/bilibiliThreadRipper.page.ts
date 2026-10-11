/**
 * Bilibili thread-ripper / no-p2p — Page-level script (MAIN world).
 *
 * Runs at document_start via manifest content_scripts with world: "MAIN",
 * immediately after bb-cdn.page.js (manifest order). Bootstrap ported from
 * Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka),
 * src/index.ts + src/modules/thread-ripper.ts:
 * - capture the page's `fetch` first (nativeFetch), then start the player
 *   request interceptor, register the enabled phases and replace
 *   `window.fetch` / `window.XMLHttpRequest` last.
 *
 * CONFIG SYNC:
 * - Reads initial config from localStorage synchronously (like CCB's GM_getValue)
 * - Listens for postMessage from the content script for live updates
 *
 * LAZY ACTIVATION:
 * - While both features are disabled nothing is hooked and no phase is
 *   registered, so a bb-cdn-only setup keeps its own `window.__playinfo__`
 *   trap untouched and the page stays native.
 * - Once registered, phases stay registered; the module flags gate the
 *   serve/policy callbacks (disabled: serve returns null, policy passes
 *   candidates through) so hot switching never re-hooks anything.
 * - Live pages (live.bilibili.com) are never taken over.
 */

import {
    BB_TR_BRIDGE_CHANNEL,
    BB_TR_CONTENT_SOURCE,
    BB_TR_GLOBAL_KEY,
    BB_TR_LS_KEY,
    BB_TR_PAGE_SOURCE,
    DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG,
    cloneBilibiliThreadRipperPageConfig,
    sanitizeBilibiliThreadRipperPageConfig,
    type BilibiliThreadRipperPageConfig
} from './bilibiliThreadRipper.shared';
import { createThreadRipper } from './engine';
import { setRegionPreference } from './player/candidates';
import { installNoP2p } from './noP2pMocks';
import { noP2PPolicy } from './noP2pPolicy';
import { initPlayerInterceptor, player } from './player/interceptorIndex';
import { PatchedXMLHttpRequest, xhrHooks } from './interceptor/xhrOverride';
import { disguiseAsNative } from './interceptor/fakeNativeFunction';
import { logger } from './logger';
import type { FetchArgs, MakeBilibiliGreatThanEverBeforeHook, OnBeforeFetchHook } from './types';

type BridgeToPageMessage = {
    source: string;
    channel: string;
    type: 'initial' | 'change';
    config?: Partial<BilibiliThreadRipperPageConfig>;
};

type OnResponseHook = (
    response: Response,
    fetchArgs: FetchArgs,
    $fetch: typeof fetch
) => Response | Promise<Response>;

(() => {
    const host = window as unknown as Record<string, unknown>;
    if (host[BB_TR_GLOBAL_KEY]) return;
    host[BB_TR_GLOBAL_KEY] = true;

    const LIVE_HOST = 'live.bilibili.com';

    function isLiveContext(): boolean {
        return location.host === LIVE_HOST;
    }

    /**
     * Captured before anything else touches `fetch` (upstream src/index.ts).
     * This script runs after bb-cdn.page.js, so when that feature is on this
     * captures bb-cdn's wrapper (the two features are meant to be mutually
     * exclusive, so bb-cdn is passthrough when disabled); otherwise it is the
     * page's native fetch.
     */
    const nativeFetch: typeof fetch = window.fetch.bind(window);

    // --- Config from localStorage (SYNCHRONOUS, like GM_getValue) ---

    function readConfigFromStorage(): BilibiliThreadRipperPageConfig {
        try {
            const raw = localStorage.getItem(BB_TR_LS_KEY);
            if (!raw) return cloneBilibiliThreadRipperPageConfig(DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG);
            return sanitizeBilibiliThreadRipperPageConfig(
                JSON.parse(raw) as Partial<BilibiliThreadRipperPageConfig>
            );
        } catch {
            return cloneBilibiliThreadRipperPageConfig(DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG);
        }
    }

    // --- State (flags initialized synchronously from localStorage below) ---

    let trEnabled = false;
    let noP2pEnabled = false;

    /** Upstream keeps these at the bootstrap's top level; the hook sets are filled
     * through `hook.on*` before `installTakeover()` swaps `fetch` in */
    const onBeforeFetchHooks = new Set<OnBeforeFetchHook>();
    const onResponseHooks = new Set<OnResponseHook>();
    const stylesCollector: string[] = [];

    /** The upstream hook object, created lazily on first enable (null = not taken over) */
    let hook: MakeBilibiliGreatThanEverBeforeHook | null = null;
    let noP2pPhaseRegistered = false;
    let servePhaseRegistered = false;

    function assembleHook(): MakeBilibiliGreatThanEverBeforeHook {
        const fnWs = new WeakSet<() => void>();
        return {
            addStyle(css: string) {
                // No ported module ships styles yet; kept for hook parity with upstream
                stylesCollector.push(css);
            },
            onBeforeFetch(cb) {
                onBeforeFetchHooks.add(cb);
            },
            onResponse(cb) {
                onResponseHooks.add(cb);
            },
            onXhrOpen(cb) {
                xhrHooks.open.add(cb);
            },
            onAfterXhrOpen(cb) {
                xhrHooks.afterOpen.add(cb);
            },
            onXhrResponse(cb) {
                xhrHooks.response.add(cb);
            },
            onXhrSend(cb) {
                xhrHooks.send.add(cb);
            },
            onlyCallOnce(fn) {
                if (fnWs.has(fn)) return;
                fnWs.add(fn);
                fn();
            },
            nativeFetch,
            player
        };
    }

    /**
     * no-p2p policy phase: registered once, gated by the live flag at the
     * callback entry. `installNoP2p` also stubs the three P2P SDK globals once —
     * they are non-configurable, so the call must never be repeated; the
     * flag-gated filter is passed straight through so exactly one policy
     * phase ever exists.
     */
    function ensureNoP2pPhase(h: MakeBilibiliGreatThanEverBeforeHook): void {
        if (noP2pPhaseRegistered) return;
        noP2pPhaseRegistered = true;
        installNoP2p(
            h,
            (candidates) => (noP2pEnabled ? noP2PPolicy(candidates) : candidates.slice())
        );
    }

    /**
     * thread-ripper serve phase: registered once like upstream
     * src/modules/thread-ripper.ts, gated by the live flag at the callback
     * entry. `createThreadRipper` exposes no stop/destroy API, so switching it
     * off relies on this gate alone; in-flight jobs finish on their own.
     */
    function ensureServePhase(h: MakeBilibiliGreatThanEverBeforeHook): void {
        if (servePhaseRegistered) return;
        servePhaseRegistered = true;
        const inner = createThreadRipper(h.player, nativeFetch);
        h.player.registerPhase({
            type: 'serve',
            name: 'thread-ripper',
            serve: (request) => (trEnabled ? inner.serve(request) : null)
        });
    }

    /**
     * Replace `fetch` and `XMLHttpRequest` (upstream src/index.ts tail, verbatim
     * order: fetch pipeline first, then the patched XHR). `nativeFetch` was
     * captured before this runs, whatever the page wrapped by now.
     */
    function installTakeover(): void {
        (($fetch: typeof fetch) => {
            window.fetch = async function (this: unknown, ...fetchArgs: FetchArgs): Promise<Response> {
                /** Each hook gets the arguments the previous one returned */
                let currentFetchArgs: FetchArgs = fetchArgs;
                let mockResponse: Response | null = null;
                let abortFetch = false;
                for (const onBeforeFetch of onBeforeFetchHooks) {
                    try {
                        const result = onBeforeFetch(currentFetchArgs);
                        if (result === null) {
                            abortFetch = true;
                            break;
                        }
                        if ('body' in result) {
                            abortFetch = true;
                            mockResponse = result;
                            break;
                        }
                        currentFetchArgs = result;
                    } catch (e) {
                        logger.error('Failed to replace fetcherArgs', e, { fetchArgs });
                    }
                }

                if (abortFetch) {
                    return mockResponse ?? new Response();
                }

                let response = await Reflect.apply($fetch, this, currentFetchArgs);
                for (const onResponse of onResponseHooks) {
                    response = await onResponse(response, currentFetchArgs, $fetch);
                }
                return response;
            };
            // Polyfills and feature detection test fetch for `[native code]`
            disguiseAsNative(window.fetch, $fetch);
        })(nativeFetch);

        window.XMLHttpRequest = PatchedXMLHttpRequest as unknown as typeof XMLHttpRequest;
    }

    /** Apply a config (initial or change): flags first, then lazy bootstrap */
    function applyConfig(next: unknown): void {
        const config = sanitizeBilibiliThreadRipperPageConfig(
            next as Partial<BilibiliThreadRipperPageConfig>
        );
        trEnabled = config.threadRipper.enabled;
        noP2pEnabled = config.noP2p.enabled;
        setRegionPreference(config.threadRipper.region);

        // Live pages are never taken over (upstream thread-ripper.ts skips live:
        // live streams are not DASH segments)
        if (isLiveContext()) return;

        if (hook === null) {
            // First enable of either feature: run the full bootstrap once
            if (!trEnabled && !noP2pEnabled) return;
            hook = assembleHook();
            // Always on once any phase needs it: no-p2p and thread-ripper are its phases
            initPlayerInterceptor(hook);
            if (noP2pEnabled) ensureNoP2pPhase(hook);
            if (trEnabled) ensureServePhase(hook);
            installTakeover();
            return;
        }

        // Already bootstrapped: lazily register any phase enabled for the first time
        if (noP2pEnabled) ensureNoP2pPhase(hook);
        if (trEnabled) ensureServePhase(hook);
    }

    // Initialize the flags synchronously, bootstrapping right away when enabled
    applyConfig(readConfigFromStorage());

    // --- Bridge Communication ---

    function isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object';
    }

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (event.source !== window) return;
        if (!isRecord(event.data)) return;
        const data = event.data as BridgeToPageMessage;
        if (data.source !== BB_TR_CONTENT_SOURCE) return;
        if (data.channel !== BB_TR_BRIDGE_CHANNEL) return;

        if (data.type === 'initial' || data.type === 'change') {
            applyConfig(data.config);
        }
    });

    // Signal ready — the content script answers with `initial`
    window.postMessage({
        source: BB_TR_PAGE_SOURCE,
        channel: BB_TR_BRIDGE_CHANNEL,
        type: 'init'
    }, window.location.origin);
})();
