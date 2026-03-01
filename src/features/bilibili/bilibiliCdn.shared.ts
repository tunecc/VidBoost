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

/** Speed test result for a single CDN node */
export type SpeedTestResult = {
    nodeId: string;
    /** Speed string like "12.3" (MB/s) or error message */
    speed: string;
    error: boolean;
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
