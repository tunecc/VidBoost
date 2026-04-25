import { H5Enhancer } from '../features/H5Enhancer';
import { AutoPause } from '../features/AutoPause';
import { BilibiliFastPause } from '../features/BilibiliFastPause';
import { YouTubeSeekBlocker } from '../features/YouTubeSeekBlocker';
import { YouTubeFastPause } from '../features/YouTubeFastPause';
import { BilibiliSpaceBlocker } from '../features/BilibiliSpaceBlocker';
import { YouTubeMemberBlocker } from '../features/YouTubeMemberBlocker';
import { BilibiliCDN } from '../features/BilibiliCDN';
import { YouTubeOriginalAudio } from '../features/YouTubeOriginalAudio';
import { BilibiliAutoSubtitle } from '../features/BilibiliAutoSubtitle';
import { BilibiliAutoQuality } from '../features/BilibiliAutoQuality';
import { YouTubeCdnStatus } from '../features/YouTubeCdnStatus';
import { StatsSpeedConverter } from '../features/StatsSpeedConverter';
import { YouTubeSubtitleOverlay } from '../features/YouTubeSubtitleOverlay';
import type { Feature } from '../features/Feature';
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
    runtimeSendMessage,
    storageLocalGet,
    storageLocalSet
} from '../lib/webext';
import type { BilibiliCdnSpeedTestOptions } from '../features/bilibili/bilibiliCdn.shared';

let autoPauseInstance: AutoPause | null = null;
function createLazyFeature(factory: () => Feature): Feature {
    let instance: Feature | null = null;
    let pendingSettings: unknown;
    let hasPendingSettings = false;

    const ensureInstance = () => {
        if (!instance) {
            instance = factory();
            if (hasPendingSettings) {
                instance.updateSettings(pendingSettings);
            }
        }
        return instance;
    };

    return {
        mount() {
            ensureInstance().mount();
        },
        unmount() {
            instance?.unmount();
        },
        updateSettings(settings: unknown) {
            pendingSettings = settings;
            hasPendingSettings = true;
            instance?.updateSettings(settings);
        }
    };
}

const h5Enhancer = createLazyFeature(() => new H5Enhancer());
const bilibiliFastPause = createLazyFeature(() => new BilibiliFastPause());
const youtubeSeekBlocker = createLazyFeature(() => new YouTubeSeekBlocker());
const youtubeFastPause = createLazyFeature(() => new YouTubeFastPause());
const bilibiliSpaceBlocker = createLazyFeature(() => new BilibiliSpaceBlocker());
const youtubeMemberBlocker = createLazyFeature(() => new YouTubeMemberBlocker());
const bilibiliCdn = new BilibiliCDN();
const youtubeOriginalAudio = new YouTubeOriginalAudio();
const bilibiliAutoSubtitle = new BilibiliAutoSubtitle();
const bilibiliAutoQuality = new BilibiliAutoQuality();
const youtubeCdnStatus = new YouTubeCdnStatus();
const statsSpeedConverter = new StatsSpeedConverter();
const youtubeSubtitleOverlay = new YouTubeSubtitleOverlay();

const autoPauseFeature = {
    mount() {
        if (!autoPauseInstance) {
            autoPauseInstance = new AutoPause();
        }
        autoPauseInstance.mount();
    },
    unmount() {
        autoPauseInstance?.unmount();
    },
    updateSettings(settings: unknown) {
        autoPauseInstance?.updateSettings(settings);
    }
};

const features = [
    h5Enhancer,
    autoPauseFeature,
    bilibiliFastPause,
    youtubeSeekBlocker,
    youtubeFastPause,
    youtubeOriginalAudio,
    youtubeSubtitleOverlay,
    bilibiliSpaceBlocker,
    youtubeMemberBlocker,
    bilibiliAutoSubtitle,
    bilibiliCdn,
    youtubeCdnStatus,
    statsSpeedConverter,
    bilibiliAutoQuality
];

const mountedState = new Array(features.length).fill(false);
const YT_CDN_STATUS_FEATURE_INDEX = 11;

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

    const globalApi = globalThis as typeof globalThis & {
        browser?: {
            runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
            storage?: {
                local?: {
                    get?: (keys?: unknown) => Promise<Record<string, unknown>>;
                    set?: (items: Record<string, unknown>) => Promise<void>;
                };
            };
        };
        chrome?: {
            runtime?: {
                lastError?: { message?: string };
                sendMessage?: (
                    message: unknown,
                    callback?: (response?: unknown) => void
                ) => void;
            };
            storage?: {
                local?: {
                    get?: (
                        keys: unknown,
                        callback: (items: Record<string, unknown>) => void
                    ) => void;
                    set?: (
                        items: Record<string, unknown>,
                        callback: () => void
                    ) => void;
                };
            };
        };
    };

    const browserStorage = globalApi.browser?.storage?.local;
    const chromeStorage = globalApi.chrome?.storage?.local;
    const browserRuntime = globalApi.browser?.runtime;
    const chromeRuntime = globalApi.chrome?.runtime;
    const apiMode = browserStorage || typeof browserRuntime?.sendMessage === 'function'
        ? 'browser'
        : chromeStorage || typeof chromeRuntime?.sendMessage === 'function'
            ? 'chrome'
            : 'none';

    const withTimeout = <T>(
        promise: Promise<T>,
        timeoutMs: number,
        onTimeout: () => void
    ) => new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            onTimeout();
            reject(new Error('timeout'));
        }, timeoutMs);
        promise.then((value) => {
            window.clearTimeout(timer);
            resolve(value);
        }).catch((error) => {
            window.clearTimeout(timer);
            reject(error);
        });
    });

    const rawStorageProbe = async (storageKey: string, token: string) => {
        if (browserStorage?.set && browserStorage?.get) {
            await browserStorage.set({ [storageKey]: token });
            return await browserStorage.get(storageKey);
        }

        if (chromeStorage?.set && chromeStorage?.get) {
            return await new Promise<Record<string, unknown>>((resolve, reject) => {
                chromeStorage.set?.({ [storageKey]: token }, () => {
                    const setError = chromeRuntime?.lastError?.message;
                    if (setError) {
                        reject(new Error(setError));
                        return;
                    }

                    chromeStorage.get?.(storageKey, (result) => {
                        const getError = chromeRuntime?.lastError?.message;
                        if (getError) {
                            reject(new Error(getError));
                            return;
                        }
                        resolve(result);
                    });
                });
            });
        }

        throw new Error('storage-unavailable');
    };

    const rawRuntimeProbe = async () => {
        if (browserRuntime?.sendMessage) {
            return await browserRuntime.sendMessage({ type: 'VB_TEST_CLEAR_YT_CDN_OVERRIDE' });
        }

        if (chromeRuntime?.sendMessage) {
            return await new Promise<unknown>((resolve, reject) => {
                chromeRuntime.sendMessage?.({ type: 'VB_TEST_CLEAR_YT_CDN_OVERRIDE' }, (response) => {
                    const errorMessage = chromeRuntime?.lastError?.message;
                    if (errorMessage) {
                        reject(new Error(errorMessage));
                        return;
                    }
                    resolve(response);
                });
            });
        }

        throw new Error('runtime-unavailable');
    };

    publishLoopbackAttr('vbApiMode', apiMode);
    publishLoopbackAttr('vbStorageProbe', 'pending');
    publishLoopbackAttr('vbRuntimeProbe', 'pending');
    publishLoopbackAttr('vbStorageRawProbe', 'pending');
    publishLoopbackAttr('vbRuntimeRawProbe', 'pending');

    const storageKey = 'vb_loopback_storage_probe';
    const token = String(Date.now());

    void withTimeout(
        storageLocalSet({ [storageKey]: token }).then(async () => {
            const result = await storageLocalGet<Record<string, unknown>>(storageKey);
            publishLoopbackAttr(
                'vbStorageProbe',
                result[storageKey] === token ? 'ok' : 'mismatch'
            );
        }),
        1500,
        () => publishLoopbackAttr('vbStorageProbe', 'timeout')
    ).catch(() => {
        if (document.documentElement?.dataset?.vbStorageProbe === 'pending') {
            publishLoopbackAttr('vbStorageProbe', 'error');
        }
    });

    void withTimeout(
        runtimeSendMessage({ type: 'VB_TEST_CLEAR_YT_CDN_OVERRIDE' }).then((response) => {
            publishLoopbackAttr(
                'vbRuntimeProbe',
                isRecord(response) && response.ok === true ? 'ok' : 'empty'
            );
        }),
        1500,
        () => publishLoopbackAttr('vbRuntimeProbe', 'timeout')
    ).catch(() => {
        if (document.documentElement?.dataset?.vbRuntimeProbe === 'pending') {
            publishLoopbackAttr('vbRuntimeProbe', 'error');
        }
    });

    void withTimeout(
        rawStorageProbe(storageKey, `${token}:raw`).then((result) => {
            publishLoopbackAttr(
                'vbStorageRawProbe',
                result[storageKey] === `${token}:raw` ? 'ok' : 'mismatch'
            );
        }),
        1500,
        () => publishLoopbackAttr('vbStorageRawProbe', 'timeout')
    ).catch(() => {
        if (document.documentElement?.dataset?.vbStorageRawProbe === 'pending') {
            publishLoopbackAttr('vbStorageRawProbe', 'error');
        }
    });

    void withTimeout(
        rawRuntimeProbe().then((response) => {
            publishLoopbackAttr(
                'vbRuntimeRawProbe',
                isRecord(response) && response.ok === true ? 'ok' : 'empty'
            );
        }),
        1500,
        () => publishLoopbackAttr('vbRuntimeRawProbe', 'timeout')
    ).catch(() => {
        if (document.documentElement?.dataset?.vbRuntimeRawProbe === 'pending') {
            publishLoopbackAttr('vbRuntimeRawProbe', 'error');
        }
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
    const ytSubtitleOn = settings.yt_subtitle.enabled === true;
    const ytCdnStatusOn = settings.yt_config.showCdnCountry === true;
    const bbBlockSpaceOn = settings.bb_block_space !== false;
    const ytMemberBlockOn = settings.yt_member_block === true;
    const bbSubtitleOn = settings.bb_subtitle.enabled === true;
    const bbCdnOn = settings.bb_cdn.enabled === true;
    const bbQualityOn = settings.bb_quality.enabled === true;

    h5Enhancer.updateSettings(settings);
    youtubeSeekBlocker.updateSettings(settings);
    youtubeOriginalAudio.updateSettings(settings);
    youtubeSubtitleOverlay.updateSettings(settings);
    youtubeMemberBlocker.updateSettings(settings);
    bilibiliAutoSubtitle.updateSettings(settings);
    bilibiliAutoQuality.updateSettings(settings);
    youtubeCdnStatus.updateSettings(settings);
    statsSpeedConverter.updateSettings(settings);

    setFeatureEnabled(0, settings.h5_enabled !== false);
    setFeatureEnabled(1, settings.ap_enabled !== false);
    setFeatureEnabled(2, bndOn);
    setFeatureEnabled(3, ytBlockNativeOn);
    setFeatureEnabled(4, ytFastPauseOn);
    setFeatureEnabled(5, ytOriginalAudioOn);
    setFeatureEnabled(6, ytSubtitleOn);
    setFeatureEnabled(7, bbBlockSpaceOn);
    setFeatureEnabled(8, ytMemberBlockOn);
    setFeatureEnabled(9, bbSubtitleOn);
    setFeatureEnabled(10, bbCdnOn);
    setFeatureEnabled(11, ytCdnStatusOn);
    setFeatureEnabled(12, statsSpeedConverterOn);
    setFeatureEnabled(13, bbQualityOn);

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
        autoPauseInstance?.setPopupFocusOverride(message.active === true);
        sendResponse({ ok: true });
    } else if (message.type === 'VB_CDN_SPEED_TEST' && Array.isArray(message.nodes)) {
        const results: Record<string, { speed: string; error: boolean }> = {};
        bilibiliCdn.runSpeedTest(
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
        );
        sendResponse({ started: true });
    } else if (message.type === 'VB_CDN_ABORT_SPEED_TEST') {
        bilibiliCdn.abortSpeedTest();
        sendResponse({ aborted: true });
    } else if (message.type === 'VB_BB_SUBTITLE_CURRENT_UPLOADER') {
        sendResponse({
            uploader: bilibiliAutoSubtitle.getCurrentUploaderProfile()
        });
    }
});
