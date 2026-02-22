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

    private getEventElements(e: Event): Element[] {
        const out: Element[] = [];
        const visited = new Set<Element>();

        const addElement = (node: EventTarget | null) => {
            if (!node) return;
            let element: Element | null = null;
            if (node instanceof Element) element = node;
            else if (node instanceof Node) element = node.parentElement;
            if (!element || visited.has(element)) return;
            visited.add(element);
            out.push(element);
        };

        addElement(e.target);
        const path = e.composedPath?.() || [];
        path.forEach((node) => addElement(node));
        return out;
    }

    private isClickOnControls(e: Event): boolean {
        const elements = this.getEventElements(e);
        const controlSelectors = this.config?.controlSelectors || [];
        const matchesSelectors = (selectors: string[]) =>
            elements.some((element) => selectors.some((selector) => element.closest(selector) !== null));

        if (matchesSelectors(controlSelectors)) return true;

        // Future-proof for dynamic YouTube UI components: treat generic interactive
        // controls as player controls so fast-pause will not swallow their clicks.
        return matchesSelectors([
            'button',
            'a[href]',
            '[role="button"]',
            '[role="menuitem"]',
            '[role="link"]',
            'input',
            'textarea',
            'select',
            'label',
            'summary',
            'details'
        ]);
    }

    private isInVideoArea(e: Event): boolean {
        const elements = this.getEventElements(e);
        if (elements.some((element) => element.tagName === 'VIDEO')) return true;
        return (this.config?.videoAreaSelectors || []).some((selector) =>
            elements.some((element) => element.closest(selector) !== null)
        );
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
            if (this.isClickOnControls(e)) return false;

            return true;
        }, { priority: 100 });

        // --- 2. Fast Pause (Mousedown) ---
        this.input.on('mousedown', 'ytfp-fast-pause', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            if (event.button !== 0) return false;

            if (!this.isInVideoArea(event)) return false;
            if (this.isClickOnControls(event)) return false;

            this.videoCtrl.togglePlay();
            return true;
        }, { priority: 90 });

        // --- 3. Block Subsequent Click ---
        this.input.on('click', 'ytfp-block-click', (e) => {
            if (!this.enabled) return false;
            const event = e as MouseEvent;

            if (event.button !== 0) return false;

            if (!this.isInVideoArea(event)) return false;
            if (this.isClickOnControls(event)) return false;

            return true;
        }, { priority: 90 });

    }

    unmount() {
        this.enabled = false;
    }

    updateSettings(_settings: unknown) { }
}
