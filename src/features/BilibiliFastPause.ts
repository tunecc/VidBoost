import type { Feature } from './Feature';
import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';
import { getFastPauseConfig, isSiteHost } from '../lib/siteProfiles';

export class BilibiliFastPause implements Feature {
    private input = InputManager.getInstance();
    private videoCtrl = VideoController.getInstance();
    private config = getFastPauseConfig('bilibili');
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
        if (!isSiteHost('bilibili')) return;
        if (!this.config) return;
        if (this.enabled) return;
        this.enabled = true;

        if (this.listenersRegistered) return;
        this.listenersRegistered = true;

        // --- 1. Intercept Double Click (Prevent Fullscreen) ---
        this.input.on('dblclick', 'bnd-prevent', (e) => {
            if (!this.enabled) return false;

            const target = e.target as HTMLElement;
            if (!this.isInVideoArea(target)) return false;

            // Stop default behavior (Fullscreen)
            return true;
        }, { priority: 100 });

        // --- 2. Fast Pause (Mousedown) ---
        // Trigger action immediately on press
        this.input.on('mousedown', 'bnd-fast-pause', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            // Only Left Click
            if (event.button !== 0) return false;

            const target = event.target as HTMLElement;

            if (!this.isInVideoArea(target)) return false;

            // Safety check: Don't trigger on controls
            if (this.isClickOnControls(target)) return false;

            // Action: Toggle Play/Pause via Controller
            this.videoCtrl.togglePlay();

            // Stop propagation to prevent Bilibili native mousedown logic
            return true;
        }, { priority: 90 });

        // --- 3. Block Subsequent Click ---
        // Since we handled the action on mousedown, we must kill the following click event
        // to prevent the native player from toggling it back (or doing other things).
        this.input.on('click', 'bnd-block-click', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            if (event.button !== 0) return false;

            const target = event.target as HTMLElement;

            if (!this.isInVideoArea(target)) return false;

            // Safety check
            if (this.isClickOnControls(target)) return false;

            // Block it!
            return true;
        }, { priority: 90 });
    }

    unmount() {
        this.enabled = false;
    }

    updateSettings(_settings: unknown) { }
}
