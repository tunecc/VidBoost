/**
 * Centralized Input Manager
 * Handles all keyboard and mouse interactions to prevent conflicts and ensure performance.
 * Single event listener pattern.
 */

import { VideoController } from './VideoController';

type InputAction = (e: Event) => boolean | void;
type InputEventType = 'keydown' | 'mousedown' | 'click' | 'dblclick';

interface ActionListener {
    id: string;
    priority: number; // Higher number = executed first
    condition?: (e: Event) => boolean;
    handler: InputAction;
}

export class InputManager {
    private static instance: InputManager;
    private listeners: Record<InputEventType, ActionListener[]> = {
        'keydown': [],
        'mousedown': [],
        'click': [],
        'dblclick': []
    };
    private hasVideo = false;
    private lastVideoPresenceCheckAt = 0;
    private readonly VIDEO_PRESENCE_CHECK_INTERVAL = 1000;

    private constructor() {
        this.init();
    }

    public static getInstance(): InputManager {
        if (!InputManager.instance) {
            InputManager.instance = new InputManager();
        }
        return InputManager.instance;
    }

    private init() {
        if (typeof window === 'undefined') return;

        // Activate input handling only after a video is detected.
        const vc = VideoController.getInstance();
        vc.subscribe(() => {
            this.hasVideo = true;
            this.lastVideoPresenceCheckAt = Date.now();
        });

        // Bind core events
        const eventTypes: InputEventType[] = ['keydown', 'mousedown', 'click', 'dblclick'];
        eventTypes.forEach(eventType => {
            window.addEventListener(eventType, this.handleEvent.bind(this), { capture: true, passive: false });
        });
    }

    private isSupportedEventType(type: string): type is InputEventType {
        return type === 'keydown' || type === 'mousedown' || type === 'click' || type === 'dblclick';
    }



    /**
     * Determines if the target is an interactive element (input, editable, etc.)
     * where strictly video shortcuts should be disabled.
     */
    public isInteractive(target: EventTarget | null, path: EventTarget[] = []): boolean {
        const interactiveSelectors = [
            'input',
            'textarea',
            'select',
            '[contenteditable="true"]',
            '[contenteditable=""]',
            '[contenteditable="plaintext-only"]',
            '[role="textbox"]',
            '[role="searchbox"]'
        ].join(',');

        const candidates: Element[] = [];
        const visited = new Set<Element>();

        const addCandidate = (node: EventTarget | null) => {
            if (!node) return;
            let element: Element | null = null;
            if (node instanceof Element) element = node;
            else if (node instanceof Node) element = node.parentElement;
            if (!element || visited.has(element)) return;
            visited.add(element);
            candidates.push(element);
        };

        addCandidate(target);
        path.forEach((node) => addCandidate(node));

        return candidates.some((element) => {
            if (!(element instanceof HTMLElement)) return false;
            const tag = element.tagName.toUpperCase();
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return true;
            if (element.isContentEditable) return true;
            return element.closest(interactiveSelectors) !== null;
        });
    }

    private refreshVideoPresence(force = false): boolean {
        const now = Date.now();
        if (!force && now - this.lastVideoPresenceCheckAt < this.VIDEO_PRESENCE_CHECK_INTERVAL) {
            return this.hasVideo;
        }

        this.lastVideoPresenceCheckAt = now;
        if (document.querySelector('video')) {
            this.hasVideo = true;
            return true;
        }

        this.hasVideo = Boolean(VideoController.getInstance().video);
        return this.hasVideo;
    }

    private handleEvent(e: Event) {
        if (!this.isSupportedEventType(e.type)) return;
        const type = e.type;
        const listeners = this.listeners[type];

        if (!listeners || listeners.length === 0) return;

        // For pointer events, skip handling until a video is present.
        // For keydown, do not hard-block here; feature handlers can still
        // decide based on current host/video availability.
        if (type !== 'keydown' && !this.refreshVideoPresence()) return;
        if (type === 'keydown') this.refreshVideoPresence();

        // Check for Shadow DOM target using composedPath
        const path = e.composedPath?.() || [];
        const realTarget = (path[0] || e.target) as EventTarget;

        const interactive = type === 'keydown' && this.isInteractive(realTarget, path as EventTarget[]);
        if (type === 'keydown') {
            try {
                const ke = e as KeyboardEvent;
                (
                    window as Window & {
                        __VIDBOOST_KEYDBG__?: {
                            key: string;
                            code: string;
                            interactive: boolean;
                            listeners: string[];
                            ts: string;
                        };
                    }
                ).__VIDBOOST_KEYDBG__ = {
                    key: ke.key,
                    code: ke.code,
                    interactive,
                    listeners: listeners.map((l) => l.id),
                    ts: new Date().toISOString()
                };
            } catch {
                // ignore diagnostics publish errors
            }
        }

        // Skip keyboard shortcuts in input fields
        if (interactive) {
            return;
        }

        // Execute by priority
        for (const listener of listeners) {
            if (listener.condition && !listener.condition(e)) {
                continue;
            }

            const handled = listener.handler(e);

            // If handler returns true, stop propagation (conflict resolution)
            if (handled === true) {
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
                return;
            }
        }
    }

    /**
     * Register a new event listener
     */
    public on(eventType: InputEventType,
        id: string,
        handler: InputAction,
        options: { priority?: number, condition?: (e: Event) => boolean } = {}) {

        if (!this.listeners[eventType]) return;

        // Keep registration idempotent for re-mount paths.
        this.listeners[eventType] = this.listeners[eventType].filter(l => l.id !== id);

        this.listeners[eventType].push({
            id,
            handler,
            priority: options.priority || 0,
            condition: options.condition
        });

        // Always mitigate sort overhead by keeping it sorted? 
        // Or just sort on insertion.
        this.listeners[eventType].sort((a, b) => b.priority - a.priority);
    }

    public off(id: string) {
        (Object.keys(this.listeners) as InputEventType[]).forEach((type) => {
            this.listeners[type] = this.listeners[type].filter((l) => l.id !== id);
        });
    }
}
