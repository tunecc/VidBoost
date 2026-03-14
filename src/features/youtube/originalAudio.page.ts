import {
    YT_ORIGINAL_AUDIO_BRIDGE_CHANNEL,
    YT_ORIGINAL_AUDIO_CONTENT_SOURCE,
    YT_ORIGINAL_AUDIO_PAGE_SOURCE,
    type YouTubeOriginalAudioPageConfig
} from './originalAudio.shared';

type BridgeToPageMessage = {
    source: string;
    channel: string;
    type: 'initial' | 'change';
    config: YouTubeOriginalAudioPageConfig;
};

type TrackMeta = {
    id: string;
    name: string;
};

type YouTubePlayerElement = HTMLElement & {
    getPlayerState?: () => number;
    addEventListener?: (eventName: string, listener: (value: unknown) => void) => void;
    removeEventListener?: (eventName: string, listener: (value: unknown) => void) => void;
    getAvailableAudioTracks?: () => unknown[];
    getAudioTrack?: () => { id?: string } | null;
    setAudioTrack?: (track: unknown) => void;
};

const PAGE_GLOBAL_KEY = '__VB_YT_ORIGINAL_AUDIO__';
const ORIGINAL_TRACK_MARKERS = [
    'original',
    'originale',
    'originele',
    'originalna',
    'orijinal',
    'orihinal',
    'orixinal',
    'izvorno',
    'izvirnik',
    'oriģināls',
    'algne',
    'asli',
    'asal',
    'goc',
    'ต้นฉบับ',
    '原始',
    '原声',
    '原聲',
    '原文',
    'オリジナル',
    '원본',
    '원어',
    'оригин',
    'оригін',
    'mool',
    'مول',
    'मूल',
    'মূল',
    'மூல',
    'మూల',
    'ਮੂਲ',
    'اصل',
    'اصلی',
    'اصلي',
    'gốc',
    'halisi'
].map(normalizeText);

(() => {
    const host = window as unknown as Record<string, unknown>;
    if (host[PAGE_GLOBAL_KEY]) return;
    host[PAGE_GLOBAL_KEY] = true;

    let enabled = false;
    let scheduleTimer: number | null = null;
    let currentRunId = 0;
    let lastHandledKey = '';

    window.addEventListener('message', handleBridgeMessage as EventListener);
    window.addEventListener('popstate', () => scheduleCheck(250));
    document.addEventListener('yt-navigate-finish', () => scheduleCheck(350), true);

    window.postMessage({
        source: YT_ORIGINAL_AUDIO_PAGE_SOURCE,
        channel: YT_ORIGINAL_AUDIO_BRIDGE_CHANNEL,
        type: 'init'
    }, window.location.origin);

    function handleBridgeMessage(event: MessageEvent<unknown>) {
        if (event.source !== window) return;
        const data = event.data;
        if (!isRecord(data)) return;

        const message = data as BridgeToPageMessage;
        if (message.source !== YT_ORIGINAL_AUDIO_CONTENT_SOURCE) return;
        if (message.channel !== YT_ORIGINAL_AUDIO_BRIDGE_CHANNEL) return;
        if (message.type !== 'initial' && message.type !== 'change') return;

        updateConfig(message.config);
    }

    function updateConfig(next: unknown) {
        const record = isRecord(next) ? next : {};
        const nextEnabled = record.enabled === true;
        if (nextEnabled === enabled) return;
        enabled = nextEnabled;
        if (!enabled && scheduleTimer != null) {
            window.clearTimeout(scheduleTimer);
            scheduleTimer = null;
        }
        if (enabled) {
            lastHandledKey = '';
            scheduleCheck(0);
        }
    }

    function scheduleCheck(delay = 0) {
        if (!enabled) return;
        currentRunId += 1;
        const runId = currentRunId;
        if (scheduleTimer != null) {
            window.clearTimeout(scheduleTimer);
        }
        scheduleTimer = window.setTimeout(() => {
            scheduleTimer = null;
            void runSwitch(runId);
        }, delay);
    }

    async function runSwitch(runId: number) {
        if (!enabled || runId !== currentRunId) return;
        if (!isSupportedPage()) return;
        const pageKey = getPageKey();
        if (pageKey === lastHandledKey) return;

        const player = await waitForPlayer();
        if (!enabled || runId !== currentRunId) return;
        if (!player) return;

        await switchPlayerToOriginalAudio(player);
        lastHandledKey = pageKey;
    }
})();

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function normalizeText(input: string): string {
    return input.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function findPlayer(): YouTubePlayerElement | null {
    const player = document.querySelector<HTMLElement>('#movie_player, #shorts-player');
    return player as YouTubePlayerElement | null;
}

function getPageKey(): string {
    return `${location.pathname}${location.search}`;
}

function isSupportedPage(): boolean {
    return location.pathname === '/watch' || location.pathname.startsWith('/shorts/');
}

function waitForPlayer(timeoutMs = 8000): Promise<YouTubePlayerElement | null> {
    const existing = findPlayer();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
        const expectedUrl = location.href;
        let settled = false;
        let timeoutId = 0;
        let observer: MutationObserver | null = null;

        const finish = (player: YouTubePlayerElement | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            observer?.disconnect();
            resolve(player);
        };

        const check = () => {
            if (location.href !== expectedUrl) {
                finish(null);
                return;
            }
            const player = findPlayer();
            if (player) finish(player);
        };

        timeoutId = window.setTimeout(() => finish(findPlayer()), timeoutMs);
        observer = new MutationObserver(check);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        check();
    });
}

function extractTrackMeta(track: unknown): TrackMeta | null {
    if (!isRecord(track)) return null;

    if (typeof track.id === 'string' && typeof track.name === 'string') {
        return { id: track.id, name: track.name };
    }

    for (const value of Object.values(track)) {
        if (!isRecord(value)) continue;
        if (typeof value.id === 'string' && typeof value.name === 'string') {
            return { id: value.id, name: value.name };
        }
    }

    return null;
}

function extractTrackId(track: unknown): string | null {
    if (!isRecord(track)) return null;
    if (typeof track.id === 'string') return track.id;

    for (const value of Object.values(track)) {
        if (!isRecord(value)) continue;
        if (typeof value.id === 'string') return value.id;
    }

    return null;
}

function isOriginalTrackName(name: string): boolean {
    const normalized = normalizeText(name);
    return ORIGINAL_TRACK_MARKERS.some((marker) => normalized.includes(marker));
}

function safeCall<T>(fn: () => T): T | undefined {
    try {
        return fn();
    } catch {
        return undefined;
    }
}

function waitForPlaying(player: YouTubePlayerElement, timeoutMs = 4000): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        let timeoutId = 0;

        const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            safeCall(() => player.removeEventListener?.('onStateChange', onStateChange));
            resolve(value);
        };

        const onStateChange = (state: unknown) => {
            if (state === 1 || state === '1') {
                finish(true);
            }
        };

        timeoutId = window.setTimeout(() => finish(false), timeoutMs);

        try {
            player.addEventListener?.('onStateChange', onStateChange);
        } catch {
            finish(false);
        }
    });
}

async function switchPlayerToOriginalAudio(player: YouTubePlayerElement) {
    const playerState = safeCall(() => player.getPlayerState?.());
    if (typeof playerState === 'number' && playerState !== 1) {
        const playing = await waitForPlaying(player);
        if (!playing) return;
    }

    const tracks = safeCall(() => player.getAvailableAudioTracks?.());
    if (!Array.isArray(tracks) || tracks.length <= 1) return;

    const originalTrack = tracks.find((track) => {
        const meta = extractTrackMeta(track);
        return meta ? isOriginalTrackName(meta.name) : false;
    });
    if (!originalTrack) return;

    const targetMeta = extractTrackMeta(originalTrack);
    if (!targetMeta) return;

    const activeTrack = safeCall(() => player.getAudioTrack?.());
    const activeTrackId = extractTrackId(activeTrack);
    if (activeTrackId && activeTrackId === targetMeta.id) return;

    safeCall(() => player.setAudioTrack?.(originalTrack));
}
