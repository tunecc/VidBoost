import type { Feature } from './Feature';
import { VideoController } from '../lib/VideoController';
import { isSiteHost } from '../lib/siteProfiles';
import { DEFAULT_SETTINGS, type Settings, type YTConfig } from '../lib/settings';

const STYLE_ID = 'vb-yt-bottom-progress-style';
const ROOT_ID = 'vb-yt-bottom-progress';
const FILL_ID = 'vb-yt-bottom-progress-fill';
const SYNC_INTERVAL_MS = 250;
const MIN_PROGRESS_HEIGHT = 1;
const MAX_PROGRESS_HEIGHT = 20;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export class YouTubeBottomProgress implements Feature {
    private enabled = false;
    private config: YTConfig = {};
    private syncInterval: number | null = null;
    private unsubscribeVideo: (() => void) | null = null;
    private rootEl: HTMLDivElement | null = null;
    private fillEl: HTMLDivElement | null = null;
    private styleEl: HTMLStyleElement | null = null;

    private readonly videoController = VideoController.getInstance();
    private readonly handleNavigation = () => {
        if (!this.enabled) return;
        this.sync();
        window.setTimeout(() => {
            this.sync();
        }, SYNC_INTERVAL_MS);
    };

    mount() {
        if (!isSiteHost('youtube')) return;
        if (this.enabled) return;

        this.enabled = true;
        this.ensureStyle();
        this.ensureProgressElements();
        this.unsubscribeVideo = this.videoController.subscribe(() => {
            this.sync();
        });

        window.addEventListener('popstate', this.handleNavigation);
        document.addEventListener('yt-navigate-finish', this.handleNavigation, true);

        this.syncInterval = window.setInterval(() => {
            this.sync();
        }, SYNC_INTERVAL_MS);

        this.sync();
    }

    unmount() {
        if (this.syncInterval != null) {
            window.clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        this.unsubscribeVideo?.();
        this.unsubscribeVideo = null;

        window.removeEventListener('popstate', this.handleNavigation);
        document.removeEventListener('yt-navigate-finish', this.handleNavigation, true);

        this.rootEl?.remove();
        this.rootEl = null;
        this.fillEl = null;

        this.styleEl?.remove();
        this.styleEl = null;

        this.enabled = false;
    }

    updateSettings(settings: unknown) {
        const record = settings as Partial<Settings> | undefined;
        if (!record) return;

        const ytConfig = record.yt_config as YTConfig | undefined;
        if (ytConfig) {
            this.config = { ...ytConfig };
        }

        if (this.enabled) {
            this.applyProgressStyle();
            this.sync();
        }
    }

    private sync() {
        if (!this.enabled || !isSiteHost('youtube')) return;

        const player = this.getPlayerElement();
        if (!player) {
            this.rootEl?.remove();
            return;
        }

        const root = this.ensureProgressElements();
        if (!root) return;

        if (root.parentElement !== player) {
            player.appendChild(root);
        }

        this.applyProgressStyle();

        const video = this.videoController.video;
        const duration = video?.duration ?? 0;
        const currentTime = video?.currentTime ?? 0;
        const canRender = Number.isFinite(duration) && duration > 0 && Number.isFinite(currentTime);
        const progressPercent = canRender
            ? clamp((currentTime / duration) * 100, 0, 100)
            : 0;
        const isLive = Boolean(player.querySelector('.ytp-live'));

        root.dataset.live = isLive ? '1' : '0';
        root.dataset.ready = canRender ? '1' : '0';

        if (this.fillEl) {
            this.fillEl.style.width = `${progressPercent}%`;
        }
    }

    private getPlayerElement() {
        const player = document.querySelector<HTMLElement>('#movie_player');
        if (player) return player;

        return this.videoController.video?.closest?.('#movie_player') as HTMLElement | null;
    }

    private applyProgressStyle() {
        if (!this.rootEl) return;

        const fallbackHeight = DEFAULT_SETTINGS.yt_config.bottomProgressHeight ?? 2;
        const requestedHeight = Number(this.config.bottomProgressHeight ?? fallbackHeight);
        const normalizedHeight = Number.isFinite(requestedHeight)
            ? clamp(requestedHeight, MIN_PROGRESS_HEIGHT, MAX_PROGRESS_HEIGHT)
            : fallbackHeight;

        this.rootEl.style.setProperty('--vb-yt-bottom-progress-height', `${normalizedHeight}px`);
    }

    private ensureProgressElements() {
        if (this.rootEl && this.fillEl) {
            return this.rootEl;
        }

        const existingRoot = document.getElementById(ROOT_ID);
        if (existingRoot instanceof HTMLDivElement) {
            this.rootEl = existingRoot;
            const existingFill = existingRoot.querySelector<HTMLDivElement>(`#${FILL_ID}`);
            this.fillEl = existingFill ?? null;
        }

        if (!this.rootEl) {
            this.rootEl = document.createElement('div');
            this.rootEl.id = ROOT_ID;
            this.rootEl.dataset.live = '0';
            this.rootEl.dataset.ready = '0';
            this.rootEl.setAttribute('aria-hidden', 'true');
        }

        if (!this.fillEl) {
            this.fillEl = document.createElement('div');
            this.fillEl.id = FILL_ID;
            this.rootEl.appendChild(this.fillEl);
        }

        return this.rootEl;
    }

    private ensureStyle() {
        const existingStyle = document.getElementById(STYLE_ID);
        if (existingStyle instanceof HTMLStyleElement) {
            this.styleEl = existingStyle;
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${ROOT_ID} {
                --vb-yt-bottom-progress-height: 2px;
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                height: var(--vb-yt-bottom-progress-height);
                background: rgba(255, 255, 255, 0.14);
                opacity: 0;
                overflow: hidden;
                pointer-events: none;
                z-index: 25;
                transition: opacity 0.18s ease;
            }

            #movie_player.ytp-autohide #${ROOT_ID}[data-live="0"][data-ready="1"] {
                opacity: 1;
            }

            #${FILL_ID} {
                display: block;
                width: 0%;
                height: 100%;
                background: linear-gradient(90deg, #ff0033 0%, #ff2a8a 100%);
                border-top-right-radius: calc(var(--vb-yt-bottom-progress-height) / 2);
                border-bottom-right-radius: calc(var(--vb-yt-bottom-progress-height) / 2);
                transition: width 0.16s linear;
            }
        `;

        (document.head || document.documentElement).appendChild(style);
        this.styleEl = style;
    }
}
