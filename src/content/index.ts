import { H5Enhancer } from '../features/H5Enhancer';
import { AutoPause } from '../features/AutoPause';
import { BilibiliFastPause } from '../features/BilibiliFastPause';
import { YouTubeSeekBlocker } from '../features/YouTubeSeekBlocker';
import { YouTubeFastPause } from '../features/YouTubeFastPause';

const features = [
    new H5Enhancer(),
    new AutoPause(),
    new BilibiliFastPause(),
    new YouTubeSeekBlocker(),
    new YouTubeFastPause()
];

// Load global enabled state
chrome.storage.local.get(['enabled', 'h5_enabled', 'ap_enabled', 'bnd_enabled'], (res) => {
    // Global Master Switch
    if (res.enabled === false) return; // Completely disabled

    // Individual Feature Switches
    // Note: YouTubeOptimizer is currently always on if global is on, 
    // OR we could add a toggle. For now, it respects its own internal config 'blockNativeSeek'.
    // If we want to disable the entire feature class, we need a toggle.
    // User didn't ask for a toggle for the feature class itself, just the logic inside.

    // We can map 'h5_enabled' to H5Enhancer. 
    // 'ap_enabled' to AutoPause.
    // 'bnd_enabled' to PreventDoubleClick (Bilibili).
    // YouTubeOptimizer... let's just enable it always (it checks its own config).

    if (res.h5_enabled !== false) features[0].mount();
    if (res.ap_enabled !== false) features[1].mount();
    if (res.bnd_enabled !== false) features[2].mount();
    features[3].mount(); // YouTube Optimizer
    features[4].mount(); // YouTube Fast Pause
});

// Watch for changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
        if (changes.enabled.newValue === false) {
            features.forEach(f => f.unmount());
        } else {
            // Re-mount enabled ones
            chrome.storage.local.get(['h5_enabled', 'ap_enabled', 'bnd_enabled'], (res) => {
                if (res.h5_enabled !== false) features[0].mount();
                if (res.ap_enabled !== false) features[1].mount();
                if (res.bnd_enabled !== false) features[2].mount();
                features[3].mount();
                features[4].mount();
            });
        }
    }

    // Individual toggles (if we add one for YT later, add here)
    if (changes.h5_enabled) {
        if (changes.h5_enabled.newValue === false) features[0].unmount();
        else features[0].mount();
    }
    if (changes.ap_enabled) {
        if (changes.ap_enabled.newValue === false) features[1].unmount();
        else features[1].mount();
    }
    if (changes.bnd_enabled) {
        if (changes.bnd_enabled.newValue === false) features[2].unmount();
        else features[2].mount();
    }
});
