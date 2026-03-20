console.log('[VideoTools-Pro] Background script loaded');

// Enable session storage access from content scripts
chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
});

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

const YT_CDN_HOST_CACHE_TTL_MS = 5 * 60 * 1000;
const YT_CDN_GEO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const YT_CDN_RESOLVE_COOLDOWN_MS = 600;

const ytCdnInFlight = new Map<number, boolean>();
const ytCdnLastResolve = new Map<number, { host: string; ts: number }>();
const ytCdnTabState = new Map<number, YtCdnTabState>();
const ytCdnHostCache = new Map<string, CachedIp>();
const ytCdnGeoCache = new Map<string, CachedCountry>();

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
    const current = ytCdnTabState.get(tabId) ?? {
        status: 'idle',
        host: '',
        lastIp: '',
        countryCode: '',
        ts: Date.now()
    };
    const next = {
        ...current,
        ...patch,
        ts: Date.now()
    };
    ytCdnTabState.set(tabId, next);
    return next;
}

async function notifyYtCdnState(tabId: number, state: YtCdnTabState) {
    try {
        await chrome.tabs.sendMessage(tabId, {
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
        const resolvingState = setYtCdnTabState(tabId, {
            status: 'resolving',
            host,
            lastIp: '',
            countryCode: ''
        });
        await notifyYtCdnState(tabId, resolvingState);

        const resolvedIp = await dohResolve(host);
        if (!resolvedIp?.ip) {
            const failedState = setYtCdnTabState(tabId, {
                status: 'doh_failed',
                host,
                lastIp: '',
                countryCode: ''
            });
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
            await notifyYtCdnState(tabId, failedState);
            return;
        }

        const successState = setYtCdnTabState(tabId, {
            status: 'ok',
            host,
            lastIp: resolvedIp.ip,
            countryCode: geo.countryCode
        });
        await notifyYtCdnState(tabId, successState);
    } finally {
        ytCdnInFlight.set(tabId, false);
    }
}

// Relay for Cross-Tab Sync (Works across origins)
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'BROADCAST_SYNC') {
        // Track play signals in the arbitration state
        if (message.payload?.type === 'PLAY_STARTED' && sender.tab?.id) {
            playbackTracker.activeTab = {
                tabId: sender.tab.id,
                timestamp: Date.now()
            };
        }

        // Relay to all tabs except the sender
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                if (tab.id && tab.id !== sender.tab?.id) {
                    chrome.tabs.sendMessage(tab.id, message.payload).catch(() => {});
                }
            }
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'VB_YT_CDN_CAPTURED_URL' && message?.type !== 'VB_YT_GET_CDN_STATE') {
        return false;
    }

    (async () => {
        if (message?.type === 'VB_YT_CDN_CAPTURED_URL') {
            const tabId = sender.tab?.id;
            if (typeof tabId !== 'number' || typeof message.url !== 'string') {
                sendResponse({ ok: false });
                return;
            }

            await resolveYtCdnState(tabId, message.url);
            sendResponse({ ok: true });
            return;
        }

        if (message?.type === 'VB_YT_GET_CDN_STATE') {
            const tabId = sender.tab?.id;
            if (typeof tabId !== 'number') {
                sendResponse({ ok: false });
                return;
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
            return;
        }
    })();

    return true;
});

// Clean up tracker when tabs are removed
chrome.tabs.onRemoved.addListener((tabId) => {
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
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});
