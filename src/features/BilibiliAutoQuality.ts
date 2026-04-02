import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import type { BilibiliQualityConfig } from '../lib/settings';
import {
    DEFAULT_BILIBILI_CUSTOM_DEFAULT_QUALITY,
    DEFAULT_BILIBILI_TARGET_QUALITY,
    getBilibiliQualityAliases,
    normalizeBilibiliQualityValue,
    pickBilibiliQualityAtOrBelow
} from '../lib/bilibiliQuality';
import {
    collectCurrentBilibiliUploaderSnapshot,
    isSupportedBilibiliVideoPage,
    normalizeBilibiliTargetValue,
    type BilibiliUploaderProfile
} from './bilibili/uploaderProfile';

const INITIAL_DELAY_MS = 1400;
const NAVIGATION_DELAY_MS = 1800;
const RETRY_INTERVAL_MS = 600;
const MAX_RETRIES = 18;
const PLAYER_SELECTOR = '#bilibili-player, .bpx-player-container, .bilibili-player, video';
const QUALITY_ITEM_SELECTORS = [
    '.bpx-player-ctrl-quality-menu-item',
    '.bpx-player-ctrl-quality-menu .bpx-player-ctrl-setting-menu-item',
    '.bpx-player-ctrl-quality-menu [data-value]',
    '.squirtle-select-item'
];
const PLAYER_SETTINGS_STORAGE_KEY = 'bilibili_player_settings';
const PLAYER_SETTINGS_RESTORE_DELAYS = [120, 480, 1200];

type ApplyResult = 'done' | 'retry';

type BilibiliPlayerSettingsSnapshot = {
    hadKey: boolean;
    raw: string | null;
};

type QualityPlan = {
    desiredQn: string | null;
    fallbackQn: string | null;
    preservePlayerSettings: boolean;
};

type QualityItem = {
    button: HTMLElement;
    qn: string | null;
    text: string;
};

function isActiveQualityItem(button: HTMLElement): boolean {
    return button.classList.contains('bpx-state-active')
        || button.classList.contains('active')
        || button.getAttribute('aria-checked') === 'true'
        || button.dataset.state === 'active';
}

function normalizeQualityText(value: string): string {
    return value.toLowerCase().normalize('NFKC').replace(/\s+/g, '');
}

function extractQualityValue(button: HTMLElement): string | null {
    const candidates = [
        button.dataset.value,
        button.dataset.qn,
        button.getAttribute('data-value'),
        button.getAttribute('data-qn'),
        button.getAttribute('data-quality')
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const trimmed = candidate.trim();
        if (/^\d+$/.test(trimmed)) return trimmed;
    }

    const text = normalizeQualityText(button.textContent ?? '');
    for (const qn of ['127', '126', '125', '120', '116', '112', '80', '74', '64', '32', '16']) {
        const aliases = getBilibiliQualityAliases(qn).map((item) => normalizeQualityText(item));
        if (aliases.some((item) => item && text.includes(item))) {
            return qn;
        }
    }

    return null;
}

function collectQualityItems(): QualityItem[] {
    const seen = new Set<HTMLElement>();
    const items: QualityItem[] = [];

    for (const selector of QUALITY_ITEM_SELECTORS) {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
        for (const button of nodes) {
            if (seen.has(button)) continue;
            seen.add(button);
            items.push({
                button,
                qn: extractQualityValue(button),
                text: normalizeQualityText(button.textContent ?? '')
            });
        }
    }

    return items;
}

function findQualityItem(items: QualityItem[], qn: string): QualityItem | null {
    const exact = items.find((item) => item.qn === qn);
    if (exact) return exact;

    const aliases = getBilibiliQualityAliases(qn).map((item) => normalizeQualityText(item));
    return items.find((item) => aliases.some((alias) => alias && item.text.includes(alias))) ?? null;
}

export class BilibiliAutoQuality implements Feature {
    private enabled = false;
    private config: BilibiliQualityConfig = {
        enabled: false,
        targets: [],
        targetQn: DEFAULT_BILIBILI_TARGET_QUALITY,
        defaultQn: DEFAULT_BILIBILI_CUSTOM_DEFAULT_QUALITY
    };
    private titleObserver: MutationObserver | null = null;
    private retryTimer: number | null = null;
    private restoreTimers: number[] = [];
    private playerSettingsSnapshot: BilibiliPlayerSettingsSnapshot | null = null;
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
        this.restorePlayerSettingsSnapshotNow();
        this.clearRetryTimer();
        this.clearRestoreTimers();
        this.playerSettingsSnapshot = null;
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

        const qualityConfig = record.bb_quality as BilibiliQualityConfig | undefined;
        if (qualityConfig) {
            this.config = {
                enabled: qualityConfig.enabled === true,
                targets: Array.isArray(qualityConfig.targets) ? [...qualityConfig.targets] : [],
                targetQn: normalizeBilibiliQualityValue(
                    qualityConfig.targetQn,
                    DEFAULT_BILIBILI_TARGET_QUALITY
                ),
                defaultQn: normalizeBilibiliQualityValue(
                    qualityConfig.defaultQn,
                    DEFAULT_BILIBILI_CUSTOM_DEFAULT_QUALITY
                )
            };
        }

        if (!this.enabled) return;

        this.resetPageState();
        if (this.config.enabled) {
            this.scheduleApply(0);
        } else {
            this.restorePlayerSettingsSnapshotNow();
            this.clearRetryTimer();
            this.clearRestoreTimers();
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

    private clearRestoreTimers() {
        this.restoreTimers.forEach((timer) => window.clearTimeout(timer));
        this.restoreTimers = [];
    }

    private runApplyAttempt() {
        if (!this.enabled || !this.config.enabled || !isSiteHost('bilibili')) return;
        if (!this.isSupportedPage()) return;

        const pageKey = this.getPageKey();
        if (this.lastHandledPageKey === pageKey) return;

        const plan = this.resolveQualityPlan();
        if (!plan.desiredQn && !plan.fallbackQn) {
            this.lastHandledPageKey = pageKey;
            return;
        }

        const result = this.tryApplyQuality(plan);
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

    private tryApplyQuality(plan: QualityPlan): ApplyResult {
        if (!document.querySelector(PLAYER_SELECTOR)) return 'retry';

        const items = collectQualityItems();
        if (items.length === 0) return 'retry';

        const activeItem = items.find((item) => isActiveQualityItem(item.button)) ?? null;
        const availableQnValues = items
            .map((item) => item.qn)
            .filter((item): item is string => Boolean(item));
        const desiredQn = plan.desiredQn
            ? pickBilibiliQualityAtOrBelow(availableQnValues, plan.desiredQn)
            : null;
        const fallbackQn = !desiredQn && plan.fallbackQn
            ? pickBilibiliQualityAtOrBelow(availableQnValues, plan.fallbackQn)
            : null;
        const bestAvailableQn = !desiredQn && !fallbackQn
            ? pickBilibiliQualityAtOrBelow(availableQnValues, null)
            : null;
        const selectedQn = desiredQn ?? fallbackQn ?? bestAvailableQn;
        const selectedItem = selectedQn ? findQualityItem(items, selectedQn) : null;

        if (!selectedItem) {
            return 'done';
        }

        if (activeItem && selectedItem.qn && activeItem.qn === selectedItem.qn) {
            return 'done';
        }

        const snapshot = plan.preservePlayerSettings ? this.capturePlayerSettingsSnapshot() : null;
        selectedItem.button.click();
        if (snapshot) {
            this.schedulePlayerSettingsRestore(snapshot);
        }
        return 'done';
    }

    private capturePlayerSettingsSnapshot(): BilibiliPlayerSettingsSnapshot | null {
        if (this.playerSettingsSnapshot) {
            return this.playerSettingsSnapshot;
        }

        try {
            const raw = localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY);
            const snapshot = {
                hadKey: raw !== null,
                raw
            };
            this.playerSettingsSnapshot = snapshot;
            return snapshot;
        } catch {
            return null;
        }
    }

    private restorePlayerSettingsSnapshotNow() {
        const snapshot = this.playerSettingsSnapshot;
        if (!snapshot) return;

        try {
            if (snapshot.hadKey) {
                localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, snapshot.raw ?? '');
            } else {
                localStorage.removeItem(PLAYER_SETTINGS_STORAGE_KEY);
            }
        } catch {
            // Ignore localStorage restore failures.
        }
    }

    private schedulePlayerSettingsRestore(snapshot: BilibiliPlayerSettingsSnapshot) {
        this.playerSettingsSnapshot = snapshot;
        this.clearRestoreTimers();
        this.restoreTimers = PLAYER_SETTINGS_RESTORE_DELAYS.map((delay) => window.setTimeout(() => {
            this.restorePlayerSettingsSnapshotNow();
        }, delay));
    }

    private resolveQualityPlan(): QualityPlan {
        const matchesTarget = this.matchesTargetFilter();
        const desiredQn = matchesTarget
            ? this.config.targetQn
            : this.config.defaultQn;
        const fallbackQn = matchesTarget
            ? this.config.defaultQn
            : null;

        return {
            desiredQn,
            fallbackQn,
            preservePlayerSettings: true
        };
    }

    private isSupportedPage(): boolean {
        return isSupportedBilibiliVideoPage();
    }

    private getPageKey(): string {
        return `${location.pathname}${location.search}`;
    }

    private matchesTargetFilter(): boolean {
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
