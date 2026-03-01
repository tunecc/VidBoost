import {
    DEFAULT_MEMBER_NETWORK_PREFILTER_CONFIG,
    MEMBER_NETWORK_PREFILTER_BRIDGE_CHANNEL,
    MEMBER_NETWORK_PREFILTER_CONTENT_SOURCE,
    MEMBER_NETWORK_PREFILTER_INJECTED_SCRIPT_ID,
    MEMBER_NETWORK_PREFILTER_PAGE_SCRIPT_PATH,
    MEMBER_NETWORK_PREFILTER_PAGE_SOURCE,
    cloneMemberNetworkPrefilterConfig,
    type MemberNetworkPrefilterConfig
} from './memberNetworkPrefilter.shared';

let bridgeInstalled = false;
let bridgeListenerInstalled = false;
let latestConfig: MemberNetworkPrefilterConfig = { ...DEFAULT_MEMBER_NETWORK_PREFILTER_CONFIG };

type BridgeToPageMessage = {
    source: string;
    channel: string;
    type: 'initial' | 'change';
    config: MemberNetworkPrefilterConfig;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function postConfigToPage(type: 'initial' | 'change') {
    if (typeof window === 'undefined') return;
    const payload: BridgeToPageMessage = {
        source: MEMBER_NETWORK_PREFILTER_CONTENT_SOURCE,
        channel: MEMBER_NETWORK_PREFILTER_BRIDGE_CHANNEL,
        type,
        config: cloneMemberNetworkPrefilterConfig(latestConfig)
    };
    window.postMessage(payload, window.location.origin);
}

function handleInitRequest(event: MessageEvent<unknown>) {
    if (event.source !== window) return;
    if (!isRecord(event.data)) return;
    if (event.data.source !== MEMBER_NETWORK_PREFILTER_PAGE_SOURCE) return;
    if (event.data.channel !== MEMBER_NETWORK_PREFILTER_BRIDGE_CHANNEL) return;
    if (event.data.type !== 'init') return;
    postConfigToPage('initial');
}

function ensureBridgeListener() {
    if (typeof window === 'undefined') return;
    if (bridgeListenerInstalled) return;
    window.addEventListener('message', handleInitRequest as EventListener);
    bridgeListenerInstalled = true;
}

function resolvePageScriptUrl(): string | null {
    if (typeof chrome === 'undefined') return null;
    if (!chrome.runtime || typeof chrome.runtime.getURL !== 'function') return null;
    return chrome.runtime.getURL(MEMBER_NETWORK_PREFILTER_PAGE_SCRIPT_PATH);
}

export function installMemberNetworkPrefilterBridge() {
    if (typeof document === 'undefined') return;
    ensureBridgeListener();
    if (bridgeInstalled) return;

    if (document.getElementById(MEMBER_NETWORK_PREFILTER_INJECTED_SCRIPT_ID)) {
        bridgeInstalled = true;
        return;
    }

    const scriptUrl = resolvePageScriptUrl();
    if (!scriptUrl) return;

    const root = document.documentElement || document.head;
    if (!root) return;

    const script = document.createElement('script');
    script.id = MEMBER_NETWORK_PREFILTER_INJECTED_SCRIPT_ID;
    script.src = scriptUrl;
    script.async = false;
    script.addEventListener('load', () => {
        script.remove();
    }, { once: true });
    script.addEventListener('error', () => {
        bridgeInstalled = false;
        script.remove();
    }, { once: true });

    root.appendChild(script);
    bridgeInstalled = true;
}

export function pushMemberNetworkPrefilterConfig(config: MemberNetworkPrefilterConfig) {
    latestConfig = cloneMemberNetworkPrefilterConfig(config);
    if (!bridgeInstalled) return;
    postConfigToPage('change');
}
