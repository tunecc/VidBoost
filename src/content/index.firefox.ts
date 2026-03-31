import type { Feature } from '../features/Feature';
import type { BilibiliUploaderProfile } from '../features/BilibiliAutoSubtitle';
import type { BilibiliCdnSpeedTestOptions, SpeedTestResult } from '../features/bilibili/bilibiliCdn.shared';
import type { CdnNode } from '../lib/bilibiliCdnData';
import {
    getSettings,
    onSettingsChanged,
    DEFAULT_SETTINGS,
    CONTENT_SETTINGS_KEYS,
    resolveSettings,
    type Settings
} from '../lib/settings-content';
import {
    addRuntimeMessageListener,
    getRuntimeUrl,
    storageLocalSet
} from '../lib/webext';

type FirefoxFeatureModuleMap = {
    'firefox-feature-auto-pause': { AutoPause: new () => Feature };
    'firefox-feature-bilibili-auto-subtitle': { BilibiliAutoSubtitle: new () => Feature };
    'firefox-feature-bilibili-cdn': { BilibiliCDN: new () => Feature };
    'firefox-feature-h5-enhancer': { H5Enhancer: new () => Feature };
    'firefox-feature-bilibili-fast-pause': { BilibiliFastPause: new () => Feature };
    'firefox-feature-stats-speed-converter': { StatsSpeedConverter: new () => Feature };
    'firefox-feature-youtube-seek-blocker': { YouTubeSeekBlocker: new () => Feature };
    'firefox-feature-youtube-fast-pause': { YouTubeFastPause: new () => Feature };
    'firefox-feature-youtube-original-audio': { YouTubeOriginalAudio: new () => Feature };
    'firefox-feature-youtube-cdn-status': { YouTubeCdnStatus: new () => Feature };
    'firefox-feature-bilibili-space-blocker': { BilibiliSpaceBlocker: new () => Feature };
    'firefox-feature-youtube-member-blocker': { YouTubeMemberBlocker: new () => Feature };
};

const firefoxFeatureModuleCache = new Map<string, Promise<unknown>>();

type DeferredFeatureController<T extends Feature> = {
    feature: Feature;
    ensureInstance: () => Promise<T>;
    getCurrentInstance: () => T | null;
};

async function loadFirefoxFeatureModule<K extends keyof FirefoxFeatureModuleMap>(
    assetName: K
): Promise<FirefoxFeatureModuleMap[K]> {
    const cached = firefoxFeatureModuleCache.get(assetName);
    if (cached) {
        return await cached as FirefoxFeatureModuleMap[K];
    }

    const moduleUrl = getRuntimeUrl(`assets/${assetName}.js`);
    if (!moduleUrl) {
        throw new Error(`missing-runtime-url:${assetName}`);
    }

    const pending = import(/* @vite-ignore */ moduleUrl).catch((error) => {
        firefoxFeatureModuleCache.delete(assetName);
        throw error;
    });

    firefoxFeatureModuleCache.set(assetName, pending);
    return await pending as FirefoxFeatureModuleMap[K];
}

function createDeferredFeatureController<T extends Feature>(
    label: string,
    factory: () => Promise<T>
): DeferredFeatureController<T> {
    let instance: T | null = null;
    let pendingFactory: Promise<T> | null = null;
    let pendingSettings: unknown;
    let hasPendingSettings = false;
    let shouldBeMounted = false;

    const ensureInstance = async () => {
        if (instance) return instance;
        if (!pendingFactory) {
            pendingFactory = factory().then((created) => {
                instance = created;
                if (hasPendingSettings) {
                    instance.updateSettings(pendingSettings);
                }
                if (shouldBeMounted) {
                    instance.mount();
                }
                return instance;
            }).catch((error) => {
                pendingFactory = null;
                console.warn(`[VidBoost][Firefox] Failed to load ${label}`, error);
                throw error;
            });
        }
        return await pendingFactory;
    };

    return {
        feature: {
            mount() {
                shouldBeMounted = true;
                if (instance) {
                    instance.mount();
                    return;
                }
                void ensureInstance();
            },
            unmount() {
                shouldBeMounted = false;
                instance?.unmount();
            },
            updateSettings(settings: unknown) {
                pendingSettings = settings;
                hasPendingSettings = true;
                instance?.updateSettings(settings);
            }
        },
        ensureInstance,
        getCurrentInstance() {
            return instance;
        }
    };
}

function createDeferredFeature(label: string, factory: () => Promise<Feature>): Feature {
    return createDeferredFeatureController(label, factory).feature;
}

const h5Enhancer = createDeferredFeature(
    'H5Enhancer',
    async () => new (await loadFirefoxFeatureModule('firefox-feature-h5-enhancer')).H5Enhancer()
);
const autoPauseFeature = createDeferredFeature(
    'AutoPause',
    async () => new (await loadFirefoxFeatureModule('firefox-feature-auto-pause')).AutoPause()
);
const bilibiliFastPause = createDeferredFeature(
    'BilibiliFastPause',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-bilibili-fast-pause')
    ).BilibiliFastPause()
);
const statsSpeedConverter = createDeferredFeature(
    'StatsSpeedConverter',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-stats-speed-converter')
    ).StatsSpeedConverter()
);
const youtubeSeekBlocker = createDeferredFeature(
    'YouTubeSeekBlocker',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-youtube-seek-blocker')
    ).YouTubeSeekBlocker()
);
const youtubeFastPause = createDeferredFeature(
    'YouTubeFastPause',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-youtube-fast-pause')
    ).YouTubeFastPause()
);
const youtubeOriginalAudio = createDeferredFeature(
    'YouTubeOriginalAudio',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-youtube-original-audio')
    ).YouTubeOriginalAudio()
);
const youtubeCdnStatus = createDeferredFeature(
    'YouTubeCdnStatus',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-youtube-cdn-status')
    ).YouTubeCdnStatus()
);
const bilibiliSpaceBlocker = createDeferredFeature(
    'BilibiliSpaceBlocker',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-bilibili-space-blocker')
    ).BilibiliSpaceBlocker()
);
const youtubeMemberBlocker = createDeferredFeature(
    'YouTubeMemberBlocker',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-youtube-member-blocker')
    ).YouTubeMemberBlocker()
);
const bilibiliAutoSubtitleController = createDeferredFeatureController(
    'BilibiliAutoSubtitle',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-bilibili-auto-subtitle')
    ).BilibiliAutoSubtitle() as Feature & {
        getCurrentUploaderProfile: () => BilibiliUploaderProfile | null;
    }
);
const bilibiliAutoSubtitle = {
    ...bilibiliAutoSubtitleController.feature,
    async getCurrentUploaderProfile() {
        const instance = bilibiliAutoSubtitleController.getCurrentInstance()
            ?? await bilibiliAutoSubtitleController.ensureInstance();
        return instance.getCurrentUploaderProfile();
    }
};
const bilibiliCdnController = createDeferredFeatureController(
    'BilibiliCDN',
    async () => new (
        await loadFirefoxFeatureModule('firefox-feature-bilibili-cdn')
    ).BilibiliCDN() as Feature & {
        runSpeedTest: (
            nodes: CdnNode[],
            options: BilibiliCdnSpeedTestOptions,
            onResult: (result: SpeedTestResult) => void,
            onDone: () => void
        ) => void;
        abortSpeedTest: () => void;
    }
);
const bilibiliCdn = {
    ...bilibiliCdnController.feature,
    async runSpeedTest(
        nodes: CdnNode[],
        options: BilibiliCdnSpeedTestOptions,
        onResult: (result: SpeedTestResult) => void,
        onDone: () => void
    ) {
        const instance = bilibiliCdnController.getCurrentInstance()
            ?? await bilibiliCdnController.ensureInstance();
        instance.runSpeedTest(nodes, options, onResult, onDone);
    },
    abortSpeedTest() {
        bilibiliCdnController.getCurrentInstance()?.abortSpeedTest();
    }
};

const features = [
    h5Enhancer,
    autoPauseFeature,
    bilibiliFastPause,
    youtubeSeekBlocker,
    youtubeFastPause,
    youtubeOriginalAudio,
    bilibiliSpaceBlocker,
    youtubeMemberBlocker,
    bilibiliAutoSubtitle,
    bilibiliCdn,
    youtubeCdnStatus,
    statsSpeedConverter
];

const mountedState = new Array(features.length).fill(false);
const YT_CDN_STATUS_FEATURE_INDEX = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function isLoopbackDebugSite(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const host = window.location.hostname.trim().toLowerCase();
    const isLoopbackHost = host === '127.0.0.1'
        || host === 'localhost'
        || host === '[::1]'
        || host.endsWith('.localhost');
    if (!isLoopbackHost) return false;
    return Boolean(document.documentElement?.dataset?.vbSite?.trim());
}

function publishLoopbackBoot() {
    if (!isLoopbackDebugSite() || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;
    root.dataset.vbContentBooted = '1';
    root.dataset.vbContentMode = 'firefox-deferred';
}

function publishLoopbackAttr(name: string, value: string) {
    if (!isLoopbackDebugSite() || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;
    root.dataset[name] = value;
}

function getLoopbackDebugPreset(): Partial<Settings> | null {
    if (!isLoopbackDebugSite() || typeof document === 'undefined') return null;

    const preset = document.documentElement?.dataset?.vbDebugPreset?.trim().toLowerCase();
    const basePreset: Partial<Settings> = {
        enabled: true,
        language: 'en',
        h5_enabled: false,
        stats_speed_converter: false,
        ap_enabled: false,
        bnd_enabled: false,
        yt_fast_pause: false,
        fast_pause_master: false,
        bb_block_space: false,
        yt_member_block: false,
        yt_config: {
            blockNativeSeek: false,
            alwaysUseOriginalAudio: false,
            showCdnCountry: false
        }
    };
    if (!preset) return basePreset;

    if (preset === 'youtube-cdn') {
        return {
            ...basePreset,
            yt_config: {
                ...basePreset.yt_config,
                showCdnCountry: true
            }
        };
    }

    return basePreset;
}

type ContentDebugState = {
    mounted: boolean[];
    settings: Partial<Settings>;
    ts: string;
};

function publishLoopbackDebug(settings: ContentDebugState['settings']) {
    if (!isLoopbackDebugSite() || typeof document === 'undefined') return;

    const root = document.documentElement;
    if (!root) return;

    root.dataset.vbContentReady = '1';
    root.dataset.vbMountedMask = mountedState.map((value) => (value ? '1' : '0')).join('');
    root.dataset.vbYtCdnMounted = mountedState[YT_CDN_STATUS_FEATURE_INDEX] ? '1' : '0';
    root.dataset.vbYtCdnEnabled = settings.yt_config?.showCdnCountry === true ? '1' : '0';
}

function publishDebug(settings: ContentDebugState['settings']) {
    publishLoopbackDebug(settings);
    if (!import.meta.env.DEV) return;
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

function runLoopbackFirefoxSelfDiagnostics() {
    if (!isLoopbackDebugSite()) return;
    void import('./firefoxLoopbackDiagnostics').then((module) => {
        module.runFirefoxLoopbackSelfDiagnostics(publishLoopbackAttr);
    }).catch(() => {
        publishLoopbackAttr('vbRuntimeProbe', 'error');
    });
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
    const statsSpeedConverterOn = settings.stats_speed_converter === true;
    const ytBlockNativeOn = settings.yt_config.blockNativeSeek !== false;
    const ytOriginalAudioOn = settings.yt_config.alwaysUseOriginalAudio === true;
    const ytCdnStatusOn = settings.yt_config.showCdnCountry === true;
    const bbBlockSpaceOn = settings.bb_block_space !== false;
    const ytMemberBlockOn = settings.yt_member_block === true;
    const bbSubtitleOn = settings.bb_subtitle.enabled === true;
    const bbCdnOn = settings.bb_cdn.enabled === true;

    h5Enhancer.updateSettings(settings);
    youtubeSeekBlocker.updateSettings(settings);
    youtubeOriginalAudio.updateSettings(settings);
    youtubeMemberBlocker.updateSettings(settings);
    bilibiliAutoSubtitle.updateSettings(settings);
    youtubeCdnStatus.updateSettings(settings);
    statsSpeedConverter.updateSettings(settings);

    setFeatureEnabled(0, settings.h5_enabled !== false);
    setFeatureEnabled(1, settings.ap_enabled !== false);
    setFeatureEnabled(2, bndOn);
    setFeatureEnabled(3, ytBlockNativeOn);
    setFeatureEnabled(4, ytFastPauseOn);
    setFeatureEnabled(5, ytOriginalAudioOn);
    setFeatureEnabled(6, bbBlockSpaceOn);
    setFeatureEnabled(7, ytMemberBlockOn);
    setFeatureEnabled(8, bbSubtitleOn);
    setFeatureEnabled(9, bbCdnOn);
    setFeatureEnabled(10, ytCdnStatusOn);
    setFeatureEnabled(11, statsSpeedConverterOn);

    // Push CDN config update (always, so page script gets latest node)
    bilibiliCdn.updateSettings(settings);

    publishDebug(settings);
}

function loadAndApply() {
    return getSettings([...CONTENT_SETTINGS_KEYS])
        .then(applyFromSettings)
        .catch(() => applyFromSettings(DEFAULT_SETTINGS));
}

const loopbackDebugPreset = getLoopbackDebugPreset();

if (loopbackDebugPreset) {
    applyFromSettings(loopbackDebugPreset);
} else {
    applyFromSettings(DEFAULT_SETTINGS);
}
publishLoopbackBoot();
runLoopbackFirefoxSelfDiagnostics();
if (!loopbackDebugPreset) {
    loadAndApply();
    onSettingsChanged(() => {
        loadAndApply();
    });
}

// Speed test relay: popup → content script → page script → results → storage
addRuntimeMessageListener((message, _sender, sendResponse) => {
    if (!isRecord(message)) return;

    if (message.type === 'VB_POPUP_FOCUS_OVERRIDE') {
        autoPauseFeature.updateSettings({ popupFocusOverride: message.active === true });
        sendResponse({ ok: true });
    } else if (message.type === 'VB_CDN_SPEED_TEST' && Array.isArray(message.nodes)) {
        const results: Record<string, { speed: string; error: boolean }> = {};
        void bilibiliCdn.runSpeedTest(
            message.nodes.map((n: { id: string; host: string }) => ({ id: n.id, label: '', host: n.host })),
            (message.options as BilibiliCdnSpeedTestOptions | undefined)
                ?? { sampleSizeMiB: 8, timeoutSeconds: 10 },
            (result) => {
                results[result.nodeId] = { speed: result.speed, error: result.error };
                void storageLocalSet({ bb_cdn_speed_results: { ...results } });
            },
            () => {
                void storageLocalSet({ bb_cdn_speed_results: { ...results } });
            }
        ).then(() => {
            sendResponse({ started: true });
        }).catch(() => {
            sendResponse({ started: false });
        });
        return true;
    } else if (message.type === 'VB_CDN_ABORT_SPEED_TEST') {
        bilibiliCdn.abortSpeedTest();
        sendResponse({ aborted: true });
    } else if (message.type === 'VB_BB_SUBTITLE_CURRENT_UPLOADER') {
        void bilibiliAutoSubtitle.getCurrentUploaderProfile().then((uploader) => {
            sendResponse({ uploader });
        }).catch(() => {
            sendResponse({ uploader: null });
        });
        return true;
    }
});
