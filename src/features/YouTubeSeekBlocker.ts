import { InputManager } from '../lib/InputManager';
import type { Feature } from './Feature';
import { getSettings, onSettingsChanged, DEFAULT_SETTINGS } from '../lib/settings-content';
import { isSiteHost } from '../lib/siteProfiles';
import { VideoController } from '../lib/VideoController';

export class YouTubeSeekBlocker implements Feature {
    private input = InputManager.getInstance();
    private videoCtrl = VideoController.getInstance();
    private enabled = false;
    private blockNativeSeek = true;

    constructor() {
        this.registerShortcuts();

        getSettings(['yt_config', 'h5_config']).then((res) => {
            if (res.yt_config) {
                this.blockNativeSeek = res.yt_config.blockNativeSeek ?? DEFAULT_SETTINGS.yt_config.blockNativeSeek!;
            } else if (res.h5_config?.blockNumKeys !== undefined) {
                this.blockNativeSeek = Boolean(res.h5_config.blockNumKeys);
            } else {
                this.blockNativeSeek = DEFAULT_SETTINGS.yt_config.blockNativeSeek!;
            }
        });

        onSettingsChanged((changes) => {
            if (changes.yt_config) {
                this.blockNativeSeek = changes.yt_config.blockNativeSeek ?? DEFAULT_SETTINGS.yt_config.blockNativeSeek!;
            }
        });
    }

    mount() {
        this.enabled = true;
    }

    unmount() {
        this.enabled = false;
    }

    updateSettings(_settings: unknown) { }

    private registerShortcuts() {
        const keys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

        keys.forEach(num => {
            this.input.on('keydown', `yt-block-${num}`, (e) => {
                if (!this.enabled || !this.blockNativeSeek) return false;

                // Only act on YouTube host
                if (!isSiteHost('youtube')) return false;

                // Don't block numeric keys on non-player pages.
                if (!document.querySelector('video') && !this.videoCtrl.video) return false;

                const ke = e as KeyboardEvent;
                if (ke.ctrlKey || ke.altKey || ke.metaKey || ke.shiftKey) return false;

                if (ke.key === num.toString()) {
                    // Block execution by returning true
                    return true;
                }
                return false;
            }, { priority: 50 }); // Lower priority than H5Enhancer (100) to allow speed control
        });
    }
}
