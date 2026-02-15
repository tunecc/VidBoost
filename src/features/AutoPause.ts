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
    private currentVideoScore = Number.NEGATIVE_INFINITY;
    private lastUserGestureVideo: HTMLVideoElement | null = null;
    private lastUserGestureAt = 0;

    // Bound handler (for proper removal)
    private boundOnPlay: ((this: HTMLVideoElement) => void) | null = null;

    // Config
    private readonly STORAGE_KEY = 'last_focused_window';
    private readonly PLAY_KEY = 'last_play_window';
    private readonly LAST_FOCUSED_TTL_MS = 10_000;
    private readonly PLAY_SIGNAL_TTL_MS = 5_000;
    private readonly SIGNAL_DEDUPE_TTL_MS = 500;
    private readonly PRIMARY_VIDEO_SCORE_THRESHOLD = 40;
    private readonly PRIMARY_VIDEO_SWITCH_MARGIN = 15;
    private readonly USER_GESTURE_TTL_MS = 1_500;
    private siteScope: 'all' | 'selected' = 'all';
    private siteAllow: Record<string, boolean | undefined> = {
        'youtube.com': true,
        'bilibili.com': true
    };
    private customSites: string[] = [];
    private allowBackgroundPlayback = DEFAULT_SETTINGS.ap_allow_background;
    private processedPlaySignals = new Map<string, number>();
    private readonly previewContextSelectors = [
        'ytd-moving-thumbnail-renderer',
        'ytd-thumbnail',
        '.ytd-moving-thumbnail-renderer',
        '.bili-card-inline-player',
        '.bili-video-card__image',
        '.video-card__content',
        '.bili-video-card',
        '.VYkpsb',
        '.LIna9b',
        '.KYaZsb',
        '.rtvRGe',
        '.hXY9cf'
    ];

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

        if (document.hasFocus() && this.shouldClaimFocusFromInteraction()) {
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
            this.setupVideo(target, true);
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
        this.tryAdoptBestVideoInContainer(container);
    }

    private observeContainer(container: HTMLElement) {
        this.containerObserver?.disconnect();
        this.containerObserver = new MutationObserver(() => {
            if (!container.isConnected) {
                this.scheduleContainerRebind();
                return;
            }
            this.tryAdoptBestVideoInContainer(container);
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

    private tryAdoptBestVideoInContainer(container: ParentNode): boolean {
        const videos = Array.from(container.querySelectorAll('video'));
        if (videos.length === 0) return false;

        let bestVideo: HTMLVideoElement | null = null;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (const video of videos) {
            const result = this.evaluateVideoCandidate(video);
            if (!result.isPrimary) continue;

            const score = result.score + (this.isActivelyPlaying(video) ? 8 : 0);
            if (score > bestScore) {
                bestScore = score;
                bestVideo = video;
            }
        }

        if (!bestVideo) return false;
        return this.setupVideo(bestVideo, this.isActivelyPlaying(bestVideo));
    }

    private setupVideo(video: HTMLVideoElement, triggerPlay = true): boolean {
        if (!video.isConnected) return false;
        const candidate = this.evaluateVideoCandidate(video);
        if (!candidate.isPrimary) return false;

        if (video === this.currentVideo) {
            this.currentVideoScore = candidate.score;
            if (triggerPlay && this.isActivelyPlaying(video)) this.onPlay();
            return true;
        }

        if (this.currentVideo) {
            const currentResult = this.evaluateVideoCandidate(this.currentVideo);
            this.currentVideoScore = currentResult.score;
            const keepCurrent =
                this.isActivelyPlaying(this.currentVideo) &&
                currentResult.score >= candidate.score + this.PRIMARY_VIDEO_SWITCH_MARGIN;
            if (keepCurrent) return false;
        }

        this.cleanupVideo();
        this.currentVideo = video;
        this.currentVideoScore = candidate.score;
        this.boundOnPlay = this.onPlay.bind(this);
        this.currentVideo.addEventListener('playing', this.boundOnPlay);
        if (triggerPlay && this.isActivelyPlaying(this.currentVideo)) this.onPlay();
        return true;
    }

    private cleanupVideo() {
        if (this.currentVideo && this.boundOnPlay) {
            this.currentVideo.removeEventListener('playing', this.boundOnPlay);
        }
        this.currentVideo = null;
        this.boundOnPlay = null;
        this.currentVideoScore = Number.NEGATIVE_INFINITY;
    }

    private evaluateVideoCandidate(video: HTMLVideoElement): { score: number; isPrimary: boolean } {
        const score = this.scoreVideoCandidate(video);
        return {
            score,
            isPrimary: score >= this.PRIMARY_VIDEO_SCORE_THRESHOLD
        };
    }

    private scoreVideoCandidate(video: HTMLVideoElement): number {
        if (!video.isConnected) return Number.NEGATIVE_INFINITY;

        const rect = video.getBoundingClientRect();
        const width = Math.max(0, rect.width);
        const height = Math.max(0, rect.height);
        const area = width * height;
        const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
        const areaRatio = area / viewportArea;

        let score = 0;

        if (this.isVideoElementVisible(video)) score += 8;
        else score -= 50;

        const onScreen =
            rect.right > 0 &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.top < window.innerHeight;
        if (onScreen) score += 6;
        else score -= 25;

        if (width >= 640 && height >= 360) score += 35;
        else if (width >= 320 && height >= 180) score += 22;
        else if (width >= 240 && height >= 135) score += 10;
        else score -= 35;

        if (areaRatio >= 0.25) score += 30;
        else if (areaRatio >= 0.1) score += 18;
        else if (areaRatio >= 0.04) score += 8;
        else score -= 24;

        if (video.controls) score += 10;
        if (!video.muted && video.volume > 0) score += 12;
        if (video.muted && video.volume === 0 && !video.controls) score -= 12;

        if (video.autoplay) score -= 8;
        if (video.loop) score -= 12;
        if (!video.controls && video.autoplay && video.muted && video.loop) score -= 28;
        if (video.preload === 'none') score -= 4;

        if (this.hasPreviewContext(video)) score -= 60;
        if (this.isLikelyDecorativeVideo(video, areaRatio)) score -= 45;

        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (duration > 0 && duration < 20 && (video.loop || video.muted)) score -= 12;
        if (duration > 120) score += 8;

        if (this.isActivelyPlaying(video)) score += 8;
        if (this.isRecentUserGestureVideo(video)) score += 35;
        if (this.isFullscreenVideo(video) || document.pictureInPictureElement === video) score += 45;

        return score;
    }

    private hasPreviewContext(video: HTMLVideoElement): boolean {
        return this.previewContextSelectors.some((selector) => video.closest(selector) !== null);
    }

    private isLikelyDecorativeVideo(video: HTMLVideoElement, areaRatio: number): boolean {
        if (this.hasPreviewContext(video)) return true;
        if (video.closest('header, footer, nav')) return true;
        if (areaRatio < 0.03 && video.muted && !video.controls) return true;
        if (areaRatio < 0.02 && (video.autoplay || video.loop)) return true;
        return false;
    }

    private isVideoElementVisible(video: HTMLVideoElement): boolean {
        const style = window.getComputedStyle(video);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const opacity = Number.parseFloat(style.opacity || '1');
        if (Number.isFinite(opacity) && opacity < 0.05) return false;
        return true;
    }

    private isRecentUserGestureVideo(video: HTMLVideoElement): boolean {
        if (!this.lastUserGestureVideo) return false;
        if (Date.now() - this.lastUserGestureAt > this.USER_GESTURE_TTL_MS) return false;
        return this.lastUserGestureVideo === video;
    }

    private captureUserGestureVideo(event: MouseEvent): void {
        const target = event.target as Element | null;
        const directTarget = target?.closest('video');
        const directVideo = directTarget instanceof HTMLVideoElement ? directTarget : null;
        if (directVideo) {
            this.lastUserGestureVideo = directVideo;
            this.lastUserGestureAt = Date.now();
            return;
        }

        const videos = Array.from(document.querySelectorAll('video'));
        let bestVideo: HTMLVideoElement | null = null;
        let bestArea = 0;
        for (const video of videos) {
            const rect = video.getBoundingClientRect();
            const withinX = event.clientX >= rect.left && event.clientX <= rect.right;
            const withinY = event.clientY >= rect.top && event.clientY <= rect.bottom;
            if (!withinX || !withinY) continue;
            const area = Math.max(0, rect.width) * Math.max(0, rect.height);
            if (area > bestArea) {
                bestArea = area;
                bestVideo = video;
            }
        }
        if (bestVideo) {
            this.lastUserGestureVideo = bestVideo;
            this.lastUserGestureAt = Date.now();
        }
    }

    private isFullscreenVideo(video: HTMLVideoElement): boolean {
        const fullscreen = document.fullscreenElement;
        if (!fullscreen) return false;
        return fullscreen === video || fullscreen.contains(video);
    }

    // --- Core Logic (Direct Port) ---

    private onPlay() {
        if (!this.enabled || !this.currentVideo) return;
        const currentResult = this.evaluateVideoCandidate(this.currentVideo);
        this.currentVideoScore = currentResult.score;
        if (!currentResult.isPrimary) return;

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

        // Background playback mode:
        // only focused tab or the current owner may continue.
        if (document.hasFocus()) {
            this.claimFocus();
            this.notifyOthers();
            return;
        }
        if (this.isLastFocusedWindow(true)) {
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
            if (this.shouldClaimFocusFromInteraction()) {
                this.claimFocus();
            }
            return;
        }

        if (
            this.allowBackgroundPlayback &&
            this.isLastFocusedWindow(true) &&
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

    private isLastFocusedWindow(ignoreFresh = false): boolean {
        if (!this.lastFocused) return false;
        if (!ignoreFresh && !this.isFreshFocusedState(this.lastFocused.timestamp)) return false;
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

    private shouldClaimFocusFromInteraction(): boolean {
        if (!this.allowBackgroundPlayback) return true;
        return !!(this.currentVideo && this.isActivelyPlaying(this.currentVideo));
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
        window.addEventListener('focus', this.handleWindowFocus);
        window.addEventListener('blur', this.handleWindowBlur);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        document.addEventListener('click', this.handleDocumentClick);
    }

    private removeFocusListeners() {
        window.removeEventListener('focus', this.handleWindowFocus);
        window.removeEventListener('blur', this.handleWindowBlur);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        document.removeEventListener('click', this.handleDocumentClick);
    }

    private handleWindowFocus = () => {
        if (!this.shouldClaimFocusFromInteraction()) return;
        this.claimFocus();
    }

    private handleDocumentClick = (event: MouseEvent) => {
        this.captureUserGestureVideo(event);
        if (document.hasFocus() && this.shouldClaimFocusFromInteraction()) this.claimFocus();
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
        if (document.visibilityState === 'visible' && document.hasFocus() && this.shouldClaimFocusFromInteraction()) {
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
