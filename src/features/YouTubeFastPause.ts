import type { Feature } from './Feature';
import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';
import { getFastPauseConfig, isSiteHost } from '../lib/siteProfiles';
import {
    eventHitsVideoSurface,
    eventMatchesSelectors,
    eventTargetsProtectedCursor,
    eventTargetsGenericInteractive,
    eventTargetsSelectableText,
} from '../lib/pointerTargets';

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

    private isClickOnControls(e: Event): boolean {
        const controlSelectors = this.config?.controlSelectors || [];
        if (eventMatchesSelectors(e, controlSelectors)) return true;

        // Future-proof for dynamic YouTube UI components: treat generic interactive
        // controls as player controls so fast-pause will not swallow their clicks.
        return eventTargetsGenericInteractive(e);
    }

    private shouldIgnorePointerAction(e: Event): boolean {
        return this.isClickOnControls(e)
            || eventTargetsSelectableText(e)
            || eventTargetsProtectedCursor(e);
    }

    private isInVideoArea(e: Event): boolean {
        // YouTube uses a strict "video surface only" hit test.
        // Reason: custom overlays and extension UIs are common on top of the
        // player, and container-level matching causes false play/pause toggles.
        return eventHitsVideoSurface(e, this.videoCtrl.video);
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

            if (!this.isInVideoArea(e)) return false;
            if (this.shouldIgnorePointerAction(e)) return false;

            return true;
        }, { priority: 100 });

        // --- 2. Fast Pause (Mousedown) ---
        this.input.on('mousedown', 'ytfp-fast-pause', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            if (event.button !== 0) return false;

            if (!this.isInVideoArea(event)) return false;
            if (this.shouldIgnorePointerAction(event)) return false;

            this.videoCtrl.togglePlay();
            return true;
        }, { priority: 90 });

        // --- 3. Block Subsequent Click ---
        this.input.on('click', 'ytfp-block-click', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            if (event.button !== 0) return false;

            if (!this.isInVideoArea(event)) return false;
            if (this.shouldIgnorePointerAction(event)) return false;

            return true;
        }, { priority: 90 });

    }

    unmount() {
        this.enabled = false;
        if (this.listenersRegistered) {
            this.input.off('ytfp-prevent');
            this.input.off('ytfp-fast-pause');
            this.input.off('ytfp-block-click');
            this.listenersRegistered = false;
        }
    }

    updateSettings(_settings: unknown) { }
}
