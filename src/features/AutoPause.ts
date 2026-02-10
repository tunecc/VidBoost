import { CrossTabSync } from '../lib/CrossTabSync';
import type { Feature } from './Feature';
import { getSettings, onSettingsChanged, onStorageKeysChanged, DEFAULT_SETTINGS } from '../lib/settings-content';
import { normalizeDomain, normalizeDomainList } from '../lib/domain';
import { getAutoPauseContainerSelectorsForHost } from '../lib/siteProfiles';

type LastFocusedState = {
    id: string;
    timestamp: number;
};

type CrossTabStorageState = {
    last_focused_window?: LastFocusedState;
    last_play_window?: LastFocusedState;
};

/**
 * AutoPause Feature
 * 
 * Strict port of video-auto-pause.user.js
 * Only allows the focused tab to play video. Other tabs are paused.
 */
export class AutoPause implements Feature {
    private sync = new CrossTabSync();
    private enabled = false;
    private active = false;

    // State
    private currentVideo: HTMLVideoElement | null = null;
    private lastFocused: LastFocusedState | null = null;
    private containerObserver: MutationObserver | null = null;
    private rootObserver: MutationObserver | null = null;
    private trackedContainer: HTMLElement | null = null;
    private siteContainerSelectors: string[] | null = null;
    private rebindRaf: number | null = null;

    // Bound handler (for proper removal)
    private boundOnPlay: ((this: HTMLVideoElement) => void) | null = null;

    // Config
    private readonly STORAGE_KEY = 'last_focused_window';
    private readonly PLAY_KEY = 'last_play_window';
    private siteScope: 'all' | 'selected' = 'all';
    private siteAllow: Record<string, boolean | undefined> = {
        'youtube.com': true,
        'bilibili.com': true
    };
    private customSites: string[] = [];

    constructor() {
        // 1. Message Handler (from other tabs)
        this.sync.onMessage((msg) => {
            if (!this.enabled) return;
            if (msg.type === 'PLAY_STARTED') {
                this.handleRemotePlay();
            }
        });

        // 2. Storage Listener (for lastFocused/lastPlay state sync)
        onStorageKeysChanged<CrossTabStorageState>(
            [this.STORAGE_KEY, this.PLAY_KEY],
            (changes) => {
                if (changes[this.STORAGE_KEY]) {
                    this.lastFocused = changes[this.STORAGE_KEY] || null;
                }
                if (changes[this.PLAY_KEY] && this.enabled) {
                    const payload = changes[this.PLAY_KEY];
                    if (payload && payload.id !== this.sync.myId) {
                        this.handleRemotePlay();
                    }
                }
            }
        );

        // Initial fetch
        chrome.storage.local.get([this.STORAGE_KEY, this.PLAY_KEY], (res) => {
            if (res[this.STORAGE_KEY]) {
                this.lastFocused = res[this.STORAGE_KEY];
            }
            const lastPlay = res[this.PLAY_KEY];
            if (lastPlay && lastPlay.id !== this.sync.myId) {
                this.handleRemotePlay();
            }
        });

        getSettings(['ap_scope', 'ap_sites', 'ap_custom_sites']).then((res) => {
            this.siteScope = res.ap_scope || DEFAULT_SETTINGS.ap_scope;
            this.siteAllow = { ...this.siteAllow, ...(res.ap_sites || {}) };
            this.customSites = Array.isArray(res.ap_custom_sites)
                ? normalizeDomainList(res.ap_custom_sites)
                : [];
            this.applyPolicy();
        });

        onSettingsChanged((changes) => {
            let policyChanged = false;
            if (changes.ap_scope !== undefined) {
                this.siteScope = changes.ap_scope || DEFAULT_SETTINGS.ap_scope;
                policyChanged = true;
            }
            if (changes.ap_sites !== undefined) {
                this.siteAllow = { ...this.siteAllow, ...(changes.ap_sites || {}) };
                policyChanged = true;
            }
            if (changes.ap_custom_sites !== undefined) {
                this.customSites = Array.isArray(changes.ap_custom_sites)
                    ? normalizeDomainList(changes.ap_custom_sites)
                    : [];
                policyChanged = true;
            }
            if (policyChanged) this.applyPolicy();
        });
    }

    mount() {
        this.enabled = true;
        this.applyPolicy();
    }

    unmount() {
        this.enabled = false;
        this.stop();
    }

    updateSettings(_settings: unknown) { }

    private applyPolicy() {
        if (!this.enabled) return;
        const allowed = this.isSiteAllowed();
        if (allowed && !this.active) {
            this.start();
        } else if (!allowed && this.active) {
            this.stop();
        }
    }

    private start() {
        this.active = true;
        this.initFocusListeners();
        // Site-specific detection for core platforms to avoid preview videos
        if (this.initSiteSpecificTracking()) {
            // handled by container observer
        } else {
            // Generic Video Detection (Global Capture)
            document.addEventListener('play', this.handleCapturePhase, true);
            document.addEventListener('playing', this.handleCapturePhase, true);
        }

        if (document.hasFocus()) {
            this.claimFocus();
        }
    }

    private stop() {
        this.active = false;
        this.removeFocusListeners();
        document.removeEventListener('play', this.handleCapturePhase, true);
        document.removeEventListener('playing', this.handleCapturePhase, true);
        this.teardownContainerTracking();
        this.cleanupVideo();
    }

    private isSiteAllowed(): boolean {
        if (this.siteScope === 'all') return true;
        const host = normalizeDomain(window.location.host) || window.location.host.toLowerCase();
        const allowedByBuiltin = Object.keys(this.siteAllow).some((key) => {
            if (this.siteAllow[key] === false) return false;
            const normalizedKey = normalizeDomain(key) || key.toLowerCase();
            return host === normalizedKey || host.endsWith(`.${normalizedKey}`);
        });
        if (allowedByBuiltin) return true;
        return this.customSites.some((domain) => host === domain || host.endsWith(`.${domain}`));
    }

    // --- Generic Video Detection ---

    private handleCapturePhase = (e: Event) => {
        const target = e.target as HTMLVideoElement;
        if (target && target.tagName === 'VIDEO') {
            if (this.isPreviewVideo(target)) return;
            this.setupVideo(target);
        }
    }

    private initSiteSpecificTracking(): boolean {
        if (!this.isSiteAllowed()) return false;
        const selectors = getAutoPauseContainerSelectorsForHost(window.location.host);

        if (!selectors) return false;

        this.siteContainerSelectors = selectors;
        this.rebindContainer();

        this.rootObserver?.disconnect();
        this.rootObserver = new MutationObserver(() => {
            this.scheduleContainerRebind();
        });

        this.rootObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        return true;
    }

    private findContainer(selectors: string[]): HTMLElement | null {
        const find = () => selectors.map(s => document.querySelector(s)).find(Boolean) as HTMLElement | null;
        return find();
    }

    private scheduleContainerRebind() {
        if (this.rebindRaf !== null) return;
        this.rebindRaf = window.requestAnimationFrame(() => {
            this.rebindRaf = null;
            this.rebindContainer();
        });
    }

    private rebindContainer() {
        if (!this.siteContainerSelectors) return;

        const container = this.findContainer(this.siteContainerSelectors);
        if (container === this.trackedContainer) return;

        this.trackedContainer = container;
        this.containerObserver?.disconnect();
        this.containerObserver = null;

        if (!container) {
            this.cleanupVideo();
            return;
        }

        this.observeContainer(container);
        const initialVideo = container.querySelector('video');
        if (initialVideo) this.setupVideo(initialVideo as HTMLVideoElement);
    }

    private observeContainer(container: HTMLElement) {
        this.containerObserver?.disconnect();
        this.containerObserver = new MutationObserver(() => {
            if (!container.isConnected) {
                this.scheduleContainerRebind();
                return;
            }
            const video = container.querySelector('video');
            if (video) this.setupVideo(video as HTMLVideoElement);
        });

        this.containerObserver.observe(container, {
            childList: true,
            subtree: true
        });
    }

    private teardownContainerTracking() {
        if (this.containerObserver) {
            this.containerObserver.disconnect();
            this.containerObserver = null;
        }
        if (this.rootObserver) {
            this.rootObserver.disconnect();
            this.rootObserver = null;
        }
        if (this.rebindRaf !== null) {
            cancelAnimationFrame(this.rebindRaf);
            this.rebindRaf = null;
        }
        this.siteContainerSelectors = null;
        this.trackedContainer = null;
    }

    private isPreviewVideo(video: HTMLVideoElement): boolean {
        // 1) Common hover preview containers (YouTube/Bilibili-like)
        const previewSelectors = [
            'ytd-moving-thumbnail-renderer',
            'ytd-thumbnail',
            '.ytd-moving-thumbnail-renderer',
            '.bili-video-card__image',
            '.video-card__content',
            '.bili-video-card'
        ];
        if (previewSelectors.some(sel => video.closest(sel) !== null)) return true;

        // 2) Heuristic: muted + no controls + small size => likely preview
        const rect = video.getBoundingClientRect();
        const small = rect.width < 240 || rect.height < 135;
        if (video.muted && video.volume === 0 && !video.controls && small) return true;

        return false;
    }

    private setupVideo(video: HTMLVideoElement) {
        if (video === this.currentVideo) return;
        this.cleanupVideo(); // Clean old listeners

        this.currentVideo = video;

        // We don't need 'playing' listener for detection anymore since we capture it globally
        // But we need it for the logic logic (onPlay)
        this.boundOnPlay = this.onPlay.bind(this);
        this.currentVideo.addEventListener('playing', this.boundOnPlay);

        // If it's already playing when we discovered it
        if (!this.currentVideo.paused) {
            this.onPlay();
        }
    }

    private cleanupVideo() {
        if (this.currentVideo && this.boundOnPlay) {
            this.currentVideo.removeEventListener('playing', this.boundOnPlay);
        }
        this.currentVideo = null;
        this.boundOnPlay = null;
    }

    // --- Core Logic (Direct Port) ---

    private onPlay() {
        if (!this.enabled || !this.currentVideo) return;

        // 1. If hidden -> Force Pause (REMOVED: User requested background playback support)
        // if (document.visibilityState !== 'visible') {
        //     this.currentVideo.pause();
        //     return;
        // }

        // 2. If focused -> I am King. Claim it.
        if (document.hasFocus()) {
            this.claimFocus();
            this.notifyOthers();
            return;
        }

        // 3. Not focused, but am I the Last Focused Window?
        if (this.isLastFocusedWindow()) {
            this.notifyOthers();
            return;
        }

        // 4. Neither focused nor last focused -> Pause.
        this.currentVideo.pause();
    }

    private handleRemotePlay() {
        if (!this.enabled) return;

        // Foreground has priority: never pause if this tab is focused
        if (document.hasFocus()) {
            this.claimFocus();
            return;
        }

        // Self-Protection: If I have focus, ignore and re-claim
        // Self-Protection: If I am last focused AND playing, ignore
        if (this.isLastFocusedWindow() && this.currentVideo && !this.currentVideo.paused) {
            return;
        }

        // Otherwise, yield
        if (this.currentVideo && !this.currentVideo.paused) {
            this.currentVideo.pause();
        }
    }

    // --- Helpers ---

    private claimFocus = () => {
        if (!this.enabled) return;

        const newState: LastFocusedState = {
            id: this.sync.myId,
            timestamp: Date.now()
        };

        this.lastFocused = newState; // Optimistic local update
        chrome.storage.local.set({ [this.STORAGE_KEY]: newState });
    }

    private isLastFocusedWindow(): boolean {
        if (!this.lastFocused) return false;
        if (this.lastFocused.id !== this.sync.myId) return false;
        return true;
    }

    private notifyOthers() {
        this.sync.send({
            type: 'PLAY_STARTED',
            timestamp: Date.now()
        });
        // Storage fallback: ensures cross-tab sync even if runtime message is missed
        chrome.storage.local.set({
            [this.PLAY_KEY]: {
                id: this.sync.myId,
                timestamp: Date.now()
            }
        });
    }

    // --- Listeners ---

    private initFocusListeners() {
        window.addEventListener('focus', this.claimFocus);
        document.addEventListener('click', this.handleDocumentClick);
    }

    private removeFocusListeners() {
        window.removeEventListener('focus', this.claimFocus);
        document.removeEventListener('click', this.handleDocumentClick);
    }

    private handleDocumentClick = () => {
        if (document.hasFocus()) this.claimFocus();
    }
}
