import {
    DEFAULT_YT_ORIGINAL_AUDIO_PAGE_CONFIG,
    YT_ORIGINAL_AUDIO_BRIDGE_CHANNEL,
    YT_ORIGINAL_AUDIO_CONTENT_SOURCE,
    YT_ORIGINAL_AUDIO_INJECTED_SCRIPT_ID,
    YT_ORIGINAL_AUDIO_PAGE_SCRIPT_PATH,
    YT_ORIGINAL_AUDIO_PAGE_SOURCE,
    cloneYouTubeOriginalAudioPageConfig,
    type YouTubeOriginalAudioPageConfig
} from './originalAudio.shared';
import { isPageBridgeMessageEvent } from './bridge';
import { getRuntimeUrl, isFirefoxExtensionRuntime } from '../../lib/webext';

let bridgeListenerInstalled = false;
let scriptInjected = false;
let latestConfig: YouTubeOriginalAudioPageConfig = { ...DEFAULT_YT_ORIGINAL_AUDIO_PAGE_CONFIG };

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function postConfigToPage(type: 'initial' | 'change') {
    if (typeof window === 'undefined') return;
    window.postMessage({
        source: YT_ORIGINAL_AUDIO_CONTENT_SOURCE,
        channel: YT_ORIGINAL_AUDIO_BRIDGE_CHANNEL,
        type,
        config: cloneYouTubeOriginalAudioPageConfig(latestConfig)
    }, window.location.origin);
}

function handlePageMessage(event: MessageEvent<unknown>) {
    if (!isPageBridgeMessageEvent(event)) return;
    if (!isRecord(event.data)) return;
    const data = event.data as Record<string, unknown>;
    if (data.source !== YT_ORIGINAL_AUDIO_PAGE_SOURCE) return;
    if (data.channel !== YT_ORIGINAL_AUDIO_BRIDGE_CHANNEL) return;
    if (data.type !== 'init') return;

    postConfigToPage('initial');
}

function ensureBridgeListener() {
    if (typeof window === 'undefined') return;
    if (bridgeListenerInstalled) return;
    window.addEventListener('message', handlePageMessage as EventListener);
    bridgeListenerInstalled = true;
}

function resolvePageScriptUrl(): string | null {
    return getRuntimeUrl(YT_ORIGINAL_AUDIO_PAGE_SCRIPT_PATH);
}

export function installYouTubeOriginalAudioBridge() {
    ensureBridgeListener();
}

export function ensureYouTubeOriginalAudioScriptInjected() {
    if (typeof document === 'undefined') return;
    ensureBridgeListener();
    if (scriptInjected) return;

    if (isFirefoxExtensionRuntime()) {
        scriptInjected = true;
        return;
    }

    if (document.getElementById(YT_ORIGINAL_AUDIO_INJECTED_SCRIPT_ID)) {
        scriptInjected = true;
        return;
    }

    const scriptUrl = resolvePageScriptUrl();
    if (!scriptUrl) return;

    const root = document.documentElement || document.head;
    if (!root) return;

    const script = document.createElement('script');
    script.id = YT_ORIGINAL_AUDIO_INJECTED_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = false;
    script.addEventListener('load', () => {
        script.remove();
    }, { once: true });
    script.addEventListener('error', () => {
        scriptInjected = false;
        script.remove();
    }, { once: true });

    root.appendChild(script);
    scriptInjected = true;
}

export function pushYouTubeOriginalAudioConfig(config: YouTubeOriginalAudioPageConfig) {
    latestConfig = cloneYouTubeOriginalAudioPageConfig(config);
    postConfigToPage('change');
}
