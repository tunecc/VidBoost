export type YouTubeCdnStatusPageConfig = {
    enabled: boolean;
};

export const YT_CDN_STATUS_PAGE_SCRIPT_PATH = 'assets/yt-cdn-status.page.js';
export const YT_CDN_STATUS_INJECTED_SCRIPT_ID = 'vb-yt-cdn-status';
export const YT_CDN_STATUS_BRIDGE_CHANNEL = 'vb:yt-cdn-status';
export const YT_CDN_STATUS_PAGE_SOURCE = 'vb:yt-cdn-status:page';
export const YT_CDN_STATUS_CONTENT_SOURCE = 'vb:yt-cdn-status:content';
export const YT_CDN_STATUS_CONFIG_EVENT = 'vb:yt-cdn-status:config';
export const YT_CDN_STATUS_REPORT_EVENT = 'vb:yt-cdn-status:report';
export const YT_CDN_STATUS_CONFIG_ATTRIBUTE = 'data-vb-yt-cdn-config';
export const YT_CDN_STATUS_STORAGE_REQUEST_PREFIX = 'vb:yt-cdn-status:request:';
export const YT_CDN_STATUS_STORAGE_STATE_PREFIX = 'vb:yt-cdn-status:state:';

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

function normalizeYouTubeCdnStatusStorageHost(host: string) {
    return host.trim().toLowerCase();
}

export function youTubeCdnStatusStorageRequestKey(host: string) {
    return `${YT_CDN_STATUS_STORAGE_REQUEST_PREFIX}${normalizeYouTubeCdnStatusStorageHost(host)}`;
}

export function youTubeCdnStatusStorageStateKey(host: string) {
    return `${YT_CDN_STATUS_STORAGE_STATE_PREFIX}${normalizeYouTubeCdnStatusStorageHost(host)}`;
}
