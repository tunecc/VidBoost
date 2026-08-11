export type YouTubeSubtitleOverlayPageConfig = {
    enabled: boolean;
};

export type YouTubeSubtitleCaptionTrack = {
    baseUrl: string;
    languageCode: string;
    kind?: string;
    vssId: string;
    name?: {
        simpleText?: string;
    };
    trackName?: string;
};

export type YouTubeSubtitleAudioCaptionTrack = {
    url: string;
    vssId: string;
    kind?: string;
    languageCode?: string;
};

export type YouTubeSubtitleSelectedTrack = {
    languageCode: string | null;
    vssId: string | null;
    kind: string | null;
};

export type YouTubeSubtitlePlayerData = {
    videoId: string;
    channelKey: string | null;
    captionTracks: YouTubeSubtitleCaptionTrack[];
    audioCaptionTracks: YouTubeSubtitleAudioCaptionTrack[];
    device: string | null;
    cver: string | null;
    playerState: number;
    selectedTrack: YouTubeSubtitleSelectedTrack;
    cachedTimedtextUrl: string | null;
};

export type YouTubeTimedTextSeg = {
    utf8: string;
    tOffsetMs?: number;
};

export type YouTubeTimedText = {
    tStartMs: number;
    dDurationMs?: number;
    aAppend?: number;
    segs?: YouTubeTimedTextSeg[];
    wpWinPosId?: number;
    wWinId?: number;
};

export type YouTubeSubtitlePlayerDataResponse = {
    source: typeof YT_SUBTITLE_OVERLAY_PAGE_SOURCE;
    channel: typeof YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL;
    type: typeof YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE;
    requestId: string;
    success: boolean;
    error?: string;
    data?: YouTubeSubtitlePlayerData;
};

export type YouTubeSubtitleEnsureEnabledResponse = {
    source: typeof YT_SUBTITLE_OVERLAY_PAGE_SOURCE;
    channel: typeof YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL;
    type: typeof YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE;
    requestId: string;
    success: boolean;
    enabled: boolean;
};

export type YouTubeSubtitleSetEnabledResponse = {
    source: typeof YT_SUBTITLE_OVERLAY_PAGE_SOURCE;
    channel: typeof YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL;
    type: typeof YT_SUBTITLE_OVERLAY_SET_SUBTITLES_RESPONSE;
    requestId: string;
    success: boolean;
    enabled: boolean;
};

export const YT_SUBTITLE_OVERLAY_PAGE_SCRIPT_PATH = 'assets/yt-subtitle-overlay.page.js';
export const YT_SUBTITLE_OVERLAY_INJECTED_SCRIPT_ID = 'vb-yt-subtitle-overlay';
export const YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL = 'vb:yt-subtitle-overlay';
export const YT_SUBTITLE_OVERLAY_PAGE_SOURCE = 'vb:yt-subtitle-overlay:page';
export const YT_SUBTITLE_OVERLAY_CONTENT_SOURCE = 'vb:yt-subtitle-overlay:content';

export const YT_SUBTITLE_OVERLAY_PLAYER_DATA_REQUEST = 'player-data-request';
export const YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE = 'player-data-response';
export const YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST = 'ensure-subtitles-request';
export const YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE = 'ensure-subtitles-response';
export const YT_SUBTITLE_OVERLAY_SET_SUBTITLES_REQUEST = 'set-subtitles-request';
export const YT_SUBTITLE_OVERLAY_SET_SUBTITLES_RESPONSE = 'set-subtitles-response';

export const DEFAULT_YT_SUBTITLE_OVERLAY_PAGE_CONFIG: YouTubeSubtitleOverlayPageConfig = {
    enabled: false
};

/**
 * 检测 Immersive Translate 是否在页面中活跃。
 * 检测 IT 字幕渲染容器 `.imt-caption-container`，该容器在 IT 渲染字幕时出现。
 * 注意：IT 的全局 API 在隔离世界，content script 检测不到；`imt-state` 属性
 * 在 YouTube 上不出现。因此以 IT 字幕容器作为主要信号。
 */
export function isImmersiveTranslateActive(): boolean {
    if (typeof document !== 'undefined') {
        const container = document.querySelector('.imt-caption-container');
        if (container) return true;
    }
    return false;
}

/**
 * 判断语言代码是否为中文。
 * 匹配 zh / zh-Hans / zh-Hant / zh-CN 等所有以 zh 开头的语言代码。
 */
export function isChineseLanguageCode(languageCode: string): boolean {
    return languageCode.startsWith('zh');
}

export function cloneYouTubeSubtitleOverlayPageConfig(
    config: YouTubeSubtitleOverlayPageConfig
): YouTubeSubtitleOverlayPageConfig {
    return {
        enabled: config.enabled
    };
}
