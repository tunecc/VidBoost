import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';
import { OSD } from '../lib/OSD';
import { getSettings, onSettingsChanged, DEFAULT_SETTINGS } from '../lib/settings-content';
import { isSiteHost } from '../lib/siteProfiles';
import type { Feature } from './Feature';

type H5Config = {
    speedStep: number;
    maxSpeed: number;
    restoreSpeed: number;
    seekForward: number;
    seekRewind: number;
};

export class H5Enhancer implements Feature {
    private input = InputManager.getInstance();
    private videoCtrl = VideoController.getInstance();
    private osd = OSD.getInstance();
    private enabled = false;

    // Config
    private config: H5Config = {
        speedStep: 0.1,
        maxSpeed: 16.0,
        restoreSpeed: 1.0,
        seekForward: 5,
        seekRewind: 3
    };

    // State for Number Key Accumulation
    private plusInfo: Record<number, { time: number; value: number }> = {};
    private readonly CLICK_THRESHOLD = 500; // ms

    // State for Seek Accumulation
    private seekAccumulator = 0;
    private seekResetTimer: number | null = null;
    private lastSpeed = 1.5; // Default toggle speed

    constructor() {
        this.registerShortcuts();

        // Initial load
        getSettings(['h5_config']).then((res) => {
            if (res.h5_config) this.updateLocalConfig(res.h5_config);
            else this.updateLocalConfig(DEFAULT_SETTINGS.h5_config);
        });

        onSettingsChanged((changes) => {
            if (changes.h5_config) {
                this.updateLocalConfig(changes.h5_config);
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

    private updateLocalConfig(newConf: Partial<H5Config>) {
        this.config = { ...this.config, ...newConf };
    }

    private showFeedback(text: string) {
        const v = this.videoCtrl.video;
        this.osd.show(text, v || undefined);
    }

    private shouldHandleNumericSpeed(num: number): boolean {
        // On YouTube keep native jumps for 6-9/0 when blocker is disabled.
        if (isSiteHost('youtube') && num > 5) return false;
        return true;
    }

    private setPlaybackRatePlus(num: number) {
        const v = this.videoCtrl.video;
        if (!v) return false;

        const now = Date.now();
        if (!this.plusInfo[num]) {
            this.plusInfo[num] = { time: 0, value: num };
        }

        const info = this.plusInfo[num];

        if (now - info.time < this.CLICK_THRESHOLD) {
            info.value += num;
        } else {
            info.value = num;
        }

        info.time = now;

        // Apply Limit
        if (info.value > this.config.maxSpeed) info.value = this.config.maxSpeed;

        this.videoCtrl.setSpeed(info.value);
        const txt = Number.isInteger(info.value) ? `${info.value}x` : `${info.value.toFixed(1)}x`;
        this.showFeedback(txt);
        return true;
    }

    private handleSeek(seconds: number) {
        // Perform seek
        const success = this.videoCtrl.seek(seconds);
        if (!success) return false;

        // Visual accumulation
        this.seekAccumulator += seconds;

        if (this.seekResetTimer) clearTimeout(this.seekResetTimer);
        this.seekResetTimer = window.setTimeout(() => {
            this.seekAccumulator = 0;
        }, 1000);

        const sign = this.seekAccumulator > 0 ? '+' : '';
        this.showFeedback(`${sign}${this.seekAccumulator}s`);
        return true;
    }

    private registerShortcuts() {
        // --- Number Keys (1-9) ---
        // Keep YouTube native seek blocking in a lower-priority feature,
        // while allowing numeric speed control to win when a video is active.
        [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(num => {
            this.input.on('keydown', `h5-speed-${num}`, (e) => {
                if (!this.enabled) return false;

                const ke = e as KeyboardEvent;
                if (ke.ctrlKey || ke.altKey || ke.metaKey || ke.shiftKey) return false;

                if (ke.key === num.toString()) {
                    if (!this.shouldHandleNumericSpeed(num)) return false;
                    return this.setPlaybackRatePlus(num);
                }
                return false;
            }, { priority: 100 });
        });

        // --- Standard Controls ---

        // Speed Up (C)
        this.input.on('keydown', 'h5-speed-up', (e) => {
            if (!this.enabled) return false;

            const ke = e as KeyboardEvent;
            if (ke.ctrlKey || ke.altKey || ke.metaKey) return false;

            if (ke.key.toLowerCase() === 'c') {
                const v = this.videoCtrl.video;
                if (v) {
                    let newRate = v.playbackRate + this.config.speedStep;
                    if (newRate > this.config.maxSpeed) newRate = this.config.maxSpeed;

                    // Round to 1 decimal to avoid floating point issues
                    newRate = parseFloat(newRate.toFixed(1));

                    this.videoCtrl.setSpeed(newRate);
                    const txt = Number.isInteger(newRate) ? `${newRate}x` : `${newRate.toFixed(1)}x`;
                    this.showFeedback(txt);
                    return true;
                }
            }
            return false;
        });

        // Speed Down (X)
        this.input.on('keydown', 'h5-speed-down', (e) => {
            if (!this.enabled) return false;

            const ke = e as KeyboardEvent;
            if (ke.ctrlKey || ke.altKey || ke.metaKey) return false;

            if (ke.key.toLowerCase() === 'x') {
                const v = this.videoCtrl.video;
                if (v) {
                    let newRate = v.playbackRate - this.config.speedStep;
                    if (newRate < 0.1) newRate = 0.1;

                    // Round to 1 decimal
                    newRate = parseFloat(newRate.toFixed(1));

                    this.videoCtrl.setSpeed(newRate);
                    const txt = Number.isInteger(newRate) ? `${newRate}x` : `${newRate.toFixed(1)}x`;
                    this.showFeedback(txt);
                    return true;
                }
            }
            return false;
        });

        // Toggle/Reset Speed (Z)
        this.input.on('keydown', 'h5-speed-reset', (e) => {
            if (!this.enabled) return false;

            const ke = e as KeyboardEvent;
            if (ke.ctrlKey || ke.altKey || ke.metaKey) return false;

            if (ke.key.toLowerCase() === 'z') {
                const v = this.videoCtrl.video;
                if (v) {
                    if (v.playbackRate === 1.0) {
                        // Restore
                        this.videoCtrl.setSpeed(this.lastSpeed);
                        const txt = Number.isInteger(this.lastSpeed) ? `${this.lastSpeed}x` : `${this.lastSpeed.toFixed(1)}x`;
                        this.showFeedback(txt);
                    } else {
                        // Reset
                        this.lastSpeed = v.playbackRate;
                        this.videoCtrl.setSpeed(1.0);
                        this.showFeedback('1x');
                    }
                    return true;
                }
            }
            return false;
        });

        // Fullscreen (Enter)
        this.input.on('keydown', 'h5-fullscreen', (e) => {
            if (!this.enabled) return false;
            if ((e as KeyboardEvent).key === 'Enter') {
                this.videoCtrl.toggleFullscreen();
                return true;
            }
            return false;
        });

        // Low priority seek (arrows) - let YouTube handle it if focused?
        // Actually original script handles arrow keys.
        // But we want to avoid conflicts if Shift+Arrow means "Select text" or "Fine seek"?
        // Original script: case 'arrowright': handled = changeTime(SEEK_STEP_FORWARD); break;
        // It prevents default if handled.

        // Seek Forward (Right Arrow)
        this.input.on('keydown', 'h5-seek-forward', (e) => {
            if (!this.enabled) return false;

            const ke = e as KeyboardEvent;
            if (ke.ctrlKey || ke.altKey || ke.metaKey) return false;

            if (ke.key === 'ArrowRight') {
                return this.handleSeek(this.config.seekForward);
            }
            return false;
        });

        // Seek Back (Left Arrow)
        this.input.on('keydown', 'h5-seek-back', (e) => {
            if (!this.enabled) return false;

            const ke = e as KeyboardEvent;
            if (ke.ctrlKey || ke.altKey || ke.metaKey) return false;

            if (ke.key === 'ArrowLeft') {
                return this.handleSeek(-this.config.seekRewind);
            }
            return false;
        });
    }
}
