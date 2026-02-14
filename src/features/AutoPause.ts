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
 * Foreground-first playback coordination between tabs.
 * Supports optional background playback for the last focused tab.
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
    private globalCaptureAttached = false;

    // Bound handler (for proper removal)
    private boundOnPlay: ((this: HTMLVideoElement) => void) | null = null;

    // Config
    private readonly STORAGE_KEY = 'last_focused_window';
    private readonly PLAY_KEY = 'last_play_window';
    private readonly LAST_FOCUSED_TTL_MS = 10_000;
    private readonly PLAY_SIGNAL_TTL_MS = 5_000;
    private readonly SIGNAL_DEDUPE_TTL_MS = 500;
    private siteScope: 'all' | 'selected' = 'all';
    private siteAllow: Record<string, boolean | undefined> = {
        'youtube.com': true,
        'bilibili.com': true
    };
    private customSites: string[] = [];
    private allowBackgroundPlayback = DEFAULT_SETTINGS.ap_allow_background;
    private processedPlaySignals = new Map<string, number>();

    constructor() {
        // 1. Message Handler (from other tabs)
        this.sync.onMessage((msg) => {
            if (!this.enabled) return;
            if (msg.type === 'PLAY_STARTED') {
                this.handleIncomingPlaySignal({
                    id: msg.senderId,
                    timestamp: msg.timestamp
                });
            }
        });

        // 2. Storage Listener (for lastFocused/lastPlay state sync)
        onStorageKeysChanged<CrossTabStorageState>(
            [this.STORAGE_KEY, this.PLAY_KEY],
            (changes) => {
                if (Object.prototype.hasOwnProperty.call(changes, this.STORAGE_KEY)) {
                    this.lastFocused = this.parseSyncState(changes[this.STORAGE_KEY]);
                }
                if (!Object.prototype.hasOwnProperty.call(changes, this.PLAY_KEY)) return;
                const payload = this.parseSyncState(changes[this.PLAY_KEY]);
                if (payload) {
                    this.handleIncomingPlaySignal(payload);
                }
            }
        );

        // Initial fetch
        chrome.storage.local.get([this.STORAGE_KEY, this.PLAY_KEY], (res) => {
            this.lastFocused = this.parseSyncState(res[this.STORAGE_KEY]);
            const lastPlay = this.parseSyncState(res[this.PLAY_KEY]);
            if (lastPlay) this.handleIncomingPlaySignal(lastPlay);
        });

        getSettings(['ap_scope', 'ap_sites', 'ap_custom_sites', 'ap_allow_background']).then((res) => {
            this.siteScope = res.ap_scope || DEFAULT_SETTINGS.ap_scope;
            this.siteAllow = { ...this.siteAllow, ...(res.ap_sites || {}) };
            this.customSites = Array.isArray(res.ap_custom_sites)
                ? normalizeDomainList(res.ap_custom_sites)
                : [];
            this.allowBackgroundPlayback = res.ap_allow_background !== false;
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
            if (changes.ap_allow_background !== undefined) {
                this.allowBackgroundPlayback = changes.ap_allow_background !== false;
                this.pauseWhenBackgroundOrUnfocused();
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
        this.initSiteSpecificTracking();
        // Generic detection is a safety net before main player container is identified.
        this.updateGlobalCaptureListeners();

        if (document.hasFocus()) {
            this.claimFocus();
        }
    }

    private stop() {
        this.active = false;
        this.removeFocusListeners();
        this.detachGlobalCaptureListeners();
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
        if (!this.shouldUseGenericCapture()) return;
        const target = e.target as HTMLVideoElement;
        if (target && target.tagName === 'VIDEO') {
            if (this.isPreviewVideo(target)) return;
            this.setupVideo(target);
        }
    }

    private shouldUseGenericCapture(): boolean {
        if (!this.siteContainerSelectors) return true;
        return !this.trackedContainer;
    }

    private updateGlobalCaptureListeners() {
        if (!this.active) {
            this.detachGlobalCaptureListeners();
            return;
        }
        if (this.shouldUseGenericCapture()) {
            this.attachGlobalCaptureListeners();
            return;
        }
        this.detachGlobalCaptureListeners();
    }

    private attachGlobalCaptureListeners() {
        if (this.globalCaptureAttached) return;
        document.addEventListener('play', this.handleCapturePhase, true);
        document.addEventListener('playing', this.handleCapturePhase, true);
        this.globalCaptureAttached = true;
    }

    private detachGlobalCaptureListeners() {
        if (!this.globalCaptureAttached) return;
        document.removeEventListener('play', this.handleCapturePhase, true);
        document.removeEventListener('playing', this.handleCapturePhase, true);
        this.globalCaptureAttached = false;
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
        this.updateGlobalCaptureListeners();
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
            '.bili-card-inline-player',
            '.bili-video-card__image',
            '.video-card__content',
            '.bili-video-card',
            // Google search hover-preview cards
            '.VYkpsb',
            '.LIna9b',
            '.KYaZsb',
            '.rtvRGe',
            '.hXY9cf'
        ];
        if (previewSelectors.some(sel => video.closest(sel) !== null)) return true;

        // 2) Heuristic: muted + small inline auto/loop video is likely preview
        const rect = video.getBoundingClientRect();
        const small = rect.width < 240 || rect.height < 135;
        const likelyPreviewPlayback = video.autoplay || video.loop || video.preload === 'none';
        if (video.muted && !video.controls && small && likelyPreviewPlayback) return true;
        if (video.muted && video.volume === 0 && !video.controls && small) return true;

        return false;
    }

    private setupVideo(video: HTMLVideoElement) {
        // Guard all code paths (capture + container observer) against hover-preview videos.
        if (this.isPreviewVideo(video)) return;
        if (video === this.currentVideo) return;
        this.cleanupVideo(); // Clean old listeners

        this.currentVideo = video;

        // We don't need 'playing' listener for detection anymore since we capture it globally
        // But we need it for the logic logic (onPlay)
        this.boundOnPlay = this.onPlay.bind(this);
        this.currentVideo.addEventListener('playing', this.boundOnPlay);

        // If this video is already in active playback when discovered
        // (e.g. feature toggled on while video is running), run policy once.
        if (this.isActivelyPlaying(this.currentVideo)) {
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

        // Strict mode: background/non-focused playback is not allowed.
        if (!this.allowBackgroundPlayback) {
            if (document.visibilityState !== 'visible' || !document.hasFocus()) {
                this.currentVideo.pause();
                return;
            }
            this.claimFocus();
            this.notifyOthers();
            return;
        }

        // Background playback mode: current owner can continue in background.
        if (document.hasFocus()) {
            this.claimFocus();
            this.notifyOthers();
            return;
        }
        if (this.isLastFocusedWindow()) {
            this.notifyOthers();
            return;
        }
        if (this.currentVideo.paused) return;
        this.currentVideo.pause();
    }

    private handleRemotePlay() {
        if (!this.enabled) return;

        // Foreground has priority: focused + visible tab keeps control.
        if (document.visibilityState === 'visible' && document.hasFocus()) {
            this.claimFocus();
            return;
        }

        if (
            this.allowBackgroundPlayback &&
            this.isLastFocusedWindow() &&
            this.currentVideo &&
            !this.currentVideo.paused
        ) {
            return;
        }

        // Otherwise, always yield.
        if (this.currentVideo && !this.currentVideo.paused) {
            this.currentVideo.pause();
        }
    }

    private handleIncomingPlaySignal(payload: LastFocusedState) {
        if (!this.enabled) return;
        if (payload.id === this.sync.myId) return;
        if (!this.isFreshPlaySignal(payload.timestamp)) return;

        const signalKey = `${payload.id}:${payload.timestamp}`;
        if (this.isDuplicatePlaySignal(signalKey)) return;

        this.handleRemotePlay();
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
        if (!this.isFreshFocusedState(this.lastFocused.timestamp)) {
            this.lastFocused = null;
            return false;
        }
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

    private isActivelyPlaying(video: HTMLVideoElement): boolean {
        if (video.paused || video.ended) return false;
        if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
        return video.currentTime > 0;
    }

    private isPlayEventArbitrationMode(): boolean {
        return this.allowBackgroundPlayback;
    }

    private parseSyncState(raw: unknown): LastFocusedState | null {
        if (!raw || typeof raw !== 'object') return null;
        const state = raw as Partial<LastFocusedState>;
        if (typeof state.id !== 'string') return null;
        if (typeof state.timestamp !== 'number' || !Number.isFinite(state.timestamp)) return null;
        return {
            id: state.id,
            timestamp: state.timestamp
        };
    }

    private isFreshFocusedState(timestamp: number): boolean {
        const age = Date.now() - timestamp;
        return age >= 0 && age <= this.LAST_FOCUSED_TTL_MS;
    }

    private isFreshPlaySignal(timestamp: number): boolean {
        const age = Date.now() - timestamp;
        return age >= -1_000 && age <= this.PLAY_SIGNAL_TTL_MS;
    }

    private isDuplicatePlaySignal(key: string): boolean {
        const now = Date.now();
        this.pruneProcessedPlaySignals(now);
        if (this.processedPlaySignals.has(key)) return true;
        this.processedPlaySignals.set(key, now);
        return false;
    }

    private pruneProcessedPlaySignals(now: number) {
        for (const [key, ts] of this.processedPlaySignals) {
            if (now - ts > this.SIGNAL_DEDUPE_TTL_MS) {
                this.processedPlaySignals.delete(key);
            }
        }
    }

    // --- Listeners ---

    private initFocusListeners() {
        window.addEventListener('focus', this.claimFocus);
        window.addEventListener('blur', this.handleWindowBlur);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        document.addEventListener('click', this.handleDocumentClick);
    }

    private removeFocusListeners() {
        window.removeEventListener('focus', this.claimFocus);
        window.removeEventListener('blur', this.handleWindowBlur);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        document.removeEventListener('click', this.handleDocumentClick);
    }

    private handleDocumentClick = () => {
        if (document.hasFocus()) this.claimFocus();
    }

    private handleWindowBlur = () => {
        if (this.isPlayEventArbitrationMode()) return;
        // Clicking extension popup can blur the page while it is still visible.
        // Avoid pausing on blur-only transitions.
        if (document.visibilityState === 'hidden') {
            this.pauseWhenBackgroundOrUnfocused();
        }
    }

    private handleVisibilityChange = () => {
        if (this.isPlayEventArbitrationMode()) return;
        if (document.visibilityState === 'visible' && document.hasFocus()) {
            this.claimFocus();
        }
        this.pauseWhenBackgroundOrUnfocused();
    }

    private pauseWhenBackgroundOrUnfocused() {
        if (this.allowBackgroundPlayback) return;
        if (!this.enabled || !this.currentVideo || this.currentVideo.paused) return;
        if (document.visibilityState === 'hidden') {
            this.currentVideo.pause();
        }
    }
}
