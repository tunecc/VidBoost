import type { Feature } from './Feature';
import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';

export class BilibiliFastPause implements Feature {
    private input = InputManager.getInstance();
    private videoCtrl = VideoController.getInstance();
    private enabled = false;

    // Direct port from original script
    private isClickOnControls(target: HTMLElement): boolean {
        const controlSelectors = [
            '.bpx-player-control-wrap', // Bottom controls
            '.bpx-player-control-bottom',
            '.bpx-player-control-top',
            '.bpx-player-sending-area', // Danmaku input area
            '.bpx-player-video-btn',    // Various buttons
            '.bpx-player-dm-input',     // Input box
            '.bpx-player-tooltip',      // Tooltips
            '.bpx-player-context-menu', // Right click menu
            '.bpx-player-ending-panel', // Ending panel
            '.bpx-player-popup',        // Popups
            '.bpx-player-cmd-dm-wrap'   // Danmaku wrap
        ];
        return controlSelectors.some(selector => target.closest(selector) !== null);
    }

    mount() {
        if (!window.location.host.includes('bilibili.com')) return;
        this.enabled = true;

        // --- 1. Intercept Double Click (Prevent Fullscreen) ---
        this.input.on('dblclick', 'bnd-prevent', (e) => {
            if (!this.enabled) return false;

            const target = e.target as HTMLElement;
            // Check if inside video wrap
            if (!target.closest('.bpx-player-video-wrap') && target.tagName !== 'VIDEO') return false;

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

            // Scope check: Must be in video area
            if (!target.closest('.bpx-player-video-wrap') && target.tagName !== 'VIDEO') return false;

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

            // Scope check
            if (!target.closest('.bpx-player-video-wrap') && target.tagName !== 'VIDEO') return false;

            // Safety check
            if (this.isClickOnControls(target)) return false;

            // Block it!
            return true;
        }, { priority: 90 });
    }

    unmount() {
        this.enabled = false;
        this.input.off('bnd-prevent');
        this.input.off('bnd-fast-pause');
        this.input.off('bnd-block-click');
    }

    updateSettings(settings: any) { }
}
