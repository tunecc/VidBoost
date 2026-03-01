/**
 * Bilibili CDN Switcher — Page-level script (MAIN world).
 *
 * Runs at document_start via manifest content_scripts with world: "MAIN".
 * This ensures XHR/fetch hooks are installed BEFORE any Bilibili scripts run,
 * matching CCB's `@run-at document-start` + `unsafeWindow` approach.
 *
 * CONFIG SYNC:
 * - Reads initial config from localStorage synchronously (like CCB's GM_getValue)
 * - Also listens for postMessage from content script for live updates
 *
 * CDN REPLACEMENT:
 * - Uses CCB's broad text-based replacement for ALL responses containing bilivideo domains
 * - Deep recursive replacement for playURL API JSON responses
 * - XHR open() URL rewriting for media domain requests
 */

import {
    BB_CDN_BRIDGE_CHANNEL,
    BB_CDN_CONTENT_SOURCE,
    BB_CDN_GLOBAL_KEY,
    BB_CDN_PAGE_SOURCE,
    type BilibiliCdnPageConfig,
    type SpeedTestResult
} from './bilibiliCdn.shared';

type BridgeToPageMessage = {
    source: string;
    channel: string;
    type: 'initial' | 'change' | 'start-speed-test' | 'abort-speed-test';
    config?: BilibiliCdnPageConfig;
    nodes?: Array<{ id: string; host: string }>;
};

(() => {
    const host = window as unknown as Record<string, unknown>;
    if (host[BB_CDN_GLOBAL_KEY]) return;
    host[BB_CDN_GLOBAL_KEY] = true;

    // --- Config from localStorage (SYNCHRONOUS, like GM_getValue) ---
    const LS_KEY = '__vb_bb_cdn_config__';

    function readConfigFromStorage(): { enabled: boolean; node: string; bangumiMode: boolean } {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return { enabled: false, node: '', bangumiMode: false };
            const parsed = JSON.parse(raw);
            return {
                enabled: parsed.enabled === true,
                node: typeof parsed.node === 'string' ? parsed.node : '',
                bangumiMode: parsed.bangumiMode === true
            };
        } catch {
            return { enabled: false, node: '', bangumiMode: false };
        }
    }

    // --- State (initialized synchronously from localStorage) ---
    let { enabled, node: cdnNode, bangumiMode } = readConfigFromStorage();

    // --- Helpers ---

    const IGNORE_HOST_RE = /^(?:bvc|data|pbp|api|api\w+)\./;

    const hasMediaDomain = (s: string): boolean =>
        s.indexOf('bilivideo.') !== -1
        || s.indexOf('acgvideo.') !== -1
        || s.indexOf('edge.mountaintoys.cn') !== -1
        || s.indexOf('akamaized.net') !== -1;

    function shouldApply(): boolean {
        return enabled && cdnNode !== '';
    }

    // --- Cached replacement values (avoid repeated new URL() parsing) ---
    let _cachedReplacement = '';
    let _cachedReplacementHost = '';
    let _cachedForNode = '';

    function recomputeReplacementCache() {
        if (cdnNode === _cachedForNode) return;
        _cachedForNode = cdnNode;
        if (!cdnNode) {
            _cachedReplacement = '';
            _cachedReplacementHost = '';
            return;
        }
        let target = cdnNode;
        if (target.indexOf('://') === -1) target = 'https://' + target;
        if (!target.endsWith('/')) target = target + '/';
        _cachedReplacement = target;
        try {
            _cachedReplacementHost = new URL(target).host;
        } catch {
            _cachedReplacementHost = '';
        }
    }

    // Initialize cache
    recomputeReplacementCache();

    function getReplacement(): string {
        return _cachedReplacement;
    }

    function getReplacementHost(): string {
        return _cachedReplacementHost;
    }

    function replaceMediaUrl(s: string): string {
        if (typeof s !== 'string') return s;
        if (!shouldApply()) return s;
        if (!hasMediaDomain(s)) return s;

        try {
            const u = new URL(s.startsWith('//') ? `https:${s}` : s);
            if (IGNORE_HOST_RE.test(u.hostname)) return s;
        } catch {
            const m = s.match(/^https?:\/\/([\w.-]+)/) || s.match(/^\/\/([\w.-]+)/);
            if (m && IGNORE_HOST_RE.test(m[1])) return s;
        }

        const replacement = getReplacement();
        if (!replacement) return s;

        if (s.startsWith('http://') || s.startsWith('https://'))
            return s.replace(/^https?:\/\/.*?\//, replacement);
        if (s.startsWith('//'))
            return s.replace(/^\/\/.*?\//, replacement.replace(/^https?:/, ''));
        if (/^[^/]+\//.test(s))
            return s.replace(/^[^/]+\//, `${getReplacementHost()}/`);
        return s;
    }

    function replaceMediaHostValue(s: string): string {
        if (typeof s !== 'string') return s;
        if (!shouldApply()) return s;
        if (!hasMediaDomain(s)) return s;

        try {
            const u = new URL(s.startsWith('//') ? `https:${s}` : s);
            if (IGNORE_HOST_RE.test(u.hostname)) return s;
        } catch {
            const m = s.match(/^https?:\/\/([\w.-]+)/) || s.match(/^\/\/([\w.-]+)/);
            if (m && IGNORE_HOST_RE.test(m[1])) return s;
        }

        const replacementNoSlash = getReplacement().replace(/\/$/, '');
        if (!replacementNoSlash) return s;

        if (s.startsWith('http://') || s.startsWith('https://')) return replacementNoSlash;
        if (s.startsWith('//')) return replacementNoSlash.replace(/^https?:/, '');
        if (/^[^/]+$/.test(s)) return getReplacementHost();
        return s;
    }

    // --- Broad text-based replacement (from CCB's replaceBilivideoInText) ---

    function replaceBilivideoInText(text: string): string {
        if (!shouldApply()) return text;
        if (typeof text !== 'string') return text;
        if (!hasMediaDomain(text)) return text;

        // Replace full URLs
        let out = text.replace(
            /https?:\/\/[^"'\s]*?\.(?:(?:bilivideo|acgvideo)\.(?:com|cn)|edge\.mountaintoys\.cn|akamaized\.net)\//g,
            getReplacement()
        );

        // Replace bare host references
        const h = getReplacementHost();
        if (h) {
            out = out.replace(
                /\b[\w.-]+\.(?:(?:bilivideo|acgvideo)\.(?:com|cn)|edge\.mountaintoys\.cn|akamaized\.net)\b/g,
                h
            );
        }
        return out;
    }

    // --- Deep Recursive Replacement for JSON (from CCB) ---

    function deepReplacePlayInfo(obj: unknown): void {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const item = obj[i];
                if (typeof item === 'string') {
                    const out = hasMediaDomain(item) ? replaceMediaUrl(item) : item;
                    if (out !== item) obj[i] = out;
                } else {
                    deepReplacePlayInfo(item);
                }
            }
            return;
        }
        const record = obj as Record<string, unknown>;
        for (const k in record) {
            if (!Object.prototype.hasOwnProperty.call(record, k)) continue;
            const v = record[k];
            if (typeof v === 'string') {
                if (k === 'host') {
                    if (hasMediaDomain(v)) record[k] = replaceMediaHostValue(v);
                } else {
                    if (hasMediaDomain(v)) record[k] = replaceMediaUrl(v);
                }
            } else if (Array.isArray(v) && k === 'backup_url') {
                for (let i = 0; i < v.length; i++) {
                    const s = v[i];
                    if (typeof s === 'string') {
                        if (hasMediaDomain(s)) v[i] = replaceMediaUrl(s);
                    } else {
                        deepReplacePlayInfo(s);
                    }
                }
            } else if (typeof v === 'object') {
                deepReplacePlayInfo(v);
            }
        }
    }

    function transformPlayUrlResponse(playInfo: unknown): void {
        if (!playInfo || typeof playInfo !== 'object') return;
        const record = playInfo as Record<string, unknown>;
        if (record.code !== undefined && record.code !== 0) return;
        deepReplacePlayInfo(playInfo);
    }

    // --- Network Interception (from CCB's interceptNetResponse) ---

    // Handle responses: apply both text-based and JSON replacement
    function handleResponseText(text: string, url: string): string {
        if (!shouldApply()) return text;
        if (typeof text !== 'string') return text;

        // Always apply broad text-based replacement (like CCB)
        let result = replaceBilivideoInText(text);

        // For playURL API responses, also do deep JSON replacement
        const PLAYURL_PATHS = [
            '/x/player/wbi/playurl',
            '/x/player/playurl',
            '/pgc/player/web/playurl',
            '/pgc/player/web/v2/playurl',
            '/pgc/player/api/playurl',
            '/pugv/player/web/playurl',
            '/ogv/player/playview',
        ];
        if (PLAYURL_PATHS.some(p => url.includes(p))) {
            try {
                const obj = JSON.parse(result);
                transformPlayUrlResponse(obj);
                result = JSON.stringify(obj);
            } catch { /* not JSON, text replacement already applied */ }
        }

        return result;
    }

    // Hook XMLHttpRequest (matching CCB's pattern)
    const OriginalXHR = window.XMLHttpRequest;

    class PatchedXHR extends OriginalXHR {
        private _vbUrl = '';
        private _vbCached: string | null = null;  // Cache replaced text
        private _vbCacheKey = '';  // responseURL at time of caching

        open(...args: unknown[]): void {
            const url = args[1];
            if (typeof url === 'string') {
                this._vbUrl = url;
                this._vbCached = null;  // Reset cache on new request
                this._vbCacheKey = '';
                try {
                    args[1] = replaceMediaUrl(url);
                } catch { /* ignore */ }
            }
            return (super.open as unknown as (...a: unknown[]) => void).apply(this, args);
        }

        private _getCachedResponse(): string | null {
            if (this.readyState !== this.DONE) return null;
            if (!shouldApply()) return null;
            const original = super.responseText;
            if (!original) return null;

            // Return cache if URL hasn't changed
            const cacheKey = this.responseURL || this._vbUrl;
            if (this._vbCached !== null && this._vbCacheKey === cacheKey) {
                return this._vbCached;
            }

            try {
                const replaced = handleResponseText(original, cacheKey);
                if (replaced !== original) {
                    this._vbCached = replaced;
                    this._vbCacheKey = cacheKey;
                    return replaced;
                }
            } catch { /* ignore */ }
            return null;
        }

        get responseText(): string {
            if (this.readyState !== this.DONE) return super.responseText;
            return this._getCachedResponse() ?? super.responseText;
        }

        get response(): unknown {
            if (this.readyState !== this.DONE) return super.response;
            if (typeof super.response === 'string') {
                return this._getCachedResponse() ?? super.response;
            }
            return super.response;
        }
    }

    window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest;

    // Hook fetch (matching CCB's pattern)
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));

        // Replace media URLs in the request
        if (typeof input === 'string') {
            const replaced = replaceMediaUrl(input);
            if (replaced !== input) input = replaced;
        }

        // Resolve URL for response interception check
        let resolvedUrl = url;
        try { resolvedUrl = new URL(url, window.location.href).href; } catch { /* ignore */ }

        const response = await originalFetch(input, init);

        // Check if response likely contains bilivideo URLs (intercept broadly like CCB)
        if (shouldApply()) {
            const contentType = response.headers.get('content-type') || '';
            // Only intercept text/json responses, not binary media streams
            if (contentType.includes('json') || contentType.includes('text')
                || resolvedUrl.includes('playurl') || resolvedUrl.includes('play_url')) {
                try {
                    // Clone first — read clone's text to check; if no match, return original untouched
                    const cloned = response.clone();
                    const originalText = await cloned.text();
                    if (hasMediaDomain(originalText)) {
                        // Consume original and return modified
                        const modifiedText = handleResponseText(originalText, resolvedUrl);
                        return new Response(modifiedText, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers
                        });
                    }
                    // No media domains found — return original response untouched
                    return response;
                } catch {
                    return response;
                }
            }
        }
        return response;
    };

    // --- Worker/Blob Injection for Bangumi (from CCB) ---
    // Bangumi uses Web Workers for video segment requests.
    // Without hooking Workers, CDN switching won't apply to bangumi video streams.

    function shouldInstallWorkerHooks(): boolean {
        if (!shouldApply()) return false;
        if (!bangumiMode) return false;
        const p = location.pathname || '/';
        return p.startsWith('/bangumi/play/')
            || p.startsWith('/video/')
            || p.startsWith('/cheese/play/');
    }

    // Build a small self-contained CDN replacement runtime to inject into Workers
    function buildWorkerPrelude(): string {
        const cfg = JSON.stringify({
            forceReplace: shouldApply(),
            replacement: getReplacement(),
            replacementHost: getReplacementHost()
        });
        // Minified worker runtime: hooks XHR.open to replace media URLs
        return `(() => {
  if (self.__VB_WK__) return;
  self.__VB_WK__ = true;
  try {
    const c = ${cfg};
    if (!c.forceReplace || !c.replacement) return;
    const IGN = /^(?:bvc|data|pbp|api|api\\w+)\\./;
    const has = s => typeof s === 'string' && (s.indexOf('bilivideo.') !== -1 || s.indexOf('acgvideo.') !== -1 || s.indexOf('akamaized.net') !== -1);
    const rep = s => {
      if (typeof s !== 'string' || !has(s)) return s;
      try { if (IGN.test(new URL(s.startsWith('//') ? 'https:'+s : s).hostname)) return s; } catch {}
      if (s.startsWith('http://') || s.startsWith('https://')) return s.replace(/^https?:\\/\\/.*?\\//, c.replacement);
      if (s.startsWith('//')) return s.replace(/^\\/\\/.*?\\//, c.replacement.replace(/^https?:/, ''));
      return s;
    };
    const OX = self.XMLHttpRequest;
    if (OX) {
      class X extends OX {
        open(...a) { try { if (typeof a[1] === 'string') a[1] = rep(a[1]); } catch {} return super.open(...a); }
      }
      self.XMLHttpRequest = X;
    }
    if (self.fetch) {
      const OF = self.fetch;
      self.fetch = (i, o) => {
        if (typeof i === 'string') { const r = rep(i); if (r !== i) i = r; }
        return OF(i, o);
      };
    }
  } catch {}
})();\n`;
    }

    // Hook Blob constructor to inject worker runtime into JS blobs
    const win = window as unknown as Record<string, unknown>;
    try {
        const OrigBlob = window.Blob;
        const PatchedBlobCtor = function (this: Blob, parts?: BlobPart[], options?: BlobPropertyBag): Blob {
            if (shouldInstallWorkerHooks() && parts && options) {
                const type = options.type ? String(options.type) : '';
                const looksJs = /javascript/i.test(type)
                    || (Array.isArray(parts) && parts.some(
                        p => typeof p === 'string' && /importScripts|WorkerGlobalScope|bili/i.test(p)
                    ));
                if (looksJs) {
                    const injected = [buildWorkerPrelude(), ...(Array.isArray(parts) ? parts : [parts])];
                    return new OrigBlob(injected, options);
                }
            }
            return new OrigBlob(parts ?? [], options);
        } as unknown as typeof Blob;
        PatchedBlobCtor.prototype = OrigBlob.prototype;
        window.Blob = PatchedBlobCtor;
    } catch { /* ignore */ }

    // Hook Worker constructor to wrap worker scripts
    try {
        const OrigWorker = window.Worker;
        window.Worker = function (this: Worker, scriptURL: string | URL, options?: WorkerOptions): Worker {
            try {
                if (!shouldInstallWorkerHooks()) return new OrigWorker(scriptURL, options);
                const raw = typeof scriptURL === 'string' ? scriptURL : String(scriptURL);
                if (raw.startsWith('blob:') || raw.startsWith('data:')) return new OrigWorker(scriptURL, options);
                const isModule = options?.type === 'module';
                const wrapperCode = isModule
                    ? `${buildWorkerPrelude()}\nimport ${JSON.stringify(raw)};\n`
                    : `${buildWorkerPrelude()}\nimportScripts(${JSON.stringify(raw)});\n`;
                const blob = new Blob([wrapperCode], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                return new OrigWorker(url, options);
            } catch {
                return new OrigWorker(scriptURL, options);
            }
        } as unknown as typeof Worker;
        (window.Worker as unknown as Record<string, unknown>).prototype = OrigWorker.prototype;
    } catch { /* ignore */ }

    // --- Global Variable Hooks (from CCB) ---

    function watchGlobal(name: string, handler: (obj: unknown) => void) {
        try {
            const win = window as unknown as Record<string, unknown>;
            if (win[name] && typeof win[name] === 'object') handler(win[name]);
            let internal = win[name];
            Object.defineProperty(win, name, {
                configurable: true,
                get: () => internal,
                set: (v: unknown) => {
                    internal = v;
                    if (v && typeof v === 'object') handler(v);
                }
            });
        } catch { /* ignore */ }
    }

    watchGlobal('__playinfo__', (obj) => {
        if (!shouldApply()) return;
        try { transformPlayUrlResponse(obj); } catch { /* ignore */ }
    });

    watchGlobal('__INITIAL_STATE__', (obj) => {
        if (!shouldApply()) return;
        try { transformPlayUrlResponse(obj); } catch { /* ignore */ }
    });

    // --- CDN Speed Test (adapted from PiliPlus) ---

    let speedTestAbortController: AbortController | null = null;

    function postSpeedResult(result: SpeedTestResult) {
        window.postMessage({
            source: BB_CDN_PAGE_SOURCE,
            channel: BB_CDN_BRIDGE_CHANNEL,
            type: 'speed-test-result',
            result
        }, window.location.origin);
    }

    function postSpeedDone() {
        window.postMessage({
            source: BB_CDN_PAGE_SOURCE,
            channel: BB_CDN_BRIDGE_CHANNEL,
            type: 'speed-test-done'
        }, window.location.origin);
    }

    async function getSampleVideoUrl(): Promise<string> {
        const apiUrl = 'https://api.bilibili.com/x/player/wbi/playurl?bvid=BV1fK4y1t7hj&cid=196018899&qn=32&fnval=16';
        const resp = await originalFetch(apiUrl, {
            credentials: 'include',
            headers: { 'Referer': 'https://www.bilibili.com' }
        });
        const data = await resp.json();
        const dash = data?.data?.dash;
        if (dash?.video?.length) return dash.video[0].baseUrl || dash.video[0].base_url || '';
        const durl = data?.data?.durl;
        if (durl?.length) return durl[0].url || '';
        throw new Error('无法获取视频流');
    }

    function replaceUrlHost(url: string, newHost: string): string {
        try {
            const u = new URL(url);
            u.host = newHost;
            return u.toString();
        } catch {
            return url.replace(/^(https?:\/\/)[^/]+/, `$1${newHost}`);
        }
    }

    async function runSpeedTest(nodes: Array<{ id: string; host: string }>) {
        if (speedTestAbortController) speedTestAbortController.abort();
        speedTestAbortController = new AbortController();
        const signal = speedTestAbortController.signal;

        let sampleUrl: string;
        try {
            sampleUrl = await getSampleVideoUrl();
        } catch {
            for (const node of nodes) {
                postSpeedResult({ nodeId: node.id, speed: '获取失败', error: true });
            }
            postSpeedDone();
            return;
        }

        const MAX_BYTES = 8 * 1024 * 1024;
        const TIMEOUT_MS = 10000;

        for (const node of nodes) {
            if (signal.aborted) break;
            const testUrl = replaceUrlHost(sampleUrl, node.host);
            try {
                const start = performance.now();
                const resp = await originalFetch(testUrl, {
                    signal,
                    headers: { 'Referer': 'https://www.bilibili.com', 'Range': `bytes=0-${MAX_BYTES - 1}` }
                });
                if (!resp.ok && resp.status !== 206) {
                    postSpeedResult({ nodeId: node.id, speed: `HTTP ${resp.status}`, error: true });
                    continue;
                }
                const reader = resp.body?.getReader();
                if (!reader) {
                    postSpeedResult({ nodeId: node.id, speed: '不支持', error: true });
                    continue;
                }
                let downloaded = 0;
                const deadline = start + TIMEOUT_MS;
                while (true) {
                    if (signal.aborted || performance.now() > deadline) break;
                    const { done, value } = await reader.read();
                    if (done) break;
                    downloaded += value.byteLength;
                    if (downloaded >= MAX_BYTES) break;
                }
                reader.cancel().catch(() => { });
                const elapsed = (performance.now() - start) / 1000;
                if (downloaded > 0 && elapsed > 0) {
                    postSpeedResult({ nodeId: node.id, speed: ((downloaded / (1024 * 1024)) / elapsed).toFixed(1), error: false });
                } else {
                    postSpeedResult({ nodeId: node.id, speed: '超时', error: true });
                }
            } catch (err) {
                if (signal.aborted) break;
                postSpeedResult({ nodeId: node.id, speed: '连接失败', error: true });
            }
        }
        postSpeedDone();
    }

    // --- Bridge Communication ---

    function updateConfig(next: unknown) {
        const record = (next && typeof next === 'object') ? next as Record<string, unknown> : {};
        enabled = record.enabled === true;
        cdnNode = typeof record.node === 'string' ? record.node : '';
        bangumiMode = record.bangumiMode === true;
        recomputeReplacementCache();
    }

    function isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object';
    }

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (event.source !== window) return;
        if (!isRecord(event.data)) return;
        const data = event.data as BridgeToPageMessage;
        if (data.source !== BB_CDN_CONTENT_SOURCE) return;
        if (data.channel !== BB_CDN_BRIDGE_CHANNEL) return;

        if (data.type === 'initial' || data.type === 'change') {
            updateConfig(data.config);
        } else if (data.type === 'start-speed-test' && Array.isArray(data.nodes)) {
            runSpeedTest(data.nodes);
        } else if (data.type === 'abort-speed-test') {
            if (speedTestAbortController) speedTestAbortController.abort();
            postSpeedDone();
        }
    });

    // Signal ready
    window.postMessage({
        source: BB_CDN_PAGE_SOURCE,
        channel: BB_CDN_BRIDGE_CHANNEL,
        type: 'init'
    }, window.location.origin);
})();
