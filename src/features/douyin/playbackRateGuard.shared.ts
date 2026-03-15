export type DouyinPlaybackRateGuardConfig = {
    enabled: boolean;
    targetRate: number;
    stickyAbove: number;
};

export const DOUYIN_PLAYBACK_RATE_GUARD_BRIDGE_CHANNEL = 'vb:douyin-playback-rate';
export const DOUYIN_PLAYBACK_RATE_GUARD_PAGE_SOURCE = 'vb:douyin-playback-rate:page';
export const DOUYIN_PLAYBACK_RATE_GUARD_CONTENT_SOURCE = 'vb:douyin-playback-rate:content';
export const DOUYIN_PLAYBACK_RATE_GUARD_GLOBAL_KEY = '__VB_DOUYIN_PLAYBACK_RATE_GUARD__';
export const DOUYIN_PLAYBACK_RATE_GUARD_SYNC_EVENT = 'vb:douyin-playback-rate:sync';
export const DOUYIN_PLAYBACK_RATE_GUARD_SYNC_ATTR = 'data-vb-douyin-playback-rate-config';

export const DEFAULT_DOUYIN_PLAYBACK_RATE_GUARD_CONFIG: DouyinPlaybackRateGuardConfig = {
    enabled: false,
    targetRate: 1,
    stickyAbove: 3
};

export function sanitizePlaybackRate(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0.1, Number(parsed.toFixed(2)));
}

export function sanitizeDouyinPlaybackRateGuardConfig(
    config?: Partial<DouyinPlaybackRateGuardConfig> | null
): DouyinPlaybackRateGuardConfig {
    return {
        enabled: config?.enabled === true,
        targetRate: sanitizePlaybackRate(
            config?.targetRate,
            DEFAULT_DOUYIN_PLAYBACK_RATE_GUARD_CONFIG.targetRate
        ),
        stickyAbove: sanitizePlaybackRate(
            config?.stickyAbove,
            DEFAULT_DOUYIN_PLAYBACK_RATE_GUARD_CONFIG.stickyAbove
        )
    };
}

export function cloneDouyinPlaybackRateGuardConfig(
    config: DouyinPlaybackRateGuardConfig
): DouyinPlaybackRateGuardConfig {
    return {
        enabled: config.enabled,
        targetRate: config.targetRate,
        stickyAbove: config.stickyAbove
    };
}
