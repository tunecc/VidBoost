import type { Feature } from './Feature';
import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';
import { getFastPauseConfig, isSiteHost } from '../lib/siteProfiles';

/**
 * YouTubeFastPause
 * 
 * Experimental feature for YouTube:
 * - Prevent double-click fullscreen
 * - Fast pause on mousedown (instant response)
 * 
 * Isolated from Bilibili version to avoid affecting stable code.
 */
export class YouTubeFastPause implements Feature {
    private input = InputManager.getInstance();
    private videoCtrl = VideoController.getInstance();
    private config = getFastPauseConfig('youtube');
    private enabled = false;
    private listenersRegistered = false;

    private isClickOnControls(target: HTMLElement): boolean {
        return (this.config?.controlSelectors || []).some((selector) => target.closest(selector) !== null);
    }

    private isInVideoArea(target: HTMLElement): boolean {
        if (target.tagName === 'VIDEO') return true;
        return (this.config?.videoAreaSelectors || []).some((selector) => target.closest(selector) !== null);
    }

    mount() {
        if (!isSiteHost('youtube')) return;
        if (!this.config) return;
        if (this.enabled) return;
        this.enabled = true;

        if (this.listenersRegistered) return;
        this.listenersRegistered = true;

        // --- 1. Intercept Double Click (Prevent Fullscreen) ---
        this.input.on('dblclick', 'ytfp-prevent', (e) => {
            if (!this.enabled) return false;

            const target = e.target as HTMLElement;
            if (!this.isInVideoArea(target)) return false;
            if (this.isClickOnControls(target)) return false;

            return true;
        }, { priority: 100 });

        // --- 2. Fast Pause (Mousedown) ---
        this.input.on('mousedown', 'ytfp-fast-pause', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            if (event.button !== 0) return false;

            const target = event.target as HTMLElement;

            if (!this.isInVideoArea(target)) return false;
            if (this.isClickOnControls(target)) return false;

            this.videoCtrl.togglePlay();
            return true;
        }, { priority: 90 });

        // --- 3. Block Subsequent Click ---
        this.input.on('click', 'ytfp-block-click', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            if (event.button !== 0) return false;

            const target = event.target as HTMLElement;

            if (!this.isInVideoArea(target)) return false;
            if (this.isClickOnControls(target)) return false;

            return true;
        }, { priority: 90 });

    }

    unmount() {
        this.enabled = false;
    }

    updateSettings(_settings: unknown) { }
}
