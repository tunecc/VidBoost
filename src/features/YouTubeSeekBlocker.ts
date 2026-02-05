import { InputManager } from '../lib/InputManager';
import type { Feature } from './Feature';

export class YouTubeSeekBlocker implements Feature {
    private input = InputManager.getInstance();
    private enabled = false;
    private blockNativeSeek = true;

    constructor() {
        this.registerShortcuts();

        // Load config
        // reusing h5_config or creating new yt_config?
        // User said "Block Native Seek feature also move to YouTube".
        // Let's use 'h5_config.blockNumKeys' from before for backward compat/laziness, 
        // OR migrate to 'yt_config'. The user UI will map it. 
        // Let's stick to referencing the SAME storage key if possible, OR just rename to yt_config for clarity.
        // Given we are refactoring, let's just use 'yt_config' to be clean.

        chrome.storage.local.get(['yt_config', 'h5_config'], (res) => {
            // Migration check: if old key exists, use it? Nah, let's start clean or check both.
            if (res.yt_config) {
                this.blockNativeSeek = res.yt_config.blockNativeSeek ?? true;
            } else if (res.h5_config && res.h5_config.blockNumKeys !== undefined) {
                this.blockNativeSeek = res.h5_config.blockNumKeys;
            }
        });

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.yt_config) {
                this.blockNativeSeek = changes.yt_config.newValue?.blockNativeSeek ?? true;
            }
        });
    }

    mount() {
        this.enabled = true;
    }

    unmount() {
        this.enabled = false;
    }

    updateSettings(settings: any) { }

    private registerShortcuts() {
        const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

        keys.forEach(num => {
            this.input.on('keydown', `yt-block-${num}`, (e) => {
                if (!this.enabled || !this.blockNativeSeek) return false;

                // Only act on YouTube host
                if (!window.location.host.includes('youtube.com')) return false;

                const ke = e as KeyboardEvent;
                if (ke.ctrlKey || ke.altKey || ke.metaKey || ke.shiftKey) return false;

                if (ke.key === num.toString()) {
                    // Block execution by returning true
                    return true;
                }
                return false;
            }, { priority: 50 }); // Lower priority than H5Enhancer (100) to allow speed control
        });

        // Note: We need H5Enhancer to have LOWER priority if it wants to use the keys, OR handle it there.
        // H5Enhancer uses priority 100.
        // If we want to ALLOW 1-4 for H5Enhancer but BLOCK native, we have a conflict.
        // H5Enhancer (Speed 1-4) should run. YouTube Native (Seek) should NOT.
        // If YouTubeOptimizer returns TRUE, it stops propagation.
        // So H5Enhancer won't get it.

        // SOLUTION: 
        // YouTubeOptimizer should ONLY block if H5Enhancer didn't handle it?
        // OR: H5Enhancer handles 1-4. YouTubeOptimizer handles 0, 5-9.
        // BUT YouTubeOptimizer needs to block 1-4 from reaching YOUTUBE, but NOT block H5Enhancer.
        // InputManager design: "If handler returns true, stop propagation".

        // Actually, if both are registered via InputManager:
        // InputManager calls them in priority order.
        // If H5Enhancer (Pri 100) handles '1', it returns TRUE. Event stopped. YouTube doesn't see it.
        // If H5Enhancer doesn't handle '5', it returns FALSE.
        // Then YouTubeOptimizer (Pri 999 - wait, higher runs first).

        // We want:
        // 1. H5Enhancer to see 1-4 (Speed).
        // 2. YouTubeOptimizer to see 0-9 (Block Native).
        // 3. YouTube (Native) not to see 0-9.

        // If YouTubeOptimizer runs FIRST (Pri 999), and returns TRUE, H5Enhancer (Pri 100) never sees it.
        // If H5Enhancer runs FIRST (Pri 100), handles 1-4 -> True. Native blocked. Good.
        // What about 5-9? H5Enhancer returns False.
        // Then we need something to block 5-9.

        // So:
        // H5Enhancer: Priority 100. Handles 1-4.
        // YouTubeOptimizer: Priority 50 (Lower than H5?).
        // No, Priority doesn't matter for specific key handlers if they don't overlap in ID logic.
        // Wait, InputManager iterates ALL listeners for 'keydown'.
        // If H5Enhancer checks 1-4 and handles, it stops.

        // YouTubeOptimizer should handle 0-9. 
        // If key is 1-4, and H5Enhancer handles it -> Good.
        // If key is 5-9, H5Enhancer ignores. YouTubeOptimizer should BLOCK it.

        // Issue: If YouTubeOptimizer runs BEFORE H5Enhancer, it might block 1-4?
        // If I implement logic in YouTubeOptimizer to only block 5-9?
        // No, user might want to block 1-4 Native Seek even if they DON'T use H5 Speed? 
        // (Actually they use H5 Speed).

        // Let's set YouTubeOptimizer Priority to 50.
        // H5Enhancer (100) runs first.
        // If H5Enhancer enabled:
        //    Press 1 -> H5Enhancer handles -> Returns True -> Stop. (Native blocked).
        //    Press 5 -> H5Enhancer ignores -> Next listener.
        //    YouTubeOptimizer (50) sees 5 -> Returns True -> Stop. (Native blocked).

        // If H5Enhancer disabled (or user off):
        //    Press 1 -> H5Enhancer ignored.
        //    YouTubeOptimizer (50) sees 1 -> Returns True -> Stop.

        // Perfect.
        // So YouTubeOptimizer should register 0-9 with priority 50.
    }
}
