export type YouTubeCdnStatusPageConfig = {
    enabled: boolean;
};

export const YT_CDN_STATUS_PAGE_SCRIPT_PATH = 'assets/yt-cdn-status.page.js';
export const YT_CDN_STATUS_INJECTED_SCRIPT_ID = 'vb-yt-cdn-status';
export const YT_CDN_STATUS_BRIDGE_CHANNEL = 'vb:yt-cdn-status';
export const YT_CDN_STATUS_PAGE_SOURCE = 'vb:yt-cdn-status:page';
export const YT_CDN_STATUS_CONTENT_SOURCE = 'vb:yt-cdn-status:content';

export const DEFAULT_YT_CDN_STATUS_PAGE_CONFIG: YouTubeCdnStatusPageConfig = {
    enabled: false
};

export function cloneYouTubeCdnStatusPageConfig(
    config: YouTubeCdnStatusPageConfig
): YouTubeCdnStatusPageConfig {
    return {
        enabled: config.enabled
    };
}
