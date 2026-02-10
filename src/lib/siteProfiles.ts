import { normalizeDomain } from './domain';

export type SiteKey = 'youtube' | 'bilibili' | 'iqiyi' | 'youku' | 'qq';

type FastPauseConfig = {
    videoAreaSelectors: string[];
    controlSelectors: string[];
};

type SiteProfile = {
    domains: string[];
    fullscreenSelector?: string;
    autoPauseContainerSelectors?: string[];
    fastPause?: FastPauseConfig;
};

const SITE_PROFILES: Record<SiteKey, SiteProfile> = {
    youtube: {
        domains: ['youtube.com', 'youtu.be'],
        fullscreenSelector: '.ytp-fullscreen-button',
        autoPauseContainerSelectors: ['#movie_player'],
        fastPause: {
            videoAreaSelectors: ['#movie_player', '.html5-video-container'],
            controlSelectors: [
                '.ytp-chrome-bottom',
                '.ytp-chrome-top',
                '.ytp-settings-menu',
                '.ytp-popup',
                '.ytp-tooltip',
                '.ytp-button',
                '.ytp-skip-ad-button',
                '.ytp-ad-component--clickable',
                '.ytp-menuitem',
                '.ytp-panel',
                '.ytp-ce-element',
                '.ytp-iv-player-content',
                '.ytp-progress-bar-container',
                '.ytp-scrubber-container',
                '.ytp-volume-panel',
                '.ytp-right-controls',
                '.ytp-left-controls',
                '.annotation',
                '.ytp-spinner'
            ]
        }
    },
    bilibili: {
        domains: ['bilibili.com'],
        fullscreenSelector: '.bpx-player-ctrl-full, .squirtle-video-fullscreen',
        autoPauseContainerSelectors: ['#bilibili-player', '.bpx-player-container', '.bilibili-player'],
        fastPause: {
            videoAreaSelectors: ['.bpx-player-video-wrap'],
            controlSelectors: [
                '.bpx-player-control-wrap',
                '.bpx-player-control-bottom',
                '.bpx-player-control-top',
                '.bpx-player-sending-area',
                '.bpx-player-video-btn',
                '.bpx-player-dm-input',
                '.bpx-player-tooltip',
                '.bpx-player-context-menu',
                '.bpx-player-ending-panel',
                '.bpx-player-popup',
                '.bpx-player-cmd-dm-wrap'
            ]
        }
    },
    iqiyi: {
        domains: ['iqiyi.com'],
        fullscreenSelector: '.iqp-btn-fullscreen'
    },
    youku: {
        domains: ['youku.com'],
        fullscreenSelector: '.control-fullscreen-icon'
    },
    qq: {
        domains: ['qq.com'],
        fullscreenSelector: 'txpdiv[data-report="window-fullscreen"]'
    }
};

function normalizeHost(host: string): string {
    return normalizeDomain(host) || host.trim().toLowerCase();
}

function hostMatchesDomain(host: string, domain: string): boolean {
    const normalizedHost = normalizeHost(host);
    const normalizedDomain = normalizeDomain(domain) || domain.toLowerCase();
    if (!normalizedHost || !normalizedDomain) return false;
    return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function findProfileByHost(host: string): SiteProfile | null {
    const entries = Object.values(SITE_PROFILES);
    for (const profile of entries) {
        if (profile.domains.some((domain) => hostMatchesDomain(host, domain))) {
            return profile;
        }
    }
    return null;
}

function getCurrentHost(): string {
    if (typeof window === 'undefined') return '';
    return window.location.host;
}

export function isSiteHost(site: SiteKey, host: string = getCurrentHost()): boolean {
    const profile = SITE_PROFILES[site];
    return profile.domains.some((domain) => hostMatchesDomain(host, domain));
}

export function getFastPauseConfig(site: SiteKey): FastPauseConfig | null {
    return SITE_PROFILES[site].fastPause || null;
}

export function getFullscreenSelectorForHost(host: string = getCurrentHost()): string | null {
    return findProfileByHost(host)?.fullscreenSelector || null;
}

export function getAutoPauseContainerSelectorsForHost(host: string = getCurrentHost()): string[] | null {
    const selectors = findProfileByHost(host)?.autoPauseContainerSelectors;
    return selectors ? [...selectors] : null;
}
