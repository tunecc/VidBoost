import {
    DEFAULT_YT_CDN_STATUS_PAGE_CONFIG,
    YT_CDN_STATUS_CONFIG_ATTRIBUTE,
    YT_CDN_STATUS_CONFIG_EVENT,
    YT_CDN_STATUS_INJECTED_SCRIPT_ID,
    YT_CDN_STATUS_PAGE_SCRIPT_PATH,
    cloneYouTubeCdnStatusPageConfig,
    type YouTubeCdnStatusPageConfig
} from './cdnStatus.shared';
import { getRuntimeUrl, isFirefoxExtensionRuntime } from '../../lib/webext';

let scriptInjected = false;
let latestConfig: YouTubeCdnStatusPageConfig = { ...DEFAULT_YT_CDN_STATUS_PAGE_CONFIG };

function publishLoopbackInjectState(key: string, value: string) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const host = window.location.hostname.trim().toLowerCase();
    const isLoopbackHost = host === '127.0.0.1'
        || host === 'localhost'
        || host === '[::1]'
        || host.endsWith('.localhost');
    if (!isLoopbackHost) return;
    if (document.documentElement?.dataset?.vbSite?.trim().toLowerCase() !== 'youtube') return;

    const root = document.documentElement;
    if (!root) return;
    root.dataset[key] = value;
}

function syncConfigToDocument() {
    if (typeof document === 'undefined') return;
    const payload = JSON.stringify(cloneYouTubeCdnStatusPageConfig(latestConfig));
    document.documentElement?.setAttribute(YT_CDN_STATUS_CONFIG_ATTRIBUTE, payload);
    document.dispatchEvent(new CustomEvent(YT_CDN_STATUS_CONFIG_EVENT, {
        detail: payload
    }));
}

function ensureBridgeListener() {
    // CDN status bridge now uses DOM attributes + CustomEvent detail strings.
}

function resolvePageScriptUrl(): string | null {
    return getRuntimeUrl(YT_CDN_STATUS_PAGE_SCRIPT_PATH);
}

export function installYouTubeCdnStatusBridge() {
    ensureBridgeListener();
}

export function ensureYouTubeCdnStatusScriptInjected() {
    if (typeof document === 'undefined') return;
    ensureBridgeListener();
    if (scriptInjected) return;

    if (isFirefoxExtensionRuntime()) {
        scriptInjected = true;
        publishLoopbackInjectState('vbYtCdnInjectLoaded', 'main-world');
        return;
    }

    if (document.getElementById(YT_CDN_STATUS_INJECTED_SCRIPT_ID)) {
        scriptInjected = true;
        return;
    }

    const scriptUrl = resolvePageScriptUrl();
    if (!scriptUrl) return;

    const root = document.documentElement || document.head;
    if (!root) return;

    const script = document.createElement('script');
    script.id = YT_CDN_STATUS_INJECTED_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = false;
    publishLoopbackInjectState('vbYtCdnInjectAttempt', '1');
    script.addEventListener('load', () => {
        publishLoopbackInjectState('vbYtCdnInjectLoaded', '1');
        script.remove();
    }, { once: true });
    script.addEventListener('error', () => {
        scriptInjected = false;
        publishLoopbackInjectState('vbYtCdnInjectError', '1');
        script.remove();
    }, { once: true });

    root.appendChild(script);
    scriptInjected = true;
}

export function pushYouTubeCdnStatusConfig(config: YouTubeCdnStatusPageConfig) {
    latestConfig = cloneYouTubeCdnStatusPageConfig(config);
    syncConfigToDocument();
}
