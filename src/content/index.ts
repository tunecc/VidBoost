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

const mountedState = new Array(features.length).fill(false);

type ContentDebugState = {
    mounted: boolean[];
    settings: {
        enabled?: boolean;
        h5_enabled?: boolean;
        ap_enabled?: boolean;
        bnd_enabled?: boolean;
        yt_fast_pause?: boolean;
        fast_pause_master?: boolean;
        yt_config?: { blockNativeSeek?: boolean };
    };
    ts: string;
};

function publishDebug(settings: ContentDebugState['settings']) {
    try {
        (window as Window & { __VIDBOOST_DEBUG__?: ContentDebugState }).__VIDBOOST_DEBUG__ = {
            mounted: [...mountedState],
            settings,
            ts: new Date().toISOString()
        };
    } catch {
        // ignore diagnostics publish errors
    }
}

function setFeatureEnabled(index: number, enabled: boolean) {
    if (mountedState[index] === enabled) return;
    mountedState[index] = enabled;
    if (enabled) features[index].mount();
    else features[index].unmount();
}

function applyFromSettings(res: {
    enabled?: boolean;
    h5_enabled?: boolean;
    ap_enabled?: boolean;
    bnd_enabled?: boolean;
    yt_fast_pause?: boolean;
    fast_pause_master?: boolean;
    yt_config?: { blockNativeSeek?: boolean };
}) {
    const globalEnabled = res.enabled !== false;
    if (!globalEnabled) {
        features.forEach((_, index) => setFeatureEnabled(index, false));
        publishDebug(res);
        return;
    }

    const fastPauseMasterOn = res.fast_pause_master !== false;
    const bndOn = res.bnd_enabled !== false && fastPauseMasterOn;
    const ytFastPauseOn = res.yt_fast_pause !== false && fastPauseMasterOn;
    const ytBlockNativeOn = res.yt_config?.blockNativeSeek !== false;

    setFeatureEnabled(0, res.h5_enabled !== false);
    setFeatureEnabled(1, res.ap_enabled !== false);
    setFeatureEnabled(2, bndOn);
    setFeatureEnabled(3, ytBlockNativeOn);
    setFeatureEnabled(4, ytFastPauseOn);
    publishDebug(res);
}

function loadAndApply() {
    return getSettings([
        'enabled',
        'h5_enabled',
        'ap_enabled',
        'bnd_enabled',
        'yt_fast_pause',
        'fast_pause_master',
        'yt_config'
    ])
        .then(applyFromSettings)
        .catch(() => applyFromSettings({}));
}

// Safe baseline: if storage is unavailable or delayed, keep defaults active.
applyFromSettings({});
loadAndApply();
onSettingsChanged(() => {
    loadAndApply();
});
