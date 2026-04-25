import { isPageBridgeMessageEvent } from './bridge';
import {
    YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL,
    YT_SUBTITLE_OVERLAY_CONTENT_SOURCE,
    YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST,
    YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE,
    YT_SUBTITLE_OVERLAY_PAGE_SOURCE,
    YT_SUBTITLE_OVERLAY_PLAYER_DATA_REQUEST,
    YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE,
    type YouTubeSubtitleAudioCaptionTrack,
    type YouTubeSubtitleCaptionTrack,
    type YouTubeSubtitlePlayerData,
    type YouTubeSubtitleSelectedTrack
} from './subtitleOverlay.shared';

type BridgeRequest = {
    source: string;
    channel: string;
    type: string;
    requestId: string;
    expectedVideoId?: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
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
        });
        return originalXhrSend.apply(this, args as Parameters<XMLHttpRequest['send']>);
    };
}

function normalizeTracks(tracks: YouTubeSubtitleCaptionTrack[]): YouTubeSubtitleCaptionTrack[] {
    return tracks.map((track) => ({
        ...track,
        baseUrl: track.baseUrl?.includes('://') ? track.baseUrl : `${location.origin}${track.baseUrl}`
    }));
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

    return {
        videoId,
        captionTracks: normalizeTracks(
            playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
        ),
        audioCaptionTracks: parseAudioTracks(player.getAudioTrack?.()?.captionTracks),
        device: window.ytcfg?.get?.('DEVICE') ?? null,
        cver: player.getWebPlayerContextConfig?.()?.innertubeContextClientVersion ?? null,
        playerState: player.getPlayerState?.() ?? -1,
        selectedTrack: extractSelectedTrack(player.getOption?.('captions', 'track')),
        cachedTimedtextUrl: timedtextUrlCache.get(videoId) ?? null
    };
}

function ensureSubtitlesEnabled() {
    const button = document.querySelector<HTMLElement>('.ytp-subtitles-button');
    if (!button) return false;

    if (button.getAttribute('aria-pressed') === 'true') {
        return true;
    }

    const player = findYoutubePlayer();
    if (typeof player?.toggleSubtitles === 'function') {
        try {
            player.toggleSubtitles();
            return true;
        } catch {
            return false;
        }
    }

    button.click();
    return true;
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

    if (request.type === YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST) {
        postResponse({
            type: YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE,
            requestId: request.requestId,
            success: true,
            enabled: ensureSubtitlesEnabled()
        });
    }
}

(() => {
    if (window.__VB_YT_SUBTITLE_OVERLAY__) return;
    window.__VB_YT_SUBTITLE_OVERLAY__ = true;
    setupTimedtextObserver();
    window.addEventListener('message', handleMessage);
})();
