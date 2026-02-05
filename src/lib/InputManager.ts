/**
 * Centralized Input Manager
 * Handles all keyboard and mouse interactions to prevent conflicts and ensure performance.
 * Single event listener pattern.
 */

import { VideoController } from './VideoController';

type InputAction = (e: Event) => boolean | void;

interface ActionListener {
    id: string;
    priority: number; // Higher number = executed first
    condition?: (e: Event) => boolean;
    handler: InputAction;
}

export class InputManager {
    private static instance: InputManager;
    private listeners: Record<string, ActionListener[]> = {
        'keydown': [],
        'mousedown': [],
        'click': [],
        'dblclick': []
    };
    private hasVideo = false;

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
        });

        // Bind core events
        ['keydown', 'mousedown', 'click', 'dblclick'].forEach(eventType => {
            window.addEventListener(eventType, this.handleEvent.bind(this), { capture: true, passive: false });
        });
    }



    /**
     * Determines if the target is an interactive element (input, editable, etc.)
     * where strictly video shortcuts should be disabled.
     */
    public isInteractive(target: EventTarget | null): boolean {
        if (!target || !(target instanceof HTMLElement)) return false;

        const tag = target.tagName.toUpperCase();
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return true;
        if (target.isContentEditable) return true;

        // Smart Checks for custom editors (Notion, VSCode, Discord, etc.)
        const role = target.getAttribute('role');
        if (role === 'textbox' || role === 'searchbox') return true;

        // Class-based checks (Optimized for speed)
        const cls = target.className;
        if (typeof cls === 'string') {
            // Lowercase check once
            const l = cls.toLowerCase();
            if (l.includes('editor') || l.includes('input') || l.includes('text') || l.includes('draft')) {
                return true;
            }
        }

        return false;
    }

    private handleEvent(e: Event) {
        const type = e.type;
        const listeners = this.listeners[type];

        if (!listeners || listeners.length === 0) return;

        // Avoid global interception before any video exists
        if (!this.hasVideo) {
            // Cheap fallback: only start handling once a video exists in DOM
            if (!document.querySelector('video')) return;
            this.hasVideo = true;
        }

        // Check for Shadow DOM target using composedPath
        const path = e.composedPath?.() || [];
        const realTarget = (path[0] || e.target) as EventTarget;

        // Skip keyboard shortcuts in input fields
        if (type === 'keydown' && this.isInteractive(realTarget)) {
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
    public on(eventType: 'keydown' | 'mousedown' | 'click' | 'dblclick',
        id: string,
        handler: InputAction,
        options: { priority?: number, condition?: (e: Event) => boolean } = {}) {

        if (!this.listeners[eventType]) return;

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
        for (const type in this.listeners) {
            this.listeners[type] = this.listeners[type].filter(l => l.id !== id);
        }
    }
}
