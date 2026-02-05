/**
 * Cross-Tab Synchronization
 * Uses BroadcastChannel for zero-latency communication between tabs.
 */

export type SyncMessage = {
    senderId: string;
    timestamp: number;
} & (
        { type: 'PLAY_STARTED' } |
        { type: 'SETTINGS_CHANGED'; payload: any }
    );

export class CrossTabSync {
    private channel: BroadcastChannel;
    private id: string;
    private listeners: ((msg: SyncMessage) => void)[] = [];

    constructor() {
        this.channel = new BroadcastChannel('video-tools-channel');
        this.id = this.getOrCreateId();

        this.channel.onmessage = (e) => {
            const msg = e.data as SyncMessage;
            if (msg.senderId === this.id) return; // Ignore self

            this.listeners.forEach(cb => cb(msg));
        };
    }

    public get myId() {
        return this.id;
    }

    public send(msg: Omit<SyncMessage, 'senderId'>) {
        const payload = { ...msg, senderId: this.id };
        this.channel.postMessage(payload);
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
