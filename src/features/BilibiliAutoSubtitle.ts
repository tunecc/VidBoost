import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import type { BilibiliSubtitleConfig } from '../lib/settings';
import {
    collectCurrentBilibiliUploaderSnapshot,
    isSupportedBilibiliVideoPage,
    normalizeBilibiliTargetValue,
    type BilibiliUploaderProfile
} from './bilibili/uploaderProfile';

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

function normalizeText(value: string): string {
    return value.toLowerCase().normalize('NFKC').replace(/\s+/g, '');
}

function isActiveSubtitleItem(button: HTMLElement): boolean {
    return button.classList.contains('bpx-state-active')
        || button.classList.contains('active')
        || button.getAttribute('aria-checked') === 'true'
        || button.dataset.state === 'active';
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
        return isSupportedBilibiliVideoPage();
    }

    private getPageKey(): string {
        return `${location.pathname}${location.search}`;
    }

    private matchesTargetFilter(): boolean {
        if (this.config.targetMode !== 'allowlist') return true;

        const expectedTargets = new Set(
            this.config.targets
                .map((item) => normalizeBilibiliTargetValue(item))
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
        const snapshot = collectCurrentBilibiliUploaderSnapshot();
        this.uploaderCachePageKey = pageKey;
        this.uploaderCacheTargets = [...snapshot.targets];
        this.uploaderCacheProfile = snapshot.profile ? { ...snapshot.profile } : null;
    }
}
