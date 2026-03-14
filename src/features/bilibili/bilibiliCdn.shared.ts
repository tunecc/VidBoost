/**
 * Shared constants and types for the Bilibili CDN switching bridge
 * (between content script in ISOLATED world and page script in MAIN world).
 */

export type BilibiliCdnPageConfig = {
    enabled: boolean;
    /** CDN node host domain, e.g. 'upos-sz-mirrorali.bilivideo.com' */
    node: string;
    /** Enable Worker/Blob injection for bangumi support */
    bangumiMode: boolean;
};

export type BilibiliCdnSpeedTestOptions = {
    sampleSizeMiB: number;
    timeoutSeconds: number;
};

/** Speed test result for a single CDN node */
export type SpeedTestResult = {
    nodeId: string;
    /** Speed string like "12.3" (MiB/s) or error message */
    speed: string;
    error: boolean;
};

export const BB_CDN_SPEED_TEST_SAMPLE_SIZE_MIN_MIB = 1;
export const BB_CDN_SPEED_TEST_SAMPLE_SIZE_MAX_MIB = 64;
export const BB_CDN_SPEED_TEST_TIMEOUT_MIN_SECONDS = 3;
export const BB_CDN_SPEED_TEST_TIMEOUT_MAX_SECONDS = 60;

export const DEFAULT_BB_CDN_SPEED_TEST_OPTIONS: BilibiliCdnSpeedTestOptions = {
    sampleSizeMiB: 8,
    timeoutSeconds: 10
};

export const BB_CDN_PAGE_SCRIPT_PATH = 'assets/bb-cdn.page.js';
export const BB_CDN_INJECTED_SCRIPT_ID = 'vb-bb-cdn-switcher';
export const BB_CDN_GLOBAL_KEY = '__VB_BB_CDN__';
export const BB_CDN_BRIDGE_CHANNEL = 'vb:bb-cdn';
export const BB_CDN_PAGE_SOURCE = 'vb:bb-cdn:page';
export const BB_CDN_CONTENT_SOURCE = 'vb:bb-cdn:content';

export const DEFAULT_BB_CDN_PAGE_CONFIG: BilibiliCdnPageConfig = {
    enabled: false,
    node: '',
    bangumiMode: false
};

export function cloneBilibiliCdnPageConfig(
    config: BilibiliCdnPageConfig
): BilibiliCdnPageConfig {
    return {
        enabled: config.enabled,
        node: config.node,
        bangumiMode: config.bangumiMode
    };
}

function clampInteger(
    value: unknown,
    fallback: number,
    min: number,
    max: number
): number {
    const parsed = typeof value === 'number'
        ? value
        : (typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function sanitizeBilibiliCdnSpeedTestOptions(
    options?: Partial<BilibiliCdnSpeedTestOptions> | null
): BilibiliCdnSpeedTestOptions {
    return {
        sampleSizeMiB: clampInteger(
            options?.sampleSizeMiB,
            DEFAULT_BB_CDN_SPEED_TEST_OPTIONS.sampleSizeMiB,
            BB_CDN_SPEED_TEST_SAMPLE_SIZE_MIN_MIB,
            BB_CDN_SPEED_TEST_SAMPLE_SIZE_MAX_MIB
        ),
        timeoutSeconds: clampInteger(
            options?.timeoutSeconds,
            DEFAULT_BB_CDN_SPEED_TEST_OPTIONS.timeoutSeconds,
            BB_CDN_SPEED_TEST_TIMEOUT_MIN_SECONDS,
            BB_CDN_SPEED_TEST_TIMEOUT_MAX_SECONDS
        )
    };
}
