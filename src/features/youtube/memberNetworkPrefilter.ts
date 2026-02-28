import type { YTMemberBlockMode } from '../../lib/settings';

type MemberNetworkPrefilterConfig = {
    enabled: boolean;
    mode: YTMemberBlockMode;
    blocklist: string[];
    allowlist: string[];
};

const INJECTED_SCRIPT_ID = 'vb-yt-member-network-prefilter';
const CONFIG_EVENT_NAME = 'vb:yt-member-prefilter-config';
const GLOBAL_KEY = '__VB_YT_MEMBER_PREFILTER__';

function injectedMemberNetworkPrefilterMain(configEventName: string, globalKey: string) {
    const host = window as unknown as Record<string, unknown>;
    if (host[globalKey]) return;
    host[globalKey] = true;

    const URL_RE = /\/youtubei\/v1\/(?:browse|search|next)(?:[/?]|$)/;
    const TEXT_MARKERS = ['members only', 'members first'];
    const STYLE_MARKERS = ['badge_style_type_members_only', 'badge_style_type_membership'];
    const CLASS_MARKERS = ['yt-badge-shape--membership', 'badge-style-type-members-only', 'badge-style-type-membership'];
    const RENDERER_KEYS = [
        'videoRenderer',
        'compactVideoRenderer',
        'gridVideoRenderer',
        'playlistVideoRenderer',
        'reelItemRenderer',
        'videoWithContextRenderer',
        'ytmVideoWithContextRenderer',
        'lockupViewModel'
    ];

    const xhrUrlKey = Symbol('vbYtMemberUrl');
    const xhrOnloadKey = Symbol('vbYtMemberOnload');

    let enabled = false;
    let mode: YTMemberBlockMode = 'all';
    let blocklist = new Set<string>();
    let allowlist = new Set<string>();

    function normalizeList(input: unknown): Set<string> {
        const out = new Set<string>();
        if (!Array.isArray(input)) return out;
        for (const raw of input) {
            if (typeof raw !== 'string') continue;
            const normalized = normalizeEntry(raw);
            if (normalized) out.add(normalized);
        }
        return out;
    }

    function normalizeEntry(entry: string): string | null {
        const trimmed = entry.trim().toLowerCase();
        if (!trimmed) return null;
        if (trimmed.startsWith('@')) return trimmed;
        if (/^uc[a-z0-9_-]+$/i.test(trimmed)) return trimmed;
        return `@${trimmed}`;
    }

    function isMode(value: unknown): value is YTMemberBlockMode {
        return value === 'all' || value === 'blocklist' || value === 'allowlist';
    }

    function updateConfig(next: unknown) {
        const record = (next && typeof next === 'object') ? next as Record<string, unknown> : {};
        enabled = record.enabled === true;
        mode = isMode(record.mode) ? record.mode : 'all';
        blocklist = normalizeList(record.blocklist);
        allowlist = normalizeList(record.allowlist);
    }

    window.addEventListener(configEventName, ((event: Event) => {
        const custom = event as CustomEvent<unknown>;
        updateConfig(custom.detail);
    }) as EventListener);

    function getUrl(input: unknown): string {
        if (typeof input === 'string') return input;
        if (input && typeof input === 'object' && 'url' in input) {
            const value = (input as Record<string, unknown>).url;
            return typeof value === 'string' ? value : '';
        }
        return '';
    }

    function shouldInspectRequest(url: string): boolean {
        return enabled && URL_RE.test(url);
    }

    function parseJsonPayload(text: string): { data: unknown; prefix: string } | null {
        const prefixMatch = text.match(/^(\)\]\}'\n?)/);
        const prefix = prefixMatch ? prefixMatch[1] : '';
        const payload = prefix ? text.slice(prefix.length) : text;
        if (!payload) return null;
        try {
            return { data: JSON.parse(payload), prefix };
        } catch {
            return null;
        }
    }

    function parseChannelFromText(input: string): string | null {
        const handleMatch = input.match(/(?:https?:\/\/(?:www\.|m\.)?youtube\.com)?\/@([^/?&#]+)/i);
        if (handleMatch) return `@${handleMatch[1].toLowerCase()}`;
        const channelMatch = input.match(/(?:https?:\/\/(?:www\.|m\.)?youtube\.com)?\/channel\/(UC[^/?&#]+)/i);
        if (channelMatch) return channelMatch[1].toLowerCase();
        return null;
    }

    function extractChannelKey(renderer: unknown): string | null {
        const stack: unknown[] = [renderer];
        let visited = 0;
        while (stack.length > 0 && visited < 220) {
            const current = stack.pop();
            visited += 1;

            if (!current || typeof current !== 'object') continue;
            if (Array.isArray(current)) {
                for (let i = 0; i < current.length; i += 1) stack.push(current[i]);
                continue;
            }

            const record = current as Record<string, unknown>;
            const browseEndpoint = record.browseEndpoint;
            if (browseEndpoint && typeof browseEndpoint === 'object') {
                const endpoint = browseEndpoint as Record<string, unknown>;
                const canonical = typeof endpoint.canonicalBaseUrl === 'string' ? endpoint.canonicalBaseUrl : '';
                const fromCanonical = parseChannelFromText(canonical);
                if (fromCanonical) return fromCanonical;

                const browseId = typeof endpoint.browseId === 'string' ? endpoint.browseId : '';
                if (/^uc[a-z0-9_-]+$/i.test(browseId)) return browseId.toLowerCase();
            }

            for (const key of Object.keys(record)) {
                const value = record[key];
                if (typeof value === 'string') {
                    const channel = parseChannelFromText(value);
                    if (channel) return channel;
                    continue;
                }
                if (value && typeof value === 'object') stack.push(value);
            }
        }
        return null;
    }

    function isMembersOnlyRenderer(renderer: unknown): boolean {
        const stack: unknown[] = [renderer];
        let visited = 0;
        while (stack.length > 0 && visited < 240) {
            const current = stack.pop();
            visited += 1;
            if (current == null) continue;

            if (typeof current === 'string') {
                const lower = current.toLowerCase();
                if (TEXT_MARKERS.some((marker) => lower.includes(marker))) return true;
                if (STYLE_MARKERS.some((marker) => lower.includes(marker))) return true;
                if (CLASS_MARKERS.some((marker) => lower.includes(marker))) return true;
                continue;
            }

            if (typeof current !== 'object') continue;
            if (Array.isArray(current)) {
                for (let i = 0; i < current.length; i += 1) stack.push(current[i]);
                continue;
            }

            const record = current as Record<string, unknown>;
            for (const key of Object.keys(record)) {
                const value = record[key];
                if (typeof value === 'string') {
                    const lower = value.toLowerCase();
                    if (STYLE_MARKERS.some((marker) => lower.includes(marker))) return true;
                    if (
                        (key === 'label' || key === 'text' || key === 'simpleText' || key === 'title' || key === 'accessibilityLabel')
                        && TEXT_MARKERS.some((marker) => lower.includes(marker))
                    ) {
                        return true;
                    }
                    continue;
                }
                if (value && typeof value === 'object') stack.push(value);
            }
        }
        return false;
    }

    function unwrapRendererCandidate(item: unknown): Record<string, unknown> | null {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;

        const richItem = record.richItemRenderer;
        if (richItem && typeof richItem === 'object') {
            const richRecord = richItem as Record<string, unknown>;
            if (richRecord.content && typeof richRecord.content === 'object') {
                return unwrapRendererCandidate(richRecord.content);
            }
        }

        for (const key of RENDERER_KEYS) {
            const renderer = record[key];
            if (renderer && typeof renderer === 'object') {
                return renderer as Record<string, unknown>;
            }
        }

        if (typeof record.videoId === 'string') return record;
        if (record.navigationEndpoint && typeof record.navigationEndpoint === 'object') {
            const endpoint = record.navigationEndpoint as Record<string, unknown>;
            if (endpoint.watchEndpoint && typeof endpoint.watchEndpoint === 'object') {
                return record;
            }
        }

        return null;
    }

    function shouldHideRenderer(renderer: Record<string, unknown>): boolean {
        if (!isMembersOnlyRenderer(renderer)) return false;
        if (mode === 'all') return true;

        const channel = extractChannelKey(renderer);
        if (mode === 'blocklist') {
            return channel ? blocklist.has(channel) : false;
        }

        return channel ? !allowlist.has(channel) : true;
    }

    function filterNode(node: unknown): number {
        if (!node || typeof node !== 'object') return 0;

        if (Array.isArray(node)) {
            let writeIndex = 0;
            let removed = 0;
            for (let i = 0; i < node.length; i += 1) {
                const item = node[i];
                let drop = false;
                if (item && typeof item === 'object') {
                    const renderer = unwrapRendererCandidate(item);
                    drop = renderer ? shouldHideRenderer(renderer) : false;
                }
                if (drop) {
                    removed += 1;
                    continue;
                }
                removed += filterNode(item);
                node[writeIndex] = item;
                writeIndex += 1;
            }
            node.length = writeIndex;
            return removed;
        }

        let removed = 0;
        const record = node as Record<string, unknown>;
        for (const key of Object.keys(record)) {
            const value = record[key];
            if (!value || typeof value !== 'object') continue;
            removed += filterNode(value);
        }
        return removed;
    }

    function patchYoutubeiPayload(payload: unknown): boolean {
        if (!enabled) return false;
        const removed = filterNode(payload);
        return removed > 0;
    }

    const nativeFetch = window.fetch;
    window.fetch = new Proxy(nativeFetch, {
        apply(target, thisArg, argArray) {
            const url = getUrl(argArray?.[0]);
            if (!shouldInspectRequest(url)) {
                return Reflect.apply(target, thisArg, argArray);
            }

            return Reflect.apply(target, thisArg, argArray).then((response: Response) => {
                return response.clone().text().then((rawText) => {
                    const parsed = parseJsonPayload(rawText);
                    if (!parsed) return response;
                    if (!patchYoutubeiPayload(parsed.data)) return response;
                    return new Response(`${parsed.prefix}${JSON.stringify(parsed.data)}`, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }).catch(() => response);
            });
        }
    });

    const nativeXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args: unknown[]) {
        const url = args[1];
        (this as XMLHttpRequest & Record<symbol, unknown>)[xhrUrlKey] = typeof url === 'string' ? url : '';
        return (nativeXhrOpen as unknown as (...params: unknown[]) => void).apply(this, args);
    };

    const nativeXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        const self = this as XMLHttpRequest & Record<symbol, unknown>;
        const url = typeof self[xhrUrlKey] === 'string' ? self[xhrUrlKey] as string : '';
        if (self.onload && typeof self.onload === 'function' && URL_RE.test(url)) {
            self[xhrOnloadKey] = self.onload;
            self.onload = (...args: unknown[]) => {
                try {
                    if (enabled && typeof self.responseText === 'string') {
                        const parsed = parseJsonPayload(self.responseText);
                        if (parsed && patchYoutubeiPayload(parsed.data)) {
                            const patched = `${parsed.prefix}${JSON.stringify(parsed.data)}`;
                            Object.defineProperty(self, 'response', {
                                configurable: true,
                                writable: false,
                                value: patched
                            });
                            Object.defineProperty(self, 'responseText', {
                                configurable: true,
                                writable: false,
                                value: patched
                            });
                        }
                    }
                } catch {
                    // Ignore parse/patch errors and keep the original response.
                }
                const original = self[xhrOnloadKey];
                if (typeof original === 'function') {
                    return original.apply(self, args);
                }
                return undefined;
            };
        }
        return nativeXhrSend.call(this, body);
    };
}

export function installMemberNetworkPrefilterBridge() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(INJECTED_SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = INJECTED_SCRIPT_ID;
    script.textContent = `;(${injectedMemberNetworkPrefilterMain.toString()})(${JSON.stringify(CONFIG_EVENT_NAME)}, ${JSON.stringify(GLOBAL_KEY)});`;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
}

export function pushMemberNetworkPrefilterConfig(config: MemberNetworkPrefilterConfig) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CONFIG_EVENT_NAME, { detail: config }));
}
