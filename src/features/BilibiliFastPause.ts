import type { Feature } from './Feature';
import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';
import { getFastPauseConfig, isSiteHost } from '../lib/siteProfiles';
import {
    eventMatchesSelectors,
    eventTargetsProtectedCursor,
    eventTargetsGenericInteractive,
    eventTargetsSelectableText,
    getEventElements
} from '../lib/pointerTargets';

export class BilibiliFastPause implements Feature {
    private input = InputManager.getInstance();
    private videoCtrl = VideoController.getInstance();
    private config = getFastPauseConfig('bilibili');
    private enabled = false;
    private listenersRegistered = false;

    private isClickOnControls(e: Event): boolean {
        const controlSelectors = this.config?.controlSelectors || [];
        if (eventMatchesSelectors(e, controlSelectors)) return true;
        return eventTargetsGenericInteractive(e);
    }

    private shouldIgnorePointerAction(e: Event): boolean {
        return this.isClickOnControls(e)
            || eventTargetsSelectableText(e)
            || eventTargetsProtectedCursor(e);
    }

    private isInVideoArea(e: Event): boolean {
        const elements = getEventElements(e);
        if (elements.some((element) => element.tagName === 'VIDEO')) return true;
        return (this.config?.videoAreaSelectors || []).some((selector) =>
            elements.some((element) => element.closest(selector) !== null)
        );
    }

    private blurActiveTypingElement() {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;

        const tag = active.tagName.toUpperCase();
        const isTypingElement = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)
            || active.isContentEditable
            || active.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"],[role="textbox"],[role="searchbox"]') !== null;

        if (!isTypingElement) return;

        active.blur();

        if (document.activeElement === active) {
            window.getSelection()?.removeAllRanges();
        }
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

            if (!this.isInVideoArea(e)) return false;
            if (this.shouldIgnorePointerAction(e)) return false;

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

            if (!this.isInVideoArea(event)) return false;

            // Safety check: Don't trigger on controls
            if (this.shouldIgnorePointerAction(event)) return false;

            // We stop Bilibili's native click flow below, so manually restore
            // the normal "click video => input loses focus" behavior.
            this.blurActiveTypingElement();

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

            if (!this.isInVideoArea(event)) return false;

            // Safety check
            if (this.shouldIgnorePointerAction(event)) return false;

            // Block it!
            return true;
        }, { priority: 90 });
    }

    unmount() {
        this.enabled = false;
        if (this.listenersRegistered) {
            this.input.off('bnd-prevent');
            this.input.off('bnd-fast-pause');
            this.input.off('bnd-block-click');
            this.listenersRegistered = false;
        }
    }

    updateSettings(_settings: unknown) { }
}
