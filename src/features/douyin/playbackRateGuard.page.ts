import {
    DEFAULT_DOUYIN_PLAYBACK_RATE_GUARD_CONFIG,
    DOUYIN_PLAYBACK_RATE_GUARD_BRIDGE_CHANNEL,
    DOUYIN_PLAYBACK_RATE_GUARD_CONTENT_SOURCE,
    DOUYIN_PLAYBACK_RATE_GUARD_GLOBAL_KEY,
    DOUYIN_PLAYBACK_RATE_GUARD_PAGE_SOURCE,
    DOUYIN_PLAYBACK_RATE_GUARD_SYNC_ATTR,
    DOUYIN_PLAYBACK_RATE_GUARD_SYNC_EVENT,
    sanitizeDouyinPlaybackRateGuardConfig,
    sanitizePlaybackRate,
    type DouyinPlaybackRateGuardConfig
} from './playbackRateGuard.shared';

type BridgeToPageMessage = {
    source: string;
    channel: string;
    type: 'initial';
    config: DouyinPlaybackRateGuardConfig;
};

(() => {
    const host = window as unknown as Record<string, unknown>;
    if (host[DOUYIN_PLAYBACK_RATE_GUARD_GLOBAL_KEY]) return;
    host[DOUYIN_PLAYBACK_RATE_GUARD_GLOBAL_KEY] = true;

    const playbackRateDescriptor = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'playbackRate'
    );
    const defaultPlaybackRateDescriptor = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'defaultPlaybackRate'
    );

    if (!playbackRateDescriptor?.get || !playbackRateDescriptor.set) return;

    let config: DouyinPlaybackRateGuardConfig = {
        ...DEFAULT_DOUYIN_PLAYBACK_RATE_GUARD_CONFIG
    };
    let applyingDepth = 0;
    let reconcileScheduled = false;

    const getNativePlaybackRate = (video: HTMLMediaElement): number => {
        return sanitizePlaybackRate(playbackRateDescriptor.get!.call(video), 1);
    };

    const setNativePlaybackRate = (video: HTMLMediaElement, rate: number) => {
        applyingDepth += 1;
        try {
            try {
                defaultPlaybackRateDescriptor?.set?.call(video, rate);
            } catch {
                // Ignore defaultPlaybackRate write failures.
            }
            playbackRateDescriptor.set!.call(video, rate);
        } finally {
            applyingDepth -= 1;
        }
    };

    const isStickyEnabled = () => {
        return config.enabled && config.targetRate > config.stickyAbove;
    };

    const isVisibleVideo = (video: HTMLVideoElement) => {
        const rect = video.getBoundingClientRect();
        return rect.width > 10 && rect.height > 10;
    };

    const pickPreferredVideo = (): HTMLVideoElement | null => {
        const videos = Array
            .from(document.querySelectorAll('video'))
            .filter((video): video is HTMLVideoElement => video instanceof HTMLVideoElement)
            .filter((video) => video.isConnected && isVisibleVideo(video));

        if (videos.length === 0) return null;

        const playing = videos.filter((video) => !video.paused && !video.ended);
        const pool = playing.length > 0 ? playing : videos;

        return pool.reduce((best, video) => {
            const bestRect = best.getBoundingClientRect();
            const rect = video.getBoundingClientRect();
            const bestArea = bestRect.width * bestRect.height;
            const area = rect.width * rect.height;
            return area > bestArea ? video : best;
        });
    };

    const shouldGuardVideo = (video: HTMLMediaElement) => {
        if (!isStickyEnabled()) return false;
        if (!(video instanceof HTMLVideoElement)) return false;

        const preferredVideo = pickPreferredVideo();
        if (preferredVideo) return preferredVideo === video;

        return !video.paused;
    };

    const enforcePreferredVideo = () => {
        const preferredVideo = pickPreferredVideo();
        if (!preferredVideo) return;

        const currentRate = getNativePlaybackRate(preferredVideo);
        if (Math.abs(currentRate - config.targetRate) <= 0.01) return;
        setNativePlaybackRate(preferredVideo, config.targetRate);
    };

    const scheduleEnforcePreferredVideo = () => {
        if (reconcileScheduled) return;
        reconcileScheduled = true;
        window.requestAnimationFrame(() => {
            reconcileScheduled = false;
            enforcePreferredVideo();
        });
    };

    try {
        Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
            configurable: playbackRateDescriptor.configurable,
            enumerable: playbackRateDescriptor.enumerable ?? true,
            get() {
                return playbackRateDescriptor.get!.call(this);
            },
            set(value: number) {
                const normalizedValue = sanitizePlaybackRate(value, 1);

                if (applyingDepth > 0) {
                    playbackRateDescriptor.set!.call(this, normalizedValue);
                    return;
                }

                if (shouldGuardVideo(this)) {
                    setNativePlaybackRate(this, config.targetRate);
                    scheduleEnforcePreferredVideo();
                    return;
                }

                playbackRateDescriptor.set!.call(this, normalizedValue);
            }
        });
    } catch {
        return;
    }

    const handleMediaEvent = (event: Event) => {
        const target = event.target;
        if (!(target instanceof HTMLMediaElement)) return;
        if (!shouldGuardVideo(target)) return;
        scheduleEnforcePreferredVideo();
    };

    const observer = new MutationObserver(() => {
        if (!isStickyEnabled()) return;
        scheduleEnforcePreferredVideo();
    });

    if (document.documentElement) {
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    document.addEventListener('play', handleMediaEvent, true);
    document.addEventListener('playing', handleMediaEvent, true);
    document.addEventListener('ratechange', handleMediaEvent, true);
    document.addEventListener('loadedmetadata', handleMediaEvent, true);

    function isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object';
    }

    function readSyncConfigFromDom(): DouyinPlaybackRateGuardConfig | null {
        const root = document.documentElement;
        const raw = root?.getAttribute(DOUYIN_PLAYBACK_RATE_GUARD_SYNC_ATTR);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw) as Partial<DouyinPlaybackRateGuardConfig>;
            return sanitizeDouyinPlaybackRateGuardConfig(parsed);
        } catch {
            return null;
        }
    }

    function updateConfig(nextConfig: unknown) {
        config = sanitizeDouyinPlaybackRateGuardConfig(
            isRecord(nextConfig) ? nextConfig : undefined
        );
        enforcePreferredVideo();
        if (isStickyEnabled()) {
            scheduleEnforcePreferredVideo();
        }
    }

    document.addEventListener(DOUYIN_PLAYBACK_RATE_GUARD_SYNC_EVENT, () => {
        const nextConfig = readSyncConfigFromDom();
        if (!nextConfig) return;
        updateConfig(nextConfig);
    }, true);

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (event.source !== window) return;
        if (!isRecord(event.data)) return;

        const data = event.data as BridgeToPageMessage;
        if (data.source !== DOUYIN_PLAYBACK_RATE_GUARD_CONTENT_SOURCE) return;
        if (data.channel !== DOUYIN_PLAYBACK_RATE_GUARD_BRIDGE_CHANNEL) return;
        if (data.type !== 'initial') return;

        updateConfig(data.config);
    });

    const initialConfig = readSyncConfigFromDom();
    if (initialConfig) {
        updateConfig(initialConfig);
    }

    window.postMessage({
        source: DOUYIN_PLAYBACK_RATE_GUARD_PAGE_SOURCE,
        channel: DOUYIN_PLAYBACK_RATE_GUARD_BRIDGE_CHANNEL,
        type: 'init'
    }, window.location.origin);
})();
