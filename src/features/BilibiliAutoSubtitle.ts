import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import type { BilibiliSubtitleConfig } from '../lib/settings';
import {
    isSupportedBilibiliVideoPage,
    normalizeBilibiliTargetValue,
    resolveBilibiliUploaderSnapshot,
    type BilibiliUploaderLookupReason,
    type BilibiliUploaderProfile
} from './bilibili/uploaderProfile';

const INITIAL_DELAY_MS = 1200;
const NAVIGATION_DELAY_MS = 1800;
const RETRY_INTERVAL_MS = 600;
const MAX_RETRIES = 18;
const UPLOADER_UNKNOWN_RETRY_MS = 1000;
const UPLOADER_UNKNOWN_DEADLINE_MS = 20000;
const URL_WATCH_INTERVAL_MS = 1000;
const ACTIVATION_TIMEOUT_MS = 1200;
const ACTIVATION_POLL_MS = 200;

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
type TargetMatch = 'match' | 'mismatch' | 'unknown';

export type BilibiliCurrentUploaderResult = {
    uploader: BilibiliUploaderProfile | null;
    reason?: BilibiliUploaderLookupReason;
};

function normalizeText(value: string): string {
    return value.toLowerCase().normalize('NFKC').replace(/\s+/g, '');
}

function normalizeLan(button: HTMLElement): string {
    return (button.dataset.lan ?? button.getAttribute('data-lan') ?? '').trim().toLowerCase();
}

export function isActiveSubtitleItem(button: HTMLElement): boolean {
    return button.classList.contains('bpx-state-active')
        || button.classList.contains('active')
        || button.getAttribute('aria-checked') === 'true'
        || button.dataset.state === 'active';
}

export function isChineseSubtitleButton(button: HTMLElement): boolean {
    const lan = normalizeLan(button);
    if (lan.startsWith('ai-zh') || lan === 'zh-hans' || lan === 'zh-cn' || lan.startsWith('zh')) {
        return true;
    }

    const text = normalizeText(button.textContent ?? '');
    return CHINESE_SUBTITLE_MARKERS.some((marker) => text.includes(marker));
}

export function findPreferredSubtitleButtonFromButtons(buttons: HTMLElement[]): HTMLElement | null {
    const seen = new Set<HTMLElement>();

    for (const selector of PREFERRED_SUBTITLE_SELECTORS) {
        const button = document.querySelector<HTMLElement>(selector);
        if (button) return button;
    }

    for (const button of buttons) {
        if (seen.has(button)) continue;
        seen.add(button);
        if (isChineseSubtitleButton(button)) {
            return button;
        }
    }

    return null;
}

export function matchBilibiliUploaderTargets(
    expectedTargets: Iterable<string>,
    currentTargets: string[]
): boolean {
    const expected = new Set<string>();
    for (const item of expectedTargets) {
        const normalized = normalizeBilibiliTargetValue(item);
        if (normalized) expected.add(normalized);
    }
    if (expected.size === 0) return false;
    if (currentTargets.length === 0) return false;

    return currentTargets.some((item) => expected.has(item));
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
    private urlWatchTimer: number | null = null;
    private retryCount = 0;
    private lastSeenUrl = '';
    private lastHandledPageKey = '';
    private uploaderCachePageKey = '';
    private uploaderCacheTargets: string[] = [];
    private uploaderCacheProfile: BilibiliUploaderProfile | null = null;
    private uploaderApiAttemptPageKey = '';
    private uploaderUnknownSince = 0;
    private attemptInFlight = false;

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
        this.startUrlWatch();
        this.scheduleApply(INITIAL_DELAY_MS);
    }

    unmount() {
        this.enabled = false;
        this.clearRetryTimer();
        this.stopUrlWatch();
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
            this.startUrlWatch();
            this.scheduleApply(0);
        } else {
            this.clearRetryTimer();
            this.stopUrlWatch();
        }
    }

    /**
     * Resolves the current video uploader for the popup's "add current uploader"
     * action. Only meaningful in the top frame; callers must not answer from
     * sub frames (they always lack the video detail DOM).
     */
    async resolveCurrentUploader(): Promise<BilibiliCurrentUploaderResult> {
        if (!isSiteHost('bilibili')) {
            return { uploader: null, reason: 'unsupported-page' };
        }
        if (!this.isSupportedPage()) {
            return { uploader: null, reason: 'unsupported-page' };
        }

        const pageKey = this.getPageKey();
        const cached = this.getCachedUploaderProfile(pageKey);
        if (cached) return { uploader: cached };

        const allowApiFallback = this.uploaderApiAttemptPageKey !== pageKey;
        if (allowApiFallback) this.uploaderApiAttemptPageKey = pageKey;

        const result = await resolveBilibiliUploaderSnapshot({ allowApiFallback });
        if (!result.profile) {
            return { uploader: null, reason: result.reason ?? 'not-ready' };
        }

        if (this.getPageKey() === pageKey) {
            this.storeUploaderCache(pageKey, result.targets, result.profile);
        }
        return { uploader: { ...result.profile } };
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

    private startUrlWatch() {
        if (!this.enabled || !this.config.enabled || this.urlWatchTimer != null) return;
        if (typeof window === 'undefined') return;
        this.urlWatchTimer = window.setInterval(() => {
            this.maybeHandleNavigation();
        }, URL_WATCH_INTERVAL_MS);
    }

    private stopUrlWatch() {
        if (this.urlWatchTimer == null) return;
        window.clearInterval(this.urlWatchTimer);
        this.urlWatchTimer = null;
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
            void this.runApplyAttempt();
        }, delay);
    }

    private clearRetryTimer() {
        if (this.retryTimer == null) return;
        window.clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private async runApplyAttempt(): Promise<void> {
        if (!this.enabled || !this.config.enabled || !isSiteHost('bilibili')) return;
        if (this.attemptInFlight) {
            // An attempt is already awaiting the uploader/activation checks.
            // Keep the requested attempt queued instead of dropping it.
            this.clearRetryTimer();
            this.retryTimer = window.setTimeout(() => {
                this.retryTimer = null;
                void this.runApplyAttempt();
            }, 250);
            return;
        }
        if (!this.isSupportedPage()) return;

        const pageKey = this.getPageKey();
        if (this.lastHandledPageKey === pageKey) return;

        this.attemptInFlight = true;
        try {
            const targetMatch = await this.resolveTargetMatch(pageKey);

            // The page may have navigated while we were waiting for the uploader.
            if (!this.enabled || !this.config.enabled) return;
            if (this.getPageKey() !== pageKey) return;

            if (targetMatch === 'mismatch') {
                this.uploaderUnknownSince = 0;
                return;
            }
            if (targetMatch === 'unknown') {
                this.scheduleUnknownUploaderRetry();
                return;
            }

            this.uploaderUnknownSince = 0;
            const result = await this.tryEnablePreferredSubtitle(pageKey);
            if (!this.enabled || !this.config.enabled) return;
            if (this.getPageKey() !== pageKey) return;

            if (result === 'done') {
                this.lastHandledPageKey = pageKey;
                return;
            }

            this.scheduleRetry();
        } finally {
            this.attemptInFlight = false;
        }
    }

    private scheduleUnknownUploaderRetry() {
        const now = Date.now();
        if (this.uploaderUnknownSince === 0) this.uploaderUnknownSince = now;
        if (now - this.uploaderUnknownSince >= UPLOADER_UNKNOWN_DEADLINE_MS) return;

        this.scheduleRetry(UPLOADER_UNKNOWN_RETRY_MS);
    }

    private scheduleRetry(delay: number = RETRY_INTERVAL_MS) {
        if (this.retryCount >= MAX_RETRIES) return;
        this.retryCount += 1;
        this.clearRetryTimer();
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            void this.runApplyAttempt();
        }, delay);
    }

    private async resolveTargetMatch(pageKey: string): Promise<TargetMatch> {
        if (this.config.targetMode !== 'allowlist') return 'match';

        const expectedTargets = this.config.targets
            .map((item) => normalizeBilibiliTargetValue(item))
            .filter((item): item is string => Boolean(item));
        if (expectedTargets.length === 0) return 'mismatch';

        const currentTargets = await this.getCurrentUploaderTargets(pageKey);
        if (currentTargets.length === 0) return 'unknown';

        return matchBilibiliUploaderTargets(expectedTargets, currentTargets) ? 'match' : 'mismatch';
    }

    private async getCurrentUploaderTargets(pageKey: string): Promise<string[]> {
        if (this.uploaderCachePageKey === pageKey && this.uploaderCacheTargets.length > 0) {
            return [...this.uploaderCacheTargets];
        }

        const allowApiFallback = this.uploaderApiAttemptPageKey !== pageKey;
        if (allowApiFallback) this.uploaderApiAttemptPageKey = pageKey;

        const result = await resolveBilibiliUploaderSnapshot({ allowApiFallback });
        if (this.getPageKey() !== pageKey) return [];
        if (!result.profile || result.targets.length === 0) return [];

        this.storeUploaderCache(pageKey, result.targets, result.profile);
        return [...result.targets];
    }

    private getCachedUploaderProfile(pageKey: string): BilibiliUploaderProfile | null {
        if (this.uploaderCachePageKey !== pageKey) return null;
        if (!this.uploaderCacheProfile) return null;
        return { ...this.uploaderCacheProfile };
    }

    private storeUploaderCache(
        pageKey: string,
        targets: string[],
        profile: BilibiliUploaderProfile
    ) {
        // Only positive results are cached: an early empty read must never
        // poison the whole page and silently disable the feature.
        if (targets.length === 0) return;
        if (!profile.uid && !profile.name && !profile.profileUrl) return;

        this.uploaderCachePageKey = pageKey;
        this.uploaderCacheTargets = [...targets];
        this.uploaderCacheProfile = { ...profile };
    }

    private async tryEnablePreferredSubtitle(pageKey: string): Promise<ApplyResult> {
        if (!document.querySelector(PLAYER_SELECTOR)) return 'retry';

        const buttons = this.getSubtitleButtons();
        if (buttons.length === 0) return 'retry';

        const activeButton = buttons.find((button) => isActiveSubtitleItem(button));
        if (activeButton && isChineseSubtitleButton(activeButton)) {
            return 'done';
        }

        const targetButton = this.findPreferredSubtitleButton(buttons);
        if (!targetButton) return 'retry';

        targetButton.click();
        const activated = await this.waitForChineseSubtitleActivation(pageKey);
        return activated ? 'done' : 'retry';
    }

    private async waitForChineseSubtitleActivation(pageKey: string): Promise<boolean> {
        const deadline = Date.now() + ACTIVATION_TIMEOUT_MS;

        while (Date.now() < deadline) {
            if (this.getPageKey() !== pageKey) return false;

            const activeButton = this.getSubtitleButtons().find((button) => isActiveSubtitleItem(button));
            if (activeButton && isChineseSubtitleButton(activeButton)) return true;

            await new Promise<void>((resolve) => {
                window.setTimeout(resolve, ACTIVATION_POLL_MS);
            });
        }

        return false;
    }

    private getSubtitleButtons(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>(SUBTITLE_ITEM_SELECTOR));
    }

    private findPreferredSubtitleButton(existingButtons: HTMLElement[]): HTMLElement | null {
        return findPreferredSubtitleButtonFromButtons(existingButtons);
    }

    private isSupportedPage(): boolean {
        return isSupportedBilibiliVideoPage();
    }

    private getPageKey(): string {
        return `${location.pathname}${location.search}`;
    }

    private resetPageState() {
        this.lastHandledPageKey = '';
        this.uploaderCachePageKey = '';
        this.uploaderCacheTargets = [];
        this.uploaderCacheProfile = null;
        this.uploaderApiAttemptPageKey = '';
        this.uploaderUnknownSince = 0;
    }
}
