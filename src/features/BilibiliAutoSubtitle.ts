import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import type { BilibiliSubtitleConfig } from '../lib/settings';

const INITIAL_DELAY_MS = 1200;
const NAVIGATION_DELAY_MS = 1800;
const RETRY_INTERVAL_MS = 600;
const MAX_RETRIES = 18;

const PLAYER_SELECTOR = '#bilibili-player, .bpx-player-container, .bilibili-player, video';
const SUBTITLE_ITEM_SELECTOR = '.bpx-player-ctrl-subtitle-language-item';
const PREFERRED_SUBTITLE_SELECTORS = [
    '.bpx-player-ctrl-subtitle-major .bpx-player-ctrl-subtitle-language-item[data-lan^="ai-zh"]',
    '.bpx-player-ctrl-subtitle-language-item[data-lan^="ai-zh"]',
    '.bpx-player-ctrl-subtitle-major .bpx-player-ctrl-subtitle-language-item[data-lan="zh-Hans"]',
    '.bpx-player-ctrl-subtitle-language-item[data-lan="zh-Hans"]',
    '.bpx-player-ctrl-subtitle-major .bpx-player-ctrl-subtitle-language-item[data-lan="zh-CN"]',
    '.bpx-player-ctrl-subtitle-language-item[data-lan="zh-CN"]',
    '.bpx-player-ctrl-subtitle-major .bpx-player-ctrl-subtitle-language-item[data-lan^="zh"]',
    '.bpx-player-ctrl-subtitle-language-item[data-lan^="zh"]'
];
const UP_LINK_SELECTORS = [
    '#v_upinfo a[href*="space.bilibili.com/"]',
    '.up-info-container a[href*="space.bilibili.com/"]',
    '.up-detail-top a[href*="space.bilibili.com/"]',
    '.video-owner a[href*="space.bilibili.com/"]',
    'a.up-name[href*="space.bilibili.com/"]'
];
const UP_NAME_SELECTORS = [
    '#v_upinfo .up-name',
    '#v_upinfo [class*="up-name"]',
    '.up-info-container .up-name',
    '.up-info-container [class*="username"]',
    '.up-detail-top .up-name',
    '.video-owner .up-name',
    '.video-owner [class*="username"]',
    'a.up-name'
];
const SUPPORTED_PATH_PREFIXES = ['/video/', '/bangumi/play/', '/medialist/play/', '/list/watchlater'];
const CHINESE_SUBTITLE_MARKERS = [
    'ai字幕',
    'aichinese',
    '中文字幕',
    '中文（自动生成）',
    '中文',
    '简体',
    '繁体',
    'chinese'
];

type ApplyResult = 'done' | 'retry';

export type BilibiliUploaderProfile = {
    uid: string | null;
    name: string | null;
    profileUrl: string | null;
};

function normalizeText(value: string): string {
    return value.toLowerCase().normalize('NFKC').replace(/\s+/g, '');
}

function decodeJsonString(value: string): string {
    try {
        return JSON.parse(`"${value}"`) as string;
    } catch {
        return value;
    }
}

function stripTargetNote(value: string): string {
    return value.split(/[|｜]/, 1)[0]?.trim() ?? value.trim();
}

function sanitizeUploaderName(value: string | null | undefined): string | null {
    if (!value) return null;

    const normalized = value
        .replace(/\s+/g, ' ')
        .replace(/的个人空间$/u, '')
        .replace(/\s*UP主$/u, '')
        .trim();

    return normalized || null;
}

function extractUploaderMid(value: string): string | null {
    const trimmed = stripTargetNote(value);
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;

    const match = trimmed.match(/space\.bilibili\.com\/(\d+)/i);
    return match?.[1] ?? null;
}

function normalizeTargetValue(value: string): string | null {
    const trimmed = stripTargetNote(value);
    if (!trimmed) return null;

    const mid = extractUploaderMid(trimmed);
    if (mid) return mid;

    const normalized = trimmed
        .replace(/^@/, '')
        .replace(/^https?:\/\/(space\.)?bilibili\.com\//i, '')
        .replace(/^space\.bilibili\.com\//i, '')
        .replace(/\/+$/, '')
        .toLowerCase();

    return normalized || null;
}

function isActiveSubtitleItem(button: HTMLElement): boolean {
    return button.classList.contains('bpx-state-active')
        || button.classList.contains('active')
        || button.getAttribute('aria-checked') === 'true'
        || button.dataset.state === 'active';
}

function addNormalizedTarget(targets: Set<string>, value: string | null) {
    if (!value) return;
    const normalized = normalizeTargetValue(value);
    if (normalized) targets.add(normalized);
}

function readUploaderNameFromElement(element: Element | null): string | null {
    if (!element) return null;

    const candidates = [
        element.textContent,
        element.getAttribute('title'),
        element.getAttribute('aria-label'),
        element.getAttribute('data-name'),
        element.getAttribute('data-uname')
    ];

    if (element instanceof HTMLAnchorElement) {
        candidates.push(element.title);
    }

    const image = element.querySelector('img[alt], img[title]');
    if (image instanceof HTMLImageElement) {
        candidates.push(image.alt, image.title);
    }

    for (const candidate of candidates) {
        const sanitized = sanitizeUploaderName(candidate);
        if (sanitized) return sanitized;
    }

    return null;
}

export class BilibiliAutoSubtitle implements Feature {
    private enabled = false;
    private config: BilibiliSubtitleConfig = {
        enabled: false,
        targetMode: 'all',
        targets: []
    };
    private titleObserver: MutationObserver | null = null;
    private retryTimer: number | null = null;
    private retryCount = 0;
    private lastSeenUrl = '';
    private lastHandledPageKey = '';
    private uploaderCachePageKey = '';
    private uploaderCacheTargets: string[] | null = null;
    private uploaderCacheProfile: BilibiliUploaderProfile | null = null;

    private readonly handleNavigationSignal = () => {
        this.maybeHandleNavigation();
    };

    private readonly handleVisibilityChange = () => {
        if (document.visibilityState !== 'visible') return;
        this.scheduleApply(350, false);
    };

    mount() {
        if (!isSiteHost('bilibili')) return;
        if (this.enabled) return;

        this.enabled = true;
        this.lastSeenUrl = location.href;
        this.resetPageState();
        this.retryCount = 0;

        window.addEventListener('popstate', this.handleNavigationSignal);
        document.addEventListener('visibilitychange', this.handleVisibilityChange, true);
        this.installTitleObserver();
        this.scheduleApply(INITIAL_DELAY_MS);
    }

    unmount() {
        this.enabled = false;
        this.clearRetryTimer();
        this.retryCount = 0;
        this.lastSeenUrl = '';
        this.resetPageState();

        window.removeEventListener('popstate', this.handleNavigationSignal);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange, true);
        this.titleObserver?.disconnect();
        this.titleObserver = null;
    }

    updateSettings(settings: unknown) {
        const record = settings as Record<string, unknown> | undefined;
        if (!record) return;

        const subtitleConfig = record.bb_subtitle as BilibiliSubtitleConfig | undefined;
        if (subtitleConfig) {
            this.config = {
                enabled: subtitleConfig.enabled === true,
                targetMode: subtitleConfig.targetMode ?? 'all',
                targets: Array.isArray(subtitleConfig.targets) ? [...subtitleConfig.targets] : []
            };
        }

        if (!this.enabled) return;

        this.resetPageState();
        if (this.config.enabled) {
            this.scheduleApply(0);
        } else {
            this.clearRetryTimer();
        }
    }

    private installTitleObserver() {
        this.titleObserver?.disconnect();

        const target = document.head ?? document.documentElement;
        if (!target) return;

        this.titleObserver = new MutationObserver(() => {
            this.maybeHandleNavigation();
        });
        this.titleObserver.observe(target, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    private maybeHandleNavigation() {
        if (!this.enabled) return;

        const currentUrl = location.href;
        if (currentUrl === this.lastSeenUrl) return;

        this.lastSeenUrl = currentUrl;
        this.resetPageState();
        this.scheduleApply(NAVIGATION_DELAY_MS);
    }

    private scheduleApply(delay: number, resetRetries = true) {
        if (!this.enabled || !this.config.enabled || !isSiteHost('bilibili')) return;
        if (resetRetries) this.retryCount = 0;

        this.clearRetryTimer();
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.runApplyAttempt();
        }, delay);
    }

    private clearRetryTimer() {
        if (this.retryTimer == null) return;
        window.clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private runApplyAttempt() {
        if (!this.enabled || !this.config.enabled || !isSiteHost('bilibili')) return;
        if (!this.isSupportedPage()) return;
        if (!this.matchesTargetFilter()) return;

        const pageKey = this.getPageKey();
        if (this.lastHandledPageKey === pageKey) return;

        const result = this.tryEnablePreferredSubtitle();
        if (result === 'done') {
            this.lastHandledPageKey = pageKey;
            return;
        }

        if (this.retryCount >= MAX_RETRIES) return;
        this.retryCount += 1;
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.runApplyAttempt();
        }, RETRY_INTERVAL_MS);
    }

    private tryEnablePreferredSubtitle(): ApplyResult {
        if (!document.querySelector(PLAYER_SELECTOR)) return 'retry';

        const buttons = this.getSubtitleButtons();
        if (buttons.length === 0) return 'retry';

        const activeButton = buttons.find((button) => isActiveSubtitleItem(button));
        if (activeButton && this.isChineseSubtitleButton(activeButton)) {
            return 'done';
        }

        const targetButton = this.findPreferredSubtitleButton(buttons);
        if (!targetButton) return 'retry';

        targetButton.click();
        return 'done';
    }

    private getSubtitleButtons(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>(SUBTITLE_ITEM_SELECTOR));
    }

    private findPreferredSubtitleButton(existingButtons: HTMLElement[]): HTMLElement | null {
        const seen = new Set<HTMLElement>();

        for (const selector of PREFERRED_SUBTITLE_SELECTORS) {
            const button = document.querySelector<HTMLElement>(selector);
            if (button) return button;
        }

        for (const button of existingButtons) {
            if (seen.has(button)) continue;
            seen.add(button);
            if (this.isChineseSubtitleButton(button)) {
                return button;
            }
        }

        return null;
    }

    private isChineseSubtitleButton(button: HTMLElement): boolean {
        const lan = (button.dataset.lan ?? button.getAttribute('data-lan') ?? '').trim().toLowerCase();
        if (lan.startsWith('ai-zh') || lan === 'zh-hans' || lan === 'zh-cn' || lan.startsWith('zh')) {
            return true;
        }

        const text = normalizeText(button.textContent ?? '');
        return CHINESE_SUBTITLE_MARKERS.some((marker) => text.includes(marker));
    }

    private isSupportedPage(): boolean {
        if (!isSiteHost('bilibili')) return false;
        return SUPPORTED_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
    }

    private getPageKey(): string {
        return `${location.pathname}${location.search}`;
    }

    private matchesTargetFilter(): boolean {
        if (this.config.targetMode !== 'allowlist') return true;

        const expectedTargets = new Set(
            this.config.targets
                .map((item) => normalizeTargetValue(item))
                .filter((item): item is string => Boolean(item))
        );
        if (expectedTargets.size === 0) return false;

        const currentTargets = this.getCurrentUploaderTargets();
        if (currentTargets.length === 0) return false;

        return currentTargets.some((item) => expectedTargets.has(item));
    }

    getCurrentUploaderProfile(): BilibiliUploaderProfile | null {
        if (!isSiteHost('bilibili')) return null;
        if (!this.isSupportedPage()) return null;

        const pageKey = this.getPageKey();
        if (this.uploaderCachePageKey === pageKey && this.uploaderCacheProfile) {
            return { ...this.uploaderCacheProfile };
        }

        this.refreshUploaderCache();
        return this.uploaderCacheProfile ? { ...this.uploaderCacheProfile } : null;
    }

    private resetPageState() {
        this.lastHandledPageKey = '';
        this.uploaderCachePageKey = '';
        this.uploaderCacheTargets = null;
        this.uploaderCacheProfile = null;
    }

    private getCurrentUploaderTargets(): string[] {
        const pageKey = this.getPageKey();
        if (this.uploaderCachePageKey === pageKey && this.uploaderCacheTargets) {
            return [...this.uploaderCacheTargets];
        }

        this.refreshUploaderCache();
        return this.uploaderCacheTargets ? [...this.uploaderCacheTargets] : [];
    }

    private refreshUploaderCache() {
        const pageKey = this.getPageKey();
        const fromDom = this.collectUploaderDataFromDom();
        const needsStateFallback = !fromDom.profile?.uid || !fromDom.profile?.name;
        const fromState = needsStateFallback ? this.collectUploaderDataFromInitialState() : null;

        const mergedTargets = new Set<string>([
            ...fromDom.targets,
            ...(fromState?.targets ?? [])
        ]);

        const resolvedUid = fromDom.profile?.uid ?? fromState?.profile?.uid ?? null;
        const resolvedName = fromDom.profile?.name ?? fromState?.profile?.name ?? null;
        const resolvedProfileUrl = fromDom.profile?.profileUrl
            ?? fromState?.profile?.profileUrl
            ?? (resolvedUid ? `https://space.bilibili.com/${resolvedUid}` : null);
        const resolvedProfile = resolvedUid || resolvedName || resolvedProfileUrl
            ? {
                uid: resolvedUid,
                name: resolvedName,
                profileUrl: resolvedProfileUrl
            }
            : null;

        addNormalizedTarget(mergedTargets, resolvedUid);
        addNormalizedTarget(mergedTargets, resolvedName);

        this.uploaderCachePageKey = pageKey;
        this.uploaderCacheTargets = [...mergedTargets];
        this.uploaderCacheProfile = resolvedProfile;
    }

    private collectUploaderDataFromDom(): {
        profile: BilibiliUploaderProfile | null;
        targets: string[];
    } {
        const seen = new Set<string>();
        let uid: string | null = null;
        let name: string | null = null;
        let profileUrl: string | null = null;

        for (const selector of UP_LINK_SELECTORS) {
            const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(selector));
            for (const link of links) {
                addNormalizedTarget(seen, link.href);
                const candidateName = readUploaderNameFromElement(link);
                addNormalizedTarget(seen, candidateName);

                uid = uid ?? extractUploaderMid(link.href);
                name = name ?? candidateName;
                profileUrl = profileUrl ?? (link.href || null);
            }
        }

        if (!name) {
            for (const selector of UP_NAME_SELECTORS) {
                const element = document.querySelector(selector);
                const candidateName = readUploaderNameFromElement(element);
                if (!candidateName) continue;
                name = candidateName;
                addNormalizedTarget(seen, candidateName);
                break;
            }
        }

        const profile = uid || name || profileUrl
            ? {
                uid,
                name,
                profileUrl: profileUrl || (uid ? `https://space.bilibili.com/${uid}` : null)
            }
            : null;

        return {
            profile,
            targets: [...seen]
        };
    }

    private collectUploaderDataFromInitialState(): {
        profile: BilibiliUploaderProfile | null;
        targets: string[];
    } | null {
        const scripts = Array.from(document.scripts);
        for (const script of scripts) {
            const source = script.textContent ?? '';
            if (!source.includes('__INITIAL_STATE__')) continue;

            const data = this.extractUploaderDataFromStateText(source);
            if (data.targets.length > 0 || data.profile) return data;
        }

        return null;
    }

    private extractUploaderDataFromStateText(source: string): {
        profile: BilibiliUploaderProfile | null;
        targets: string[];
    } {
        const targets = new Set<string>();

        const upDataMatch = source.match(
            /"upData"\s*:\s*\{[\s\S]*?"mid"\s*:\s*"?(?<mid>\d+)"?[\s\S]*?"name"\s*:\s*"(?<name>(?:\\.|[^"\\])*)"/
        );
        const ownerMatch = source.match(
            /"owner"\s*:\s*\{[\s\S]*?"mid"\s*:\s*"?(?<mid>\d+)"?[\s\S]*?"name"\s*:\s*"(?<name>(?:\\.|[^"\\])*)"/
        );

        addNormalizedTarget(targets, upDataMatch?.groups?.mid ?? null);
        addNormalizedTarget(targets, decodeJsonString(upDataMatch?.groups?.name ?? ''));
        addNormalizedTarget(targets, ownerMatch?.groups?.mid ?? null);
        addNormalizedTarget(targets, decodeJsonString(ownerMatch?.groups?.name ?? ''));

        const uid = upDataMatch?.groups?.mid ?? ownerMatch?.groups?.mid ?? null;
        const nameRaw = upDataMatch?.groups?.name ?? ownerMatch?.groups?.name ?? '';
        const name = nameRaw ? decodeJsonString(nameRaw) : null;

        return {
            profile: uid || name
                ? {
                    uid,
                    name,
                    profileUrl: uid ? `https://space.bilibili.com/${uid}` : null
                }
                : null,
            targets: [...targets]
        };
    }
}
