import { InputManager } from '../lib/InputManager';
import { VideoController } from '../lib/VideoController';
import { OSD } from '../lib/OSD';
import { getPlaybackRateConfigForHost, isSiteHost } from '../lib/siteProfiles';
import { DEFAULT_SETTINGS, type Settings } from '../lib/settings-content';
import {
    installDouyinPlaybackRateGuardBridge,
    pushDouyinPlaybackRateGuardConfig
} from './douyin/playbackRateGuard';
import type { Feature } from './Feature';

type H5Config = {
    speedStep: number;
    maxSpeed: number;
    restoreSpeed: number;
    seekForward: number;
    seekRewind: number;
    zxcControlsEnabled: boolean;
};

export class H5Enhancer implements Feature {
    private input = InputManager.getInstance();
    private videoCtrl = VideoController.getInstance();
    private osd = OSD.getInstance();
    private enabled = false;
    private douyinStickyAbove = 3;

    // Config
    private config: H5Config = {
        speedStep: 0.1,
        maxSpeed: 16.0,
        restoreSpeed: 1.0,
        seekForward: 5,
        seekRewind: 3,
        zxcControlsEnabled: true
    };

    // State for Number Key Accumulation
    private plusInfo: Record<number, { time: number; value: number }> = {};
    private readonly CLICK_THRESHOLD = 500; // ms

    // State for Seek Accumulation
    private seekAccumulator = 0;
    private seekResetTimer: number | null = null;
    private lastSpeed = 1.5; // Default toggle speed
    private readonly listenerIds = [
        'h5-speed-1', 'h5-speed-2', 'h5-speed-3',
        'h5-speed-4', 'h5-speed-5', 'h5-speed-6',
        'h5-speed-up', 'h5-speed-down', 'h5-speed-reset',
        'h5-fullscreen', 'h5-seek-forward', 'h5-seek-back'
    ];

    mount() {
        this.enabled = true;
        this.installSitePlaybackBridge();
        this.registerShortcuts();
    }

    unmount() {
        this.enabled = false;
        this.listenerIds.forEach(id => this.input.off(id));
        if (this.seekResetTimer) {
            clearTimeout(this.seekResetTimer);
            this.seekResetTimer = null;
        }
        this.seekAccumulator = 0;
        this.resetSitePlaybackBridge();
    }

    updateSettings(settings: unknown) {
        const payload = settings as Partial<Settings> | null;
        this.updateLocalConfig(payload?.h5_config ?? DEFAULT_SETTINGS.h5_config);
    }

    private updateLocalConfig(newConf: Partial<H5Config>) {
        this.config = { ...this.config, ...newConf };
    }

    private showFeedback(text: string) {
        const v = this.videoCtrl.video;
        this.osd.show(text, v || undefined);
    }

    private installSitePlaybackBridge() {
        if (!isSiteHost('douyin')) return;
        this.douyinStickyAbove = getPlaybackRateConfigForHost(window.location.host)?.stickyAbove ?? 3;
        installDouyinPlaybackRateGuardBridge();
        this.syncSitePlaybackGuard(1);
    }

    private resetSitePlaybackBridge() {
        if (!isSiteHost('douyin')) return;
        pushDouyinPlaybackRateGuardConfig({ enabled: false, targetRate: 1 });
    }

    private syncSitePlaybackGuard(rate: number) {
        if (!isSiteHost('douyin')) return;
        pushDouyinPlaybackRateGuardConfig({
            enabled: rate > this.douyinStickyAbove,
            targetRate: rate,
            stickyAbove: this.douyinStickyAbove
        });
    }

    private applySpeed(rate: number) {
        this.syncSitePlaybackGuard(rate);
        this.videoCtrl.setSpeed(rate);
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

        this.applySpeed(info.value);
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
        // --- Number Keys (1-6) ---
        [1, 2, 3, 4, 5, 6].forEach(num => {
            this.input.on('keydown', `h5-speed-${num}`, (e) => {
                if (!this.enabled) return false;

                const ke = e as KeyboardEvent;
                if (ke.ctrlKey || ke.altKey || ke.metaKey || ke.shiftKey) return false;

                if (ke.key === num.toString()) {
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
            if (!this.config.zxcControlsEnabled) return false;

            if (ke.key.toLowerCase() === 'c') {
                const v = this.videoCtrl.video;
                if (v) {
                    let newRate = v.playbackRate + this.config.speedStep;
                    if (newRate > this.config.maxSpeed) newRate = this.config.maxSpeed;

                    // Round to 1 decimal to avoid floating point issues
                    newRate = parseFloat(newRate.toFixed(1));

                    this.applySpeed(newRate);
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
            if (!this.config.zxcControlsEnabled) return false;

            if (ke.key.toLowerCase() === 'x') {
                const v = this.videoCtrl.video;
                if (v) {
                    let newRate = v.playbackRate - this.config.speedStep;
                    if (newRate < 0.1) newRate = 0.1;

                    // Round to 1 decimal
                    newRate = parseFloat(newRate.toFixed(1));

                    this.applySpeed(newRate);
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
            if (!this.config.zxcControlsEnabled) return false;

            if (ke.key.toLowerCase() === 'z') {
                const v = this.videoCtrl.video;
                if (v) {
                    if (v.playbackRate === 1.0) {
                        // Restore
                        this.applySpeed(this.lastSpeed);
                        const txt = Number.isInteger(this.lastSpeed) ? `${this.lastSpeed}x` : `${this.lastSpeed.toFixed(1)}x`;
                        this.showFeedback(txt);
                    } else {
                        // Reset
                        this.lastSpeed = v.playbackRate;
                        this.applySpeed(1.0);
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
