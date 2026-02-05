import { H5Enhancer } from '../features/H5Enhancer';
import { AutoPause } from '../features/AutoPause';
import { BilibiliFastPause } from '../features/BilibiliFastPause';
import { YouTubeSeekBlocker } from '../features/YouTubeSeekBlocker';
import { YouTubeFastPause } from '../features/YouTubeFastPause';
import { getSettings, onSettingsChanged } from '../lib/settings-content';

const features = [
    new H5Enhancer(),
    new AutoPause(),
    new BilibiliFastPause(),
    new YouTubeSeekBlocker(),
    new YouTubeFastPause()
];

// Load global enabled state
getSettings([
    'enabled',
    'h5_enabled',
    'ap_enabled',
    'bnd_enabled',
    'yt_fast_pause',
    'fast_pause_master',
    'yt_config'
]).then((res) => {
    // Global Master Switch
    if (res.enabled === false) return; // Completely disabled

    const fastPauseMasterOn = res.fast_pause_master !== false;
    const bndOn = res.bnd_enabled !== false && fastPauseMasterOn;
    const ytFastPauseOn = res.yt_fast_pause !== false && fastPauseMasterOn;
    const ytBlockNativeOn = res.yt_config?.blockNativeSeek !== false;

    if (res.h5_enabled !== false) features[0].mount();
    if (res.ap_enabled !== false) features[1].mount();
    if (bndOn) features[2].mount();
    if (ytBlockNativeOn) features[3].mount(); // YouTube Seek Blocker
    if (ytFastPauseOn) features[4].mount();
});

// Watch for changes
onSettingsChanged((changes) => {
    if (changes.enabled !== undefined) {
        if (changes.enabled === false) {
            features.forEach(f => f.unmount());
        } else {
            // Re-mount enabled ones
            getSettings([
                'h5_enabled',
                'ap_enabled',
                'bnd_enabled',
                'yt_fast_pause',
                'fast_pause_master',
                'yt_config'
            ]).then((res) => {
                const fastPauseMasterOn = res.fast_pause_master !== false;
                const bndOn = res.bnd_enabled !== false && fastPauseMasterOn;
                const ytFastPauseOn = res.yt_fast_pause !== false && fastPauseMasterOn;
                const ytBlockNativeOn = res.yt_config?.blockNativeSeek !== false;

                if (res.h5_enabled !== false) features[0].mount();
                if (res.ap_enabled !== false) features[1].mount();
                if (bndOn) features[2].mount();
                if (ytBlockNativeOn) features[3].mount();
                if (ytFastPauseOn) features[4].mount();
            });
        }
    }

    // Individual toggles (if we add one for YT later, add here)
    if (changes.h5_enabled !== undefined) {
        if (changes.h5_enabled === false) features[0].unmount();
        else features[0].mount();
    }
    if (changes.ap_enabled !== undefined) {
        if (changes.ap_enabled === false) features[1].unmount();
        else features[1].mount();
    }
    if (changes.bnd_enabled !== undefined) {
        if (changes.bnd_enabled === false) features[2].unmount();
        else {
            getSettings(['fast_pause_master']).then((res) => {
                if (res.fast_pause_master !== false) features[2].mount();
            });
        }
    }

    if (changes.yt_config !== undefined) {
        const block = changes.yt_config?.blockNativeSeek !== false;
        if (!block) features[3].unmount();
        else {
            getSettings(['enabled']).then((res) => {
                if (res.enabled !== false) features[3].mount();
            });
        }
    }

    if (changes.fast_pause_master !== undefined) {
        if (changes.fast_pause_master === false) {
            features[2].unmount();
            features[4].unmount();
        } else {
            getSettings(['bnd_enabled', 'yt_fast_pause']).then((res) => {
                if (res.bnd_enabled !== false) features[2].mount();
                if (res.yt_fast_pause !== false) features[4].mount();
            });
        }
    }

    if (changes.yt_fast_pause !== undefined) {
        if (changes.yt_fast_pause === false) features[4].unmount();
        else {
            getSettings(['fast_pause_master']).then((res) => {
                if (res.fast_pause_master !== false) features[4].mount();
            });
        }
    }
});
