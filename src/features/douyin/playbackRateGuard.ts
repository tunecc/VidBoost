import {
    DEFAULT_DOUYIN_PLAYBACK_RATE_GUARD_CONFIG,
    DOUYIN_PLAYBACK_RATE_GUARD_BRIDGE_CHANNEL,
    DOUYIN_PLAYBACK_RATE_GUARD_CONTENT_SOURCE,
    DOUYIN_PLAYBACK_RATE_GUARD_PAGE_SOURCE,
    DOUYIN_PLAYBACK_RATE_GUARD_SYNC_ATTR,
    DOUYIN_PLAYBACK_RATE_GUARD_SYNC_EVENT,
    cloneDouyinPlaybackRateGuardConfig,
    sanitizeDouyinPlaybackRateGuardConfig,
    type DouyinPlaybackRateGuardConfig
} from './playbackRateGuard.shared';

let bridgeListenerInstalled = false;
let latestConfig: DouyinPlaybackRateGuardConfig = {
    ...DEFAULT_DOUYIN_PLAYBACK_RATE_GUARD_CONFIG
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function syncConfigToDom() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;

    try {
        root.setAttribute(
            DOUYIN_PLAYBACK_RATE_GUARD_SYNC_ATTR,
            JSON.stringify(cloneDouyinPlaybackRateGuardConfig(latestConfig))
        );
    } catch {
        return;
    }

    document.dispatchEvent(new Event(DOUYIN_PLAYBACK_RATE_GUARD_SYNC_EVENT));
}

function postInitialConfigToPage() {
    if (typeof window === 'undefined') return;
    window.postMessage({
        source: DOUYIN_PLAYBACK_RATE_GUARD_CONTENT_SOURCE,
        channel: DOUYIN_PLAYBACK_RATE_GUARD_BRIDGE_CHANNEL,
        type: 'initial',
        config: cloneDouyinPlaybackRateGuardConfig(latestConfig)
    }, window.location.origin);
}

function handlePageMessage(event: MessageEvent<unknown>) {
    if (event.source !== window) return;
    if (!isRecord(event.data)) return;
    const data = event.data as Record<string, unknown>;
    if (data.source !== DOUYIN_PLAYBACK_RATE_GUARD_PAGE_SOURCE) return;
    if (data.channel !== DOUYIN_PLAYBACK_RATE_GUARD_BRIDGE_CHANNEL) return;
    if (data.type !== 'init') return;
    postInitialConfigToPage();
}

export function installDouyinPlaybackRateGuardBridge() {
    if (typeof window === 'undefined') return;
    if (bridgeListenerInstalled) return;
    window.addEventListener('message', handlePageMessage as EventListener);
    bridgeListenerInstalled = true;
}

export function pushDouyinPlaybackRateGuardConfig(
    config: Partial<DouyinPlaybackRateGuardConfig>
) {
    latestConfig = sanitizeDouyinPlaybackRateGuardConfig({
        ...latestConfig,
        ...config
    });
    syncConfigToDom();
}
