import {
    addRuntimeInstalledListener,
    addRuntimeMessageListener,
    addStorageChangedListener,
    addTabRemovedListener,
    storageLocalSet,
    storageSessionSetAccessLevel,
    tabsQuery,
    tabsSendMessage
} from '../lib/webext';
import {
    getSubtitleFontAsset,
    subtitleFontBufferToBase64,
    type SubtitleFontAssetGetResponse
} from '../lib/subtitleFontAssets';
import {
    YT_CDN_STATUS_STORAGE_REQUEST_PREFIX,
    youTubeCdnStatusStorageStateKey
} from '../features/youtube/cdnStatus.shared';

console.log('[VideoTools-Pro] Background script loaded');

// Enable session storage access from content scripts
void storageSessionSetAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS').catch(() => {});

// --- Lightweight playback state tracker ---
// Foundation for centralized arbitration. Content scripts report state;
// background maintains a single source of truth for "who is playing".
type PlaybackEntry = {
    tabId: number;
    timestamp: number;
};

const playbackTracker = {
    activeTab: null as PlaybackEntry | null,
    userFocusedTab: null as PlaybackEntry | null,
};

type YtCdnTabState = {
    status: 'idle' | 'resolving' | 'ok' | 'doh_failed' | 'geo_failed';
    host: string;
    lastIp: string;
    countryCode: string;
    ts: number;
};

type CachedIp = {
    ip: string;
    provider: string;
    ts: number;
};

type CachedCountry = {
    countryCode: string;
    provider: string;
    ts: number;
};

type YtCdnTestOverride = {
    status?: 'idle' | 'resolving' | 'ok' | 'doh_failed' | 'geo_failed';
    host?: string;
    lastIp?: string;
    countryCode?: string;
};

const YT_CDN_HOST_CACHE_TTL_MS = 5 * 60 * 1000;
const YT_CDN_GEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const YT_CDN_RESOLVE_COOLDOWN_MS = 600;

const ytCdnInFlight = new Map<number, boolean>();
const ytCdnLastResolve = new Map<number, { host: string; ts: number }>();
const ytCdnTabState = new Map<number, YtCdnTabState>();
const ytCdnHostCache = new Map<string, CachedIp>();
const ytCdnGeoCache = new Map<string, CachedCountry>();
let ytCdnTestOverride: YtCdnTestOverride | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function parseDnsAnswer(data: unknown) {
    const answers = (data as { Answer?: unknown[] })?.Answer;
    return Array.isArray(answers)
        ? answers as Array<{ type?: number; data?: string }>
        : [];
}

function withTimeout(ms: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return {
        signal: controller.signal,
        cancel() {
            clearTimeout(timer);
        }
    };
}

function normalizeCountryCode(value: unknown) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return /^[A-Z]{2}$/.test(code) ? code : '';
}

function hostFromUrl(url: string) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function isYouTubeCdnStorageRequestKey(key: string) {
    return key.startsWith(YT_CDN_STATUS_STORAGE_REQUEST_PREFIX);
}

function defaultYtCdnState(host = ''): YtCdnTabState {
    return {
        status: 'idle',
        host,
        lastIp: '',
        countryCode: '',
        ts: Date.now()
    };
}

async function persistYtCdnStateByHost(host: string, state: YtCdnTabState) {
    if (!host) return;
    try {
        await storageLocalSet({
            [youTubeCdnStatusStorageStateKey(host)]: state
        });
    } catch {
        // ignore persistence failures
    }
}

function getCachedIp(host: string) {
    const cached = ytCdnHostCache.get(host);
    if (!cached) return null;
    if (Date.now() - cached.ts >= YT_CDN_HOST_CACHE_TTL_MS) {
        ytCdnHostCache.delete(host);
        return null;
    }
    return cached;
}

function getCachedCountry(ip: string) {
    const cached = ytCdnGeoCache.get(ip);
    if (!cached) return null;
    if (Date.now() - cached.ts >= YT_CDN_GEO_CACHE_TTL_MS) {
        ytCdnGeoCache.delete(ip);
        return null;
    }
    return cached;
}

async function dohResolve(host: string) {
    const cached = getCachedIp(host);
    if (cached) return cached;

    const providers = [
        {
            name: 'google',
            url: `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`,
            headers: {} as HeadersInit,
            parse(data: unknown) {
                const answers = parseDnsAnswer(data);
                return answers.find((entry) => entry?.type === 1 && typeof entry?.data === 'string')?.data || '';
            }
        },
        {
            name: 'cloudflare',
            url: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,
            headers: { accept: 'application/dns-json' } as HeadersInit,
            parse(data: unknown) {
                const answers = parseDnsAnswer(data);
                return answers.find((entry) => entry?.type === 1 && typeof entry?.data === 'string')?.data || '';
            }
        },
        {
            name: 'quad9',
            url: `https://dns.quad9.net/dns-query?name=${encodeURIComponent(host)}&type=A`,
            headers: { accept: 'application/dns-json' } as HeadersInit,
            parse(data: unknown) {
                const answers = parseDnsAnswer(data);
                return answers.find((entry) => entry?.type === 1 && typeof entry?.data === 'string')?.data || '';
            }
        }
    ];

    for (const provider of providers) {
        try {
            const timeout = withTimeout(2500);
            const response = await fetch(provider.url, {
                method: 'GET',
                headers: provider.headers,
                signal: timeout.signal
            });
            timeout.cancel();
            if (!response.ok) continue;

            const data = await response.json();
            const ip = provider.parse(data);
            if (!ip) continue;

            const out = { ip, provider: provider.name, ts: Date.now() };
            ytCdnHostCache.set(host, out);
            return out;
        } catch {
            // ignore provider failures
        }
    }

    return null;
}

async function lookupCountry(ip: string) {
    const cached = getCachedCountry(ip);
    if (cached) return cached;

    const providers = [
        {
            name: 'ipapi',
            url: `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
            parse(data: unknown) {
                return normalizeCountryCode((data as { country?: unknown })?.country);
            }
        },
        {
            name: 'ipwho',
            url: `https://ipwho.is/${encodeURIComponent(ip)}`,
            parse(data: unknown) {
                return normalizeCountryCode((data as { country_code?: unknown })?.country_code);
            }
        },
        {
            name: 'ipwhois',
            url: `https://ipwhois.app/json/${encodeURIComponent(ip)}`,
            parse(data: unknown) {
                return normalizeCountryCode((data as { country_code?: unknown })?.country_code);
            }
        }
    ];

    for (const provider of providers) {
        try {
            const timeout = withTimeout(3000);
            const response = await fetch(provider.url, { signal: timeout.signal });
            timeout.cancel();
            if (!response.ok) continue;

            const data = await response.json();
            const countryCode = provider.parse(data);
            if (!countryCode) continue;

            const out = { countryCode, provider: provider.name, ts: Date.now() };
            ytCdnGeoCache.set(ip, out);
            return out;
        } catch {
            // ignore provider failures
        }
    }

    return null;
}

function setYtCdnTabState(tabId: number, patch: Partial<YtCdnTabState>) {
    const current = ytCdnTabState.get(tabId) ?? defaultYtCdnState();
    const next = {
        ...current,
        ...patch,
        ts: Date.now()
    };
    ytCdnTabState.set(tabId, next);
    return next;
}

function makeStoredYtCdnState(host: string, patch: Partial<YtCdnTabState>) {
    return {
        ...defaultYtCdnState(host),
        ...patch,
        host,
        ts: Date.now()
    } satisfies YtCdnTabState;
}

async function notifyYtCdnState(tabId: number, state: YtCdnTabState) {
    try {
        await tabsSendMessage(tabId, {
            type: 'VB_YT_CDN_STATE',
            state
        });
    } catch {
        // ignore tabs without matching content script
    }
}

async function resolveYtCdnState(tabId: number, url: string) {
    if (ytCdnInFlight.get(tabId)) return;

    const host = hostFromUrl(url);
    if (!host || !host.includes('googlevideo.com')) return;

    const last = ytCdnLastResolve.get(tabId);
    const now = Date.now();
    if (last && last.host === host && now - last.ts < YT_CDN_RESOLVE_COOLDOWN_MS) {
        return;
    }
    ytCdnLastResolve.set(tabId, { host, ts: now });
    ytCdnInFlight.set(tabId, true);

    try {
        if (ytCdnTestOverride) {
            const overrideState = setYtCdnTabState(tabId, {
                status: ytCdnTestOverride.status ?? 'ok',
                host: ytCdnTestOverride.host || host,
                lastIp: ytCdnTestOverride.lastIp || '203.0.113.7',
                countryCode: normalizeCountryCode(ytCdnTestOverride.countryCode)
            });
            await persistYtCdnStateByHost(overrideState.host, overrideState);
            await notifyYtCdnState(tabId, overrideState);
            return;
        }

        const resolvingState = setYtCdnTabState(tabId, {
            status: 'resolving',
            host,
            lastIp: '',
            countryCode: ''
        });
        await persistYtCdnStateByHost(host, resolvingState);
        await notifyYtCdnState(tabId, resolvingState);

        const resolvedIp = await dohResolve(host);
        if (!resolvedIp?.ip) {
            const failedState = setYtCdnTabState(tabId, {
                status: 'doh_failed',
                host,
                lastIp: '',
                countryCode: ''
            });
            await persistYtCdnStateByHost(host, failedState);
            await notifyYtCdnState(tabId, failedState);
            return;
        }

        const geo = await lookupCountry(resolvedIp.ip);
        if (!geo?.countryCode) {
            const failedState = setYtCdnTabState(tabId, {
                status: 'geo_failed',
                host,
                lastIp: resolvedIp.ip,
                countryCode: ''
            });
            await persistYtCdnStateByHost(host, failedState);
            await notifyYtCdnState(tabId, failedState);
            return;
        }

        const successState = setYtCdnTabState(tabId, {
            status: 'ok',
            host,
            lastIp: resolvedIp.ip,
            countryCode: geo.countryCode
        });
        await persistYtCdnStateByHost(host, successState);
        await notifyYtCdnState(tabId, successState);
    } finally {
        ytCdnInFlight.set(tabId, false);
    }
}

async function resolveYtCdnStateFromStorage(url: string) {
    const host = hostFromUrl(url);
    if (!host || !host.includes('googlevideo.com')) return;
    if (host.includes('.invalid')) {
        console.error('[VB_FF_YT_CDN] background storage resolve start', host);
    }

    if (ytCdnTestOverride) {
        await persistYtCdnStateByHost(host, makeStoredYtCdnState(host, {
            status: ytCdnTestOverride.status ?? 'ok',
            host: ytCdnTestOverride.host || host,
            lastIp: ytCdnTestOverride.lastIp || '203.0.113.7',
            countryCode: normalizeCountryCode(ytCdnTestOverride.countryCode)
        }));
        if (host.includes('.invalid')) {
            console.error('[VB_FF_YT_CDN] background storage resolve override', host);
        }
        return;
    }

    await persistYtCdnStateByHost(host, makeStoredYtCdnState(host, {
        status: 'resolving',
        lastIp: '',
        countryCode: ''
    }));

    const resolvedIp = await dohResolve(host);
    if (!resolvedIp?.ip) {
        await persistYtCdnStateByHost(host, makeStoredYtCdnState(host, {
            status: 'doh_failed',
            lastIp: '',
            countryCode: ''
        }));
        return;
    }

    const geo = await lookupCountry(resolvedIp.ip);
    if (!geo?.countryCode) {
        await persistYtCdnStateByHost(host, makeStoredYtCdnState(host, {
            status: 'geo_failed',
            lastIp: resolvedIp.ip,
            countryCode: ''
        }));
        return;
    }

    await persistYtCdnStateByHost(host, makeStoredYtCdnState(host, {
        status: 'ok',
        lastIp: resolvedIp.ip,
        countryCode: geo.countryCode
    }));
}

// Relay for Cross-Tab Sync (Works across origins)
addRuntimeMessageListener((message, sender) => {
    if (!isRecord(message)) return;

    if (message.type === 'BROADCAST_SYNC') {
        const payload = isRecord(message.payload) ? message.payload : null;
        // Track play signals in the arbitration state
        if (payload?.type === 'PLAY_STARTED' && sender.tab?.id) {
            playbackTracker.activeTab = {
                tabId: sender.tab.id,
                timestamp: Date.now()
            };
        }

        // Relay to all tabs except the sender
        void tabsQuery({}).then((tabs) => {
            tabs.forEach((tab) => {
                if (tab.id && tab.id !== sender.tab?.id) {
                    void tabsSendMessage(tab.id, payload).catch(() => {});
                }
            });
        }).catch(() => {
            // ignore query failures
        });
    } else if (message.type === 'VB_PLAYBACK_STATE') {
        if (sender.tab?.id && message.state === 'stopped') {
            if (playbackTracker.activeTab?.tabId === sender.tab.id) {
                playbackTracker.activeTab = null;
            }
        }
    } else if (message.type === 'VB_USER_FOCUSED') {
        if (sender.tab?.id) {
            playbackTracker.userFocusedTab = {
                tabId: sender.tab.id,
                timestamp: Date.now()
            };
        }
    }
});

addRuntimeMessageListener((message, sender, sendResponse) => {
    if (!isRecord(message)) return false;
    if (
        message.type !== 'VB_YT_CDN_CAPTURED_URL'
        && message.type !== 'VB_YT_GET_CDN_STATE'
        && message.type !== 'VB_YT_SUBTITLE_FONT_GET'
        && message.type !== 'VB_TEST_SET_YT_CDN_OVERRIDE'
        && message.type !== 'VB_TEST_CLEAR_YT_CDN_OVERRIDE'
    ) {
        return false;
    }

    if (message.type === 'VB_TEST_SET_YT_CDN_OVERRIDE') {
        ytCdnTestOverride = isRecord(message.override)
            ? {
                status: typeof message.override.status === 'string'
                    ? message.override.status as YtCdnTestOverride['status']
                    : undefined,
                host: typeof message.override.host === 'string' ? message.override.host : undefined,
                lastIp: typeof message.override.lastIp === 'string' ? message.override.lastIp : undefined,
                countryCode: normalizeCountryCode(message.override.countryCode)
            }
            : null;
        sendResponse({ ok: true, override: ytCdnTestOverride });
        return false;
    }

    if (message.type === 'VB_TEST_CLEAR_YT_CDN_OVERRIDE') {
        ytCdnTestOverride = null;
        sendResponse({ ok: true });
        return false;
    }

    if (message.type === 'VB_YT_SUBTITLE_FONT_GET') {
        const fontId = typeof message.fontId === 'string' ? message.fontId.trim() : '';
        if (!fontId) {
            sendResponse({
                ok: false,
                error: 'invalid_font_id'
            } satisfies SubtitleFontAssetGetResponse);
            return false;
        }

        void getSubtitleFontAsset(fontId).then((font) => {
            if (!font) {
                sendResponse({
                    ok: false,
                    error: 'font_not_found'
                } satisfies SubtitleFontAssetGetResponse);
                return;
            }

            sendResponse({
                ok: true,
                font: {
                    id: font.id,
                    displayName: font.displayName,
                    mimeType: font.mimeType,
                    size: font.size,
                    bufferBase64: subtitleFontBufferToBase64(font.buffer),
                    capabilities: font.capabilities
                }
            } satisfies SubtitleFontAssetGetResponse);
        }).catch(() => {
            sendResponse({
                ok: false,
                error: 'font_read_failed'
            } satisfies SubtitleFontAssetGetResponse);
        });

        return true;
    }

    if (message.type === 'VB_YT_CDN_CAPTURED_URL') {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number' || typeof message.url !== 'string') {
            sendResponse({ ok: false });
            return false;
        }

        sendResponse({ ok: true });
        void resolveYtCdnState(tabId, message.url);
        return false;
    }

    if (message.type === 'VB_YT_GET_CDN_STATE') {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
            sendResponse({ ok: false });
            return false;
        }

        sendResponse({
            ok: true,
            state: ytCdnTabState.get(tabId) ?? {
                status: 'idle',
                host: '',
                lastIp: '',
                countryCode: '',
                ts: Date.now()
            }
        });
    }

    return false;
});

addStorageChangedListener((changes, areaName) => {
    if (areaName && areaName !== 'local') return;

    Object.keys(changes).forEach((key) => {
        if (!isYouTubeCdnStorageRequestKey(key)) return;

        const request = changes[key]?.newValue;
        if (!isRecord(request)) return;

        const url = typeof request.url === 'string' ? request.url : '';
        if (!url) return;
        if (url.includes('.invalid')) {
            console.error('[VB_FF_YT_CDN] background storage request seen', key);
        }

        void resolveYtCdnStateFromStorage(url);
    });
});

// Clean up tracker when tabs are removed
addTabRemovedListener((tabId) => {
    if (playbackTracker.activeTab?.tabId === tabId) {
        playbackTracker.activeTab = null;
    }
    if (playbackTracker.userFocusedTab?.tabId === tabId) {
        playbackTracker.userFocusedTab = null;
    }

    ytCdnInFlight.delete(tabId);
    ytCdnLastResolve.delete(tabId);
    ytCdnTabState.delete(tabId);
});

// Listen for installation
addRuntimeInstalledListener(() => {
    console.log('Extension installed');
});
