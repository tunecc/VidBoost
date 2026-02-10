/**
 * Cross-Tab Synchronization
 * Uses runtime relay via background service worker.
 */

export type SyncMessage = {
    senderId: string;
    timestamp: number;
} & (
        { type: 'PLAY_STARTED' } |
        { type: 'SETTINGS_CHANGED'; payload: unknown }
    );

function isSyncMessage(msg: unknown): msg is SyncMessage {
    if (!msg || typeof msg !== 'object') return false;
    const maybe = msg as Partial<SyncMessage>;
    if (typeof maybe.senderId !== 'string') return false;
    if (typeof maybe.timestamp !== 'number') return false;
    if (maybe.type === 'PLAY_STARTED') return true;
    if (maybe.type === 'SETTINGS_CHANGED') return 'payload' in maybe;
    return false;
}

export class CrossTabSync {
    private id: string;
    private listeners: ((msg: SyncMessage) => void)[] = [];

    constructor() {
        this.id = this.getOrCreateId();

        // Use chrome.runtime.onMessage for cross-origin sync
        chrome.runtime.onMessage.addListener((msg) => {
            if (!isSyncMessage(msg)) return;
            if (msg.senderId === this.id) return; // Ignore self
            this.listeners.forEach(cb => cb(msg));
        });
    }

    public get myId() {
        return this.id;
    }

    public send(msg: Omit<SyncMessage, 'senderId'>) {
        const payload = { ...msg, senderId: this.id };
        // Send to background for relay
        chrome.runtime.sendMessage({
            type: 'BROADCAST_SYNC',
            payload
        }).catch(() => {
            // Ignore if background is asleep (it wakes up usually)
        });
    }

    public onMessage(cb: (msg: SyncMessage) => void) {
        this.listeners.push(cb);
    }

    /**
     * Get or create a persistent ID using sessionStorage.
     * This ensures the ID survives page refreshes, allowing the script
     * to correctly identify itself as the same "window" after reload.
     */
    private getOrCreateId(): string {
        const KEY = 'video_tools_session_id';
        let id = sessionStorage.getItem(KEY);
        if (!id) {
            id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            sessionStorage.setItem(KEY, id);
        }
        return id;
    }
}
