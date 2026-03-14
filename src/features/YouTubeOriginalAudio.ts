import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import type { YTConfig } from '../lib/settings';
import {
    ensureYouTubeOriginalAudioScriptInjected,
    installYouTubeOriginalAudioBridge,
    pushYouTubeOriginalAudioConfig
} from './youtube/originalAudio';

export class YouTubeOriginalAudio implements Feature {
    private enabled = false;
    private config: YTConfig = {};
    private syncTimer: number | null = null;
    private readonly handleNavigation = () => {
        this.scheduleSync(250);
    };

    mount() {
        if (!isSiteHost('youtube')) return;
        if (this.enabled) return;
        this.enabled = true;

        installYouTubeOriginalAudioBridge();
        window.addEventListener('popstate', this.handleNavigation);
        document.addEventListener('yt-navigate-finish', this.handleNavigation, true);
        this.scheduleSync(0);
    }

    unmount() {
        if (this.syncTimer != null) {
            window.clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        window.removeEventListener('popstate', this.handleNavigation);
        document.removeEventListener('yt-navigate-finish', this.handleNavigation, true);
        this.enabled = false;
        if (!isSiteHost('youtube')) return;
        pushYouTubeOriginalAudioConfig({ enabled: false });
    }

    updateSettings(settings: unknown) {
        const record = settings as Record<string, unknown> | undefined;
        if (!record) return;

        const ytConfig = record.yt_config as YTConfig | undefined;
        if (ytConfig) {
            this.config = { ...ytConfig };
        }

        if (this.enabled) {
            this.scheduleSync(0);
        }
    }

    private scheduleSync(delay: number) {
        if (!this.enabled || !isSiteHost('youtube')) return;
        if (this.syncTimer != null) {
            window.clearTimeout(this.syncTimer);
        }
        this.syncTimer = window.setTimeout(() => {
            this.syncTimer = null;
            this.syncCurrentPage();
        }, delay);
    }

    private syncCurrentPage() {
        if (!this.enabled || !isSiteHost('youtube')) return;

        const shouldEnable = this.config.alwaysUseOriginalAudio === true && this.isSupportedPage();
        if (shouldEnable) {
            installYouTubeOriginalAudioBridge();
            ensureYouTubeOriginalAudioScriptInjected();
        }

        pushYouTubeOriginalAudioConfig({ enabled: shouldEnable });
    }

    private isSupportedPage() {
        const path = window.location.pathname;
        return path === '/watch' || path.startsWith('/shorts/');
    }
}
