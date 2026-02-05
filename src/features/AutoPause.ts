import { CrossTabSync } from '../lib/CrossTabSync';
import type { Feature } from './Feature';

type LastFocusedState = {
    id: string;
    timestamp: number;
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

    // State
    private currentVideo: HTMLVideoElement | null = null;
    private lastFocused: LastFocusedState | null = null;

    // Bound handler (for proper removal)
    private boundOnPlay: ((this: HTMLVideoElement) => void) | null = null;

    // Config
    private readonly STORAGE_KEY = 'last_focused_window';
    private readonly SITES = ['bilibili.com', 'youtube.com'];

    constructor() {
        // 1. Message Handler (from other tabs)
        this.sync.onMessage((msg) => {
            if (!this.enabled) return;
            if (msg.type === 'PLAY_STARTED') {
                this.handleRemotePlay();
            }
        });

        // 2. Storage Listener (for lastFocused state sync)
        chrome.storage.onChanged.addListener((changes) => {
            if (changes[this.STORAGE_KEY]) {
                this.lastFocused = changes[this.STORAGE_KEY].newValue;
            }
        });

        // Initial fetch
        chrome.storage.local.get([this.STORAGE_KEY], (res) => {
            if (res[this.STORAGE_KEY]) {
                this.lastFocused = res[this.STORAGE_KEY];
            }
        });
    }

    mount() {
        // Site Check (Strict Parity)
        const hostname = window.location.hostname;
        if (!this.SITES.some(site => hostname.includes(site))) {
            return; // Do not run on unsupported sites
        }

        this.enabled = true;
        this.initFocusListeners();
        this.initVideoDetection();

        if (document.hasFocus()) {
            this.claimFocus();
        }
    }

    unmount() {
        this.enabled = false;
        this.removeFocusListeners();
        this.cleanupVideo();
    }

    updateSettings(settings: any) { }

    // --- Video Detection (Strict Port) ---

    private initVideoDetection() {
        const selectors: Record<string, string> = {
            'bilibili.com': '#bilibili-player',
            'youtube.com': '#movie_player'
        };

        const hostname = window.location.hostname;
        const key = Object.keys(selectors).find(k => hostname.includes(k));
        if (!key) return;

        const containerSelector = selectors[key];

        this.waitForElement(containerSelector, (container) => {
            // Observer for dynamic video changes (e.g., next episode)
            const observer = new MutationObserver(() => {
                const video = container.querySelector('video');
                if (video) this.setupVideo(video);
            });
            observer.observe(container, { childList: true, subtree: true });

            // Initial Check
            const initialVideo = container.querySelector('video');
            if (initialVideo) this.setupVideo(initialVideo);
        });
    }

    private waitForElement(selector: string, callback: (el: Element) => void) {
        const el = document.querySelector(selector);
        if (el) {
            callback(el);
            return;
        }

        const observer = new MutationObserver((_, obs) => {
            const found = document.querySelector(selector);
            if (found) {
                obs.disconnect();
                callback(found);
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    private setupVideo(video: HTMLVideoElement) {
        // Duplicate Check (Critical!)
        if (video === this.currentVideo) return;

        // Cleanup old listener
        this.cleanupVideo();

        this.currentVideo = video;

        // Create bound handler with correct `this` context (the video element)
        // Using arrow function wrapper to capture `this` (the class) while
        // still being able to remove the listener later.
        this.boundOnPlay = this.onPlay.bind(this);
        this.currentVideo.addEventListener('playing', this.boundOnPlay);
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

        // 1. If hidden -> Force Pause
        if (document.visibilityState !== 'visible') {
            this.currentVideo.pause();
            return;
        }

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

        // Self-Protection: If I have focus, ignore and re-claim
        if (document.hasFocus()) {
            this.claimFocus();
            return;
        }

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
        if (Date.now() - this.lastFocused.timestamp > 10000) return false; // 10s expiry
        return true;
    }

    private notifyOthers() {
        this.sync.send({
            type: 'PLAY_STARTED',
            timestamp: Date.now()
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
