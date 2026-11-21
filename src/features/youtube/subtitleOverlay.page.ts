import { isPageBridgeMessageEvent } from './bridge';
import {
    YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL,
    YT_SUBTITLE_OVERLAY_CAPTURED_TIMEDTEXT_REQUEST,
    YT_SUBTITLE_OVERLAY_CAPTURED_TIMEDTEXT_RESPONSE,
    YT_SUBTITLE_OVERLAY_CONTENT_SOURCE,
    YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST,
    YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE,
    YT_SUBTITLE_OVERLAY_PAGE_SOURCE,
    YT_SUBTITLE_OVERLAY_PLAYER_DATA_REQUEST,
    YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE,
    YT_SUBTITLE_OVERLAY_SET_SUBTITLES_REQUEST,
    YT_SUBTITLE_OVERLAY_SET_SUBTITLES_RESPONSE,
    type YouTubeSubtitleAudioCaptionTrack,
    type YouTubeSubtitleCaptionTrack,
    type YouTubeSubtitlePlayerData,
    type YouTubeSubtitleSelectedTrack,
    type YouTubeTimedText
} from './subtitleOverlay.shared';
import { normalizeYouTubeSubtitleTracklistRenderer } from './subtitle/selector/playerData';

type BridgeRequest = {
    source: string;
    channel: string;
    type: string;
    requestId: string;
    expectedVideoId?: string | null;
    enabled?: boolean;
    languageCode?: string;
    kind?: string;
    translationLanguageCode?: string;
};

type YouTubePlayerElement = HTMLElement & {
    getPlayerResponse?: () => any;
    getAudioTrack?: () => any;
    getPlayerState?: () => number;
    getWebPlayerContextConfig?: () => any;
    getOption?: (module: string, option: string) => any;
    toggleSubtitles?: () => void;
};

declare global {
    interface Window {
        __VB_YT_SUBTITLE_OVERLAY__?: boolean;
        ytcfg?: {
            get?: (key: string) => string | undefined;
        };
    }
}

const TIMEDTEXT_API_RE = /api\/timedtext/;
const timedtextUrlCache = new Map<string, string>();
// 按视频缓存的 timedtext 响应体：videoId -> (lang|kind|tlang -> json3 events)。
// 原生字幕显示时播放器已自行请求过 timedtext，捕获响应体后接管渲染无需再发网络请求。
const capturedTimedtextCache = new Map<string, Map<string, YouTubeTimedText[]>>();
const CAPTURED_VIDEO_CACHE_LIMIT = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function buildTimedtextTrackKey(
    parsedUrl: URLSearchParams
): string | null {
    const lang = parsedUrl.get('lang');
    if (!lang) return null;
    return [lang, parsedUrl.get('kind') ?? '', parsedUrl.get('tlang') ?? ''].join('|');
}

function rememberCapturedVideo(videoId: string) {
    if (capturedTimedtextCache.has(videoId)) {
        // LRU：命中后挪到末尾，超限时淘汰最早的旧视频。
        const existing = capturedTimedtextCache.get(videoId)!;
        capturedTimedtextCache.delete(videoId);
        capturedTimedtextCache.set(videoId, existing);
        return existing;
    }

    const tracks = new Map<string, YouTubeTimedText[]>();
    capturedTimedtextCache.set(videoId, tracks);
    if (capturedTimedtextCache.size > CAPTURED_VIDEO_CACHE_LIMIT) {
        const oldest = capturedTimedtextCache.keys().next();
        if (!oldest.done && oldest.value !== videoId) {
            capturedTimedtextCache.delete(oldest.value);
        }
    }
    return tracks;
}

/**
 * 捕获一条 timedtext 响应：仅在 json3 格式且能解析出 events 时缓存正文。
 * 解析失败、非 timedtext、非 json3 一律静默忽略，绝不影响播放器自身请求。
 */
function cacheTimedtextBody(url: string, text: string) {
    if (!TIMEDTEXT_API_RE.test(url)) return;

    try {
        const parsedUrl = new URL(url);
        const videoId = parsedUrl.searchParams.get('v');
        if (!videoId) return;
        const pot = parsedUrl.searchParams.get('pot');
        if (pot) {
            timedtextUrlCache.set(videoId, url);
        }
        if (parsedUrl.searchParams.get('fmt') !== 'json3') return;
        const trackKey = buildTimedtextTrackKey(parsedUrl.searchParams);
        if (!trackKey) return;

        const payload = JSON.parse(text) as unknown;
        if (!isRecord(payload) || !Array.isArray(payload.events)) return;
        if (payload.events.length === 0) return;

        rememberCapturedVideo(videoId).set(trackKey, payload.events as YouTubeTimedText[]);
    } catch {
        // ignore malformed urls or bodies
    }
}

function cacheTimedtextUrl(url: string) {
    if (!TIMEDTEXT_API_RE.test(url)) return;

    try {
        const parsedUrl = new URL(url);
        const videoId = parsedUrl.searchParams.get('v');
        const pot = parsedUrl.searchParams.get('pot');
        if (!videoId || !pot) return;
        timedtextUrlCache.set(videoId, url);
    } catch {
        // ignore malformed urls
    }
}

function findCapturedTimedText(
    videoId: string,
    languageCode: string,
    kind?: string,
    translationLanguageCode?: string
): YouTubeTimedText[] | null {
    const trackKey = [languageCode, kind ?? '', translationLanguageCode ?? ''].join('|');
    const events = capturedTimedtextCache.get(videoId)?.get(trackKey);
    return events && events.length > 0 ? events : null;
}

function setupTimedtextObserver() {
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    const originalXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        ...args: unknown[]
    ) {
        (this as XMLHttpRequest & { _vbUrl?: string })._vbUrl = url.toString();
        return (originalXhrOpen as (...params: unknown[]) => unknown).apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function (...args: unknown[]) {
        this.addEventListener('load', function () {
            const responseUrl = this.responseURL
                || (this as XMLHttpRequest & { _vbUrl?: string })._vbUrl
                || '';
            if (responseUrl) {
                cacheTimedtextUrl(responseUrl);
            }
            const responseType = (this as XMLHttpRequest).responseType;
            if ((responseType === '' || responseType === 'text') && responseUrl) {
                const text = (this as XMLHttpRequest).responseText;
                if (typeof text === 'string') {
                    cacheTimedtextBody(responseUrl, text);
                }
            }
        });
        return originalXhrSend.apply(this, args as Parameters<XMLHttpRequest['send']>);
    };

    // 部分播放器路径用 fetch 请求 timedtext：同样只读、只缓存，不改请求与响应。
    const originalFetch = window.fetch?.bind(window);
    if (typeof originalFetch !== 'function') return;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
        const response = await originalFetch(...args);
        try {
            const requestUrl = typeof args[0] === 'string' || args[0] instanceof URL
                ? args[0].toString()
                : (args[0] as Request | undefined)?.url ?? '';
            if (TIMEDTEXT_API_RE.test(requestUrl)) {
                cacheTimedtextUrl(response.url || requestUrl);
                void response
                    .clone()
                    .text()
                    .then((text) => cacheTimedtextBody(response.url || requestUrl, text))
                    .catch(() => {});
            }
        } catch {
            // 缓存失败不影响播放器请求。
        }
        return response;
    };
}

function parseAudioTracks(tracks?: unknown[]): YouTubeSubtitleAudioCaptionTrack[] {
    return (tracks ?? []).flatMap((track) => {
        if (!isRecord(track) || typeof track.url !== 'string' || typeof track.vssId !== 'string') {
            return [];
        }

        try {
            return [{
                url: track.url,
                vssId: track.vssId,
                kind: typeof track.kind === 'string' ? track.kind : undefined,
                languageCode: new URL(track.url).searchParams.get('lang') ?? undefined
            }];
        } catch {
            return [];
        }
    });
}

function findStringValue(
    value: unknown,
    keys: string[],
    visited: Set<object> = new Set()
): string | null {
    if (!isRecord(value)) return null;
    if (visited.has(value)) return null;
    visited.add(value);

    for (const key of keys) {
        const current = value[key];
        if (typeof current === 'string' && current.trim()) {
            return current;
        }
    }

    for (const nested of Object.values(value)) {
        const resolved = findStringValue(nested, keys, visited);
        if (resolved) return resolved;
    }

    return null;
}

function extractSelectedTrack(value: unknown): YouTubeSubtitleSelectedTrack {
    return {
        languageCode: findStringValue(value, ['languageCode', 'lang']),
        vssId: findStringValue(value, ['vssId', 'vss_id']),
        kind: findStringValue(value, ['kind'])
    };
}

function normalizeChannelKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        return decodeURIComponent(trimmed).toLowerCase();
    } catch {
        return trimmed.toLowerCase();
    }
}

function extractChannelKey(playerResponse: any): string | null {
    const channelId = normalizeChannelKey(playerResponse?.videoDetails?.channelId);
    if (channelId) return channelId;

    const ownerProfileUrl = playerResponse?.microformat?.playerMicroformatRenderer?.ownerProfileUrl;
    if (typeof ownerProfileUrl !== 'string') return null;

    try {
        const url = ownerProfileUrl.startsWith('http')
            ? new URL(ownerProfileUrl)
            : new URL(ownerProfileUrl, location.origin);
        const pathname = url.pathname.replace(/\/+$/g, '');
        const channelMatch = pathname.match(/^\/channel\/([^/]+)$/i);
        if (channelMatch) return normalizeChannelKey(channelMatch[1]);
        const handleMatch = pathname.match(/^\/@([^/]+)$/i);
        if (handleMatch) return normalizeChannelKey(`@${handleMatch[1]}`);
        return normalizeChannelKey(pathname.replace(/^\/+/, ''));
    } catch {
        return normalizeChannelKey(ownerProfileUrl.replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, ''));
    }
}

function findYoutubePlayer(): YouTubePlayerElement | null {
    return document.querySelector<HTMLElement>(
        '#movie_player.html5-video-player, ytd-player #movie_player, #movie_player'
    ) as YouTubePlayerElement | null;
}

function getPlayerData(expectedVideoId: string | null): YouTubeSubtitlePlayerData | null {
    const player = findYoutubePlayer();
    if (!player) return null;

    const playerResponse = player.getPlayerResponse?.();
    const videoId = playerResponse?.videoDetails?.videoId;
    if (!videoId) return null;
    if (expectedVideoId && expectedVideoId !== videoId) return null;

    const normalizedTracklist = normalizeYouTubeSubtitleTracklistRenderer(
        playerResponse?.captions?.playerCaptionsTracklistRenderer,
        location.origin
    );

    return {
        videoId,
        channelKey: extractChannelKey(playerResponse),
        captionTracks: normalizedTracklist.captionTracks,
        translationLanguages: normalizedTracklist.translationLanguages,
        audioCaptionTracks: parseAudioTracks(player.getAudioTrack?.()?.captionTracks),
        device: window.ytcfg?.get?.('DEVICE') ?? null,
        cver: player.getWebPlayerContextConfig?.()?.innertubeContextClientVersion ?? null,
        playerState: player.getPlayerState?.() ?? -1,
        selectedTrack: extractSelectedTrack(player.getOption?.('captions', 'track')),
        cachedTimedtextUrl: timedtextUrlCache.get(videoId) ?? null
    };
}

function readSubtitlesEnabled() {
    const button = document.querySelector<HTMLElement>('.ytp-subtitles-button');
    if (!button) return null;
    return button.getAttribute('aria-pressed') === 'true';
}

function isYoutubeMenuOpen(): boolean {
    const selectors = [
        '.ytp-popup',
        '.ytp-settings-menu',
        '.ytp-contextmenu',
        'ytd-menu-popup-renderer',
        'tp-yt-iron-dropdown',
        '.ytp-panel'
    ];
    for (const selector of selectors) {
        const elements = document.querySelectorAll<HTMLElement>(selector);
        for (const el of elements) {
            if (
                el.offsetWidth > 0 &&
                el.offsetHeight > 0 &&
                window.getComputedStyle(el).display !== 'none' &&
                window.getComputedStyle(el).visibility !== 'hidden'
            ) {
                return true;
            }
        }
    }
    return false;
}

function setSubtitlesEnabled(enabled: boolean) {
    const button = document.querySelector<HTMLElement>('.ytp-subtitles-button');
    if (!button) return { success: false, enabled: false };

    let current = readSubtitlesEnabled();
    if (current === enabled) {
        return { success: true, enabled: current };
    }

    if (isYoutubeMenuOpen()) {
        return { success: false, enabled: current ?? false };
    }

    const player = findYoutubePlayer();
    if (typeof player?.toggleSubtitles === 'function') {
        try {
            player.toggleSubtitles();
        } catch {
            return { success: false, enabled: current ?? false };
        }
    } else {
        button.click();
    }

    current = readSubtitlesEnabled();
    return {
        success: current === enabled,
        enabled: current ?? false
    };
}

function ensureSubtitlesEnabled() {
    return setSubtitlesEnabled(true).success;
}

function postResponse(message: Record<string, unknown>) {
    window.postMessage({
        source: YT_SUBTITLE_OVERLAY_PAGE_SOURCE,
        channel: YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL,
        ...message
    }, window.location.origin);
}

function handleMessage(event: MessageEvent<unknown>) {
    if (!isPageBridgeMessageEvent(event)) return;
    if (!isRecord(event.data)) return;

    const request = event.data as BridgeRequest;
    if (request.source !== YT_SUBTITLE_OVERLAY_CONTENT_SOURCE) return;
    if (request.channel !== YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL) return;

    if (request.type === YT_SUBTITLE_OVERLAY_PLAYER_DATA_REQUEST) {
        try {
            const data = getPlayerData(request.expectedVideoId ?? null);
            if (!data) {
                postResponse({
                    type: YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE,
                    requestId: request.requestId,
                    success: false,
                    error: 'PLAYER_DATA_UNAVAILABLE'
                });
                return;
            }

            postResponse({
                type: YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE,
                requestId: request.requestId,
                success: true,
                data
            });
        } catch (error) {
            postResponse({
                type: YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE,
                requestId: request.requestId,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }

    if (request.type === YT_SUBTITLE_OVERLAY_CAPTURED_TIMEDTEXT_REQUEST) {
        try {
            const videoId = request.expectedVideoId ?? '';
            const languageCode = request.languageCode ?? '';
            const events = videoId && languageCode
                ? findCapturedTimedText(
                    videoId,
                    languageCode,
                    request.kind,
                    request.translationLanguageCode
                )
                : null;
            postResponse({
                type: YT_SUBTITLE_OVERLAY_CAPTURED_TIMEDTEXT_RESPONSE,
                requestId: request.requestId,
                success: events !== null,
                ...(events ? { events } : {})
            });
        } catch (error) {
            postResponse({
                type: YT_SUBTITLE_OVERLAY_CAPTURED_TIMEDTEXT_RESPONSE,
                requestId: request.requestId,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }

    if (request.type === YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST) {
        postResponse({
            type: YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE,
            requestId: request.requestId,
            success: true,
            enabled: ensureSubtitlesEnabled()
        });
        return;
    }

    if (request.type === YT_SUBTITLE_OVERLAY_SET_SUBTITLES_REQUEST) {
        const result = setSubtitlesEnabled(request.enabled === true);
        postResponse({
            type: YT_SUBTITLE_OVERLAY_SET_SUBTITLES_RESPONSE,
            requestId: request.requestId,
            success: result.success,
            enabled: result.enabled
        });
    }
}

(() => {
    if (window.__VB_YT_SUBTITLE_OVERLAY__) return;
    window.__VB_YT_SUBTITLE_OVERLAY__ = true;
    setupTimedtextObserver();
    window.addEventListener('message', handleMessage);
})();
