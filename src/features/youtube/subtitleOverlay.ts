import {
    YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL,
    YT_SUBTITLE_OVERLAY_CONTENT_SOURCE,
    YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST,
    YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE,
    YT_SUBTITLE_OVERLAY_INJECTED_SCRIPT_ID,
    YT_SUBTITLE_OVERLAY_PAGE_SCRIPT_PATH,
    YT_SUBTITLE_OVERLAY_PAGE_SOURCE,
    YT_SUBTITLE_OVERLAY_PLAYER_DATA_REQUEST,
    YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE,
    type YouTubeSubtitleEnsureEnabledResponse,
    type YouTubeSubtitlePlayerDataResponse
} from './subtitleOverlay.shared';
import { isPageBridgeMessageEvent } from './bridge';
import { getRuntimeUrl, isFirefoxExtensionRuntime } from '../../lib/webext';

type BridgeResponse = YouTubeSubtitlePlayerDataResponse | YouTubeSubtitleEnsureEnabledResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function createRequestId() {
    const random = globalThis.crypto?.randomUUID?.();
    if (typeof random === 'string' && random) return random;
    return `vb-yt-subtitle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolvePageScriptUrl(): string | null {
    return getRuntimeUrl(YT_SUBTITLE_OVERLAY_PAGE_SCRIPT_PATH);
}

async function postBridgeRequest<T extends BridgeResponse>(
    requestType: string,
    responseType: string,
    payload: Record<string, unknown> = {}
): Promise<T | null> {
    if (typeof window === 'undefined') return null;

    return await new Promise<T | null>((resolve) => {
        const requestId = createRequestId();
        let timeoutId = 0;

        const cleanup = () => {
            window.removeEventListener('message', handleMessage as EventListener);
            if (timeoutId) {
                window.clearTimeout(timeoutId);
                timeoutId = 0;
            }
        };

        const handleMessage = (event: MessageEvent<unknown>) => {
            if (!isPageBridgeMessageEvent(event)) return;
            if (!isRecord(event.data)) return;
            const data = event.data as Record<string, unknown>;
            if (data.source !== YT_SUBTITLE_OVERLAY_PAGE_SOURCE) return;
            if (data.channel !== YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL) return;
            if (data.type !== responseType) return;
            if (data.requestId !== requestId) return;

            cleanup();
            resolve(data as T);
        };

        window.addEventListener('message', handleMessage as EventListener);
        timeoutId = window.setTimeout(() => {
            cleanup();
            resolve(null);
        }, 6000);

        window.postMessage({
            source: YT_SUBTITLE_OVERLAY_CONTENT_SOURCE,
            channel: YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL,
            type: requestType,
            requestId,
            ...payload
        }, window.location.origin);
    });
}

let scriptInjected = false;

export function installYouTubeSubtitleOverlayBridge() {
    // Reserved for future bridge expansion.
}

export function ensureYouTubeSubtitleOverlayScriptInjected() {
    if (typeof document === 'undefined') return;
    if (scriptInjected) return;

    if (isFirefoxExtensionRuntime()) {
        scriptInjected = true;
        return;
    }

    if (document.getElementById(YT_SUBTITLE_OVERLAY_INJECTED_SCRIPT_ID)) {
        scriptInjected = true;
        return;
    }

    const scriptUrl = resolvePageScriptUrl();
    if (!scriptUrl) return;

    const root = document.documentElement || document.head;
    if (!root) return;

    const script = document.createElement('script');
    script.id = YT_SUBTITLE_OVERLAY_INJECTED_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = false;
    script.addEventListener('load', () => {
        script.remove();
    }, { once: true });
    script.addEventListener('error', () => {
        scriptInjected = false;
        script.remove();
    }, { once: true });

    root.appendChild(script);
    scriptInjected = true;
}

export async function requestYouTubeSubtitlePlayerData(expectedVideoId: string | null) {
    return await postBridgeRequest<YouTubeSubtitlePlayerDataResponse>(
        YT_SUBTITLE_OVERLAY_PLAYER_DATA_REQUEST,
        YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE,
        { expectedVideoId }
    );
}

export async function requestYouTubeSubtitleEnsureEnabled() {
    return await postBridgeRequest<YouTubeSubtitleEnsureEnabledResponse>(
        YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST,
        YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE
    );
}
