import type { Feature } from './Feature';
import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';

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
    private enabled = false;

    // YouTube control selectors to exclude from click handling
    private isClickOnControls(target: HTMLElement): boolean {
        const controlSelectors = [
            '.ytp-chrome-bottom',           // Bottom control bar
            '.ytp-chrome-top',              // Top bar (title, etc)
            '.ytp-settings-menu',           // Settings popup
            '.ytp-popup',                   // Any popup
            '.ytp-tooltip',                 // Tooltips
            '.ytp-button',                  // Any button
            '.ytp-menuitem',                // Menu items
            '.ytp-panel',                   // Panels (quality, speed, etc)
            '.ytp-ce-element',              // End screen elements
            '.ytp-iv-player-content',       // Info cards
            '.ytp-progress-bar-container',  // Progress bar
            '.ytp-scrubber-container',      // Scrubber
            '.ytp-volume-panel',            // Volume slider
            '.ytp-right-controls',          // Right side controls
            '.ytp-left-controls',           // Left side controls
            '.annotation',                  // Annotations
            '.ytp-spinner'                  // Loading spinner
        ];
        return controlSelectors.some(selector => target.closest(selector) !== null);
    }

    private isInVideoArea(target: HTMLElement): boolean {
        // YouTube uses #movie_player as the main container
        // The actual clickable video area is .html5-video-container
        return target.closest('#movie_player') !== null ||
            target.closest('.html5-video-container') !== null ||
            target.tagName === 'VIDEO';
    }

    mount() {
        if (!window.location.host.includes('youtube.com')) return;
        this.enabled = true;

        // --- 1. Intercept Double Click (Prevent Fullscreen) ---
        this.input.on('dblclick', 'ytfp-prevent', (e) => {
            if (!this.enabled) return false;

            const target = e.target as HTMLElement;
            if (!this.isInVideoArea(target)) return false;
            if (this.isClickOnControls(target)) return false;

            console.log('[YT-FastPause] Blocked double-click fullscreen');
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

            console.log('[YT-FastPause] Fast pause triggered');
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

        console.log('[YT-FastPause] Mounted');
    }

    unmount() {
        this.enabled = false;
        this.input.off('ytfp-prevent');
        this.input.off('ytfp-fast-pause');
        this.input.off('ytfp-block-click');
        console.log('[YT-FastPause] Unmounted');
    }

    updateSettings(settings: any) { }
}
