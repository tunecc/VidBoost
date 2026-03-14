export type YouTubeOriginalAudioPageConfig = {
    enabled: boolean;
};

export const YT_ORIGINAL_AUDIO_PAGE_SCRIPT_PATH = 'assets/yt-original-audio.page.js';
export const YT_ORIGINAL_AUDIO_INJECTED_SCRIPT_ID = 'vb-yt-original-audio';
export const YT_ORIGINAL_AUDIO_BRIDGE_CHANNEL = 'vb:yt-original-audio';
export const YT_ORIGINAL_AUDIO_PAGE_SOURCE = 'vb:yt-original-audio:page';
export const YT_ORIGINAL_AUDIO_CONTENT_SOURCE = 'vb:yt-original-audio:content';

export const DEFAULT_YT_ORIGINAL_AUDIO_PAGE_CONFIG: YouTubeOriginalAudioPageConfig = {
    enabled: false
};

export function cloneYouTubeOriginalAudioPageConfig(
    config: YouTubeOriginalAudioPageConfig
): YouTubeOriginalAudioPageConfig {
    return {
        enabled: config.enabled
    };
}
