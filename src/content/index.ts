import { H5Enhancer } from '../features/H5Enhancer';
import { AutoPause } from '../features/AutoPause';
import { BilibiliFastPause } from '../features/BilibiliFastPause';
import { YouTubeSeekBlocker } from '../features/YouTubeSeekBlocker';
import { YouTubeFastPause } from '../features/YouTubeFastPause';
import { BilibiliSpaceBlocker } from '../features/BilibiliSpaceBlocker';
import { YouTubeMemberBlocker } from '../features/YouTubeMemberBlocker';
import { BilibiliCDN } from '../features/BilibiliCDN';
import {
    getSettings,
    onSettingsChanged,
    DEFAULT_SETTINGS,
    CONTENT_SETTINGS_KEYS,
    resolveSettings,
    type Settings
} from '../lib/settings-content';

const bilibiliCdn = new BilibiliCDN();

const features = [
    new H5Enhancer(),
    new AutoPause(),
    new BilibiliFastPause(),
    new YouTubeSeekBlocker(),
    new YouTubeFastPause(),
    new BilibiliSpaceBlocker(),
    new YouTubeMemberBlocker(),
    bilibiliCdn
];

const mountedState = new Array(features.length).fill(false);

type ContentDebugState = {
    mounted: boolean[];
    settings: Partial<Settings>;
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

function applyFromSettings(res: Partial<Settings>) {
    const settings = resolveSettings(res);
    const globalEnabled = settings.enabled !== false;
    if (!globalEnabled) {
        features.forEach((_, index) => setFeatureEnabled(index, false));
        publishDebug(settings);
        return;
    }

    const fastPauseMasterOn = settings.fast_pause_master !== false;
    const bndOn = settings.bnd_enabled !== false && fastPauseMasterOn;
    const ytFastPauseOn = settings.yt_fast_pause !== false && fastPauseMasterOn;
    const ytBlockNativeOn = settings.yt_config.blockNativeSeek !== false;
    const bbBlockSpaceOn = settings.bb_block_space !== false;
    const ytMemberBlockOn = settings.yt_member_block === true;
    const bbCdnOn = settings.bb_cdn.enabled === true;

    setFeatureEnabled(0, settings.h5_enabled !== false);
    setFeatureEnabled(1, settings.ap_enabled !== false);
    setFeatureEnabled(2, bndOn);
    setFeatureEnabled(3, ytBlockNativeOn);
    setFeatureEnabled(4, ytFastPauseOn);
    setFeatureEnabled(5, bbBlockSpaceOn);
    setFeatureEnabled(6, ytMemberBlockOn);
    setFeatureEnabled(7, bbCdnOn);

    // Push CDN config update (always, so page script gets latest node)
    bilibiliCdn.updateSettings(settings);

    publishDebug(settings);
}

function loadAndApply() {
    return getSettings([...CONTENT_SETTINGS_KEYS])
        .then(applyFromSettings)
        .catch(() => applyFromSettings(DEFAULT_SETTINGS));
}

applyFromSettings(DEFAULT_SETTINGS);
loadAndApply();
onSettingsChanged(() => {
    loadAndApply();
});

// Speed test relay: popup → content script → page script → results → storage
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'VB_CDN_SPEED_TEST' && Array.isArray(message.nodes)) {
        const results: Record<string, { speed: string; error: boolean }> = {};
        bilibiliCdn.runSpeedTest(
            message.nodes.map((n: { id: string; host: string }) => ({ id: n.id, label: '', host: n.host })),
            (result) => {
                results[result.nodeId] = { speed: result.speed, error: result.error };
                chrome.storage.local.set({ bb_cdn_speed_results: { ...results } });
            },
            () => {
                chrome.storage.local.set({ bb_cdn_speed_results: { ...results } });
            }
        );
        sendResponse({ started: true });
    } else if (message?.type === 'VB_CDN_ABORT_SPEED_TEST') {
        bilibiliCdn.abortSpeedTest();
        sendResponse({ aborted: true });
    }
});
