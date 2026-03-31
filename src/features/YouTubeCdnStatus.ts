import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import type { I18nLang } from '../lib/i18n';
import type { Settings, YTConfig } from '../lib/settings';
import {
    ensureYouTubeCdnStatusScriptInjected,
    installYouTubeCdnStatusBridge,
    pushYouTubeCdnStatusConfig
} from './youtube/cdnStatus';
import {
    youTubeCdnStatusStorageRequestKey,
    youTubeCdnStatusStorageStateKey,
    YT_CDN_STATUS_REPORT_EVENT
} from './youtube/cdnStatus.shared';
import {
    addStorageChangedListener,
    addRuntimeMessageListener,
    isFirefoxExtensionRuntime,
    removeStorageChangedListener,
    removeRuntimeMessageListener,
    runtimeSendMessage,
    storageLocalGet,
    storageLocalSet
} from '../lib/webext';

type YtCdnState = {
    status?: string;
    countryCode?: string;
};

type MountPointMode = 'controls' | 'controls-fallback' | 'overlay';

type MountPoint = {
    el: HTMLElement;
    mode: MountPointMode;
};

const WIDGET_ID = 'vb-yt-cdn-status-widget';
const ROUTE_POLL_MS = 400;
const WIDGET_REFRESH_MS = 1000;
const URL_FORWARD_THROTTLE_MS = 600;

const ZH_SHORT_NAMES: Record<string, string> = {
    AE: '阿联酋',
    AR: '阿根廷',
    AU: '澳大利亚',
    BR: '巴西',
    CA: '加拿大',
    CH: '瑞士',
    CL: '智利',
    CN: '中国',
    DE: '德国',
    ES: '西班牙',
    FI: '芬兰',
    FR: '法国',
    GB: '英国',
    HK: '香港',
    ID: '印尼',
    IE: '爱尔兰',
    IL: '以色列',
    IN: '印度',
    IT: '意大利',
    JP: '日本',
    KR: '韩国',
    MO: '澳门',
    MX: '墨西哥',
    MY: '马来西亚',
    NL: '荷兰',
    NO: '挪威',
    NZ: '新西兰',
    PH: '菲律宾',
    PL: '波兰',
    RU: '俄罗斯',
    SA: '沙特',
    SE: '瑞典',
    SG: '新加坡',
    TH: '泰国',
    TR: '土耳其',
    TW: '台湾',
    UA: '乌克兰',
    US: '美国',
    VN: '越南',
    ZA: '南非'
};

const EN_SHORT_NAMES: Record<string, string> = {
    AE: 'United Arab Emirates',
    AR: 'Argentina',
    AU: 'Australia',
    BR: 'Brazil',
    CA: 'Canada',
    CH: 'Switzerland',
    CL: 'Chile',
    CN: 'China',
    DE: 'Germany',
    ES: 'Spain',
    FI: 'Finland',
    FR: 'France',
    GB: 'United Kingdom',
    HK: 'Hong Kong',
    ID: 'Indonesia',
    IE: 'Ireland',
    IL: 'Israel',
    IN: 'India',
    IT: 'Italy',
    JP: 'Japan',
    KR: 'South Korea',
    MO: 'Macao',
    MX: 'Mexico',
    MY: 'Malaysia',
    NL: 'Netherlands',
    NO: 'Norway',
    NZ: 'New Zealand',
    PH: 'Philippines',
    PL: 'Poland',
    RU: 'Russia',
    SA: 'Saudi Arabia',
    SE: 'Sweden',
    SG: 'Singapore',
    TH: 'Thailand',
    TR: 'Turkey',
    TW: 'Taiwan',
    UA: 'Ukraine',
    US: 'United States',
    VN: 'Vietnam',
    ZA: 'South Africa'
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function isLoopbackDebugYouTubePage() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const host = window.location.hostname.trim().toLowerCase();
    const isLoopbackHost = host === '127.0.0.1'
        || host === 'localhost'
        || host === '[::1]'
        || host.endsWith('.localhost');
    if (!isLoopbackHost) return false;
    return document.documentElement?.dataset?.vbSite?.trim().toLowerCase() === 'youtube';
}

export class YouTubeCdnStatus implements Feature {
    private enabled = false;
    private config: YTConfig = {};
    private language: I18nLang = 'auto';
    private syncTimer: number | null = null;
    private routePollTimer: number | null = null;
    private widgetRefreshTimer: number | null = null;
    private mountPointObserver: MutationObserver | null = null;
    private lastRouteKey = '';
    private lastReportedHost = '';
    private lastReportedAt = 0;
    private lastOkCountryCode = '';
    private lastStorageHost = '';
    private displayNames = new Map<string, Intl.DisplayNames>();

    private readonly handleStorageChanged = (
        changes: Record<string, { newValue?: unknown }>,
        areaName?: string
    ) => {
        if (!isFirefoxExtensionRuntime()) return;
        if (!this.isFeatureActiveOnCurrentPage()) return;
        if (areaName && areaName !== 'local') return;

        const host = this.lastStorageHost || this.lastReportedHost;
        if (!host) return;

        const stateKey = youTubeCdnStatusStorageStateKey(host);
        const state = changes[stateKey]?.newValue;
        if (!isRecord(state)) return;

        const status = typeof state.status === 'string' ? state.status : 'unknown';
        this.publishLoopbackStage(`state-storage:${status}`);
        this.applyCdnState(state as YtCdnState);
    };

    private publishLoopbackStage(stage: string) {
        if (!isLoopbackDebugYouTubePage() || typeof document === 'undefined') return;
        const root = document.documentElement;
        if (!root) return;
        root.dataset.vbYtCdnStage = stage;
    }

    private readonly handleNavigation = () => {
        this.scheduleSync(200);
    };

    private readonly handleDocumentReady = () => {
        this.syncCurrentPage();
        this.scheduleSync(250);
    };

    private readonly handlePageReport = (event: Event) => {
        if (!this.isFeatureActiveOnCurrentPage()) return;
        if (!(event instanceof CustomEvent)) return;
        if (typeof event.detail !== 'string' || !event.detail.trim()) return;

        let data: Record<string, unknown> | null = null;
        try {
            const parsed = JSON.parse(event.detail);
            data = isRecord(parsed) ? parsed : null;
        } catch {
            data = null;
        }

        if (!data) return;
        if (data.type !== 'videoplayback-url') return;
        if (typeof data.url !== 'string') return;

        const host = this.hostFromUrl(data.url);
        const now = Date.now();
        if (host && host === this.lastReportedHost && now - this.lastReportedAt < URL_FORWARD_THROTTLE_MS) {
            return;
        }

        this.lastReportedHost = host;
        this.lastReportedAt = now;
        this.lastStorageHost = host;
        this.publishLoopbackStage('url-captured');

        const refreshAfterCapture = () => {
            void this.refreshCdnState();
            window.setTimeout(() => {
                void this.refreshCdnState();
            }, 250);
            window.setTimeout(() => {
                void this.refreshCdnState();
            }, 1200);
        };

        refreshAfterCapture();
        this.publishLoopbackStage('url-forward-dispatched');
        if (isFirefoxExtensionRuntime()) {
            if (host.includes('.invalid') && isLoopbackDebugYouTubePage()) {
                console.error('[VB_FF_YT_CDN] content storage request', host);
            }
            void storageLocalSet({
                [youTubeCdnStatusStorageRequestKey(host)]: {
                    host,
                    url: data.url,
                    ts: now
                }
            }).then(() => {
                if (host.includes('.invalid') && isLoopbackDebugYouTubePage()) {
                    console.error('[VB_FF_YT_CDN] content storage request resolved', host);
                }
                this.publishLoopbackStage('url-forwarded');
                window.setTimeout(() => {
                    void this.refreshCdnState();
                }, 150);
            }).catch(() => {
                if (host.includes('.invalid') && isLoopbackDebugYouTubePage()) {
                    console.error('[VB_FF_YT_CDN] content storage request failed', host);
                }
                this.publishLoopbackStage('url-forward-failed');
            });
            return;
        }

        void runtimeSendMessage<{ ok?: boolean }>({
            type: 'VB_YT_CDN_CAPTURED_URL',
            url: data.url
        }).then((response) => {
            if (isRecord(response) && response.ok === true) {
                this.publishLoopbackStage('url-forwarded');
                return;
            }
            this.publishLoopbackStage('url-forward-no-response');
        }).catch(() => {
            this.publishLoopbackStage('url-forward-failed');
        });
    };

    private readonly handleRuntimeMessage = (message: unknown) => {
        if (!this.isFeatureActiveOnCurrentPage()) return;
        if (!isRecord(message)) return;
        if (message.type !== 'VB_YT_CDN_STATE') return;

        const stateRecord = isRecord(message.state) ? message.state : null;
        const status = typeof stateRecord?.status === 'string' ? stateRecord.status : 'unknown';
        this.publishLoopbackStage(`state-received:${status}`);
        this.applyCdnState(message.state as YtCdnState | undefined);
    };

    mount() {
        if (!isSiteHost('youtube')) {
            this.publishLoopbackStage('mount-skipped-host');
            return;
        }
        if (this.enabled) return;
        this.enabled = true;
        this.publishLoopbackStage('mounted');

        installYouTubeCdnStatusBridge();
        document.addEventListener(YT_CDN_STATUS_REPORT_EVENT, this.handlePageReport as EventListener);
        addRuntimeMessageListener(this.handleRuntimeMessage);
        addStorageChangedListener(this.handleStorageChanged);
        window.addEventListener('popstate', this.handleNavigation);
        window.addEventListener('load', this.handleDocumentReady, true);
        document.addEventListener('readystatechange', this.handleDocumentReady, true);
        document.addEventListener('yt-navigate-finish', this.handleNavigation, true);

        this.lastRouteKey = this.getRouteKey();
        this.routePollTimer = window.setInterval(() => {
            const nextRouteKey = this.getRouteKey();
            if (nextRouteKey === this.lastRouteKey) return;
            this.lastRouteKey = nextRouteKey;
            this.scheduleSync(0);
        }, ROUTE_POLL_MS);

        this.widgetRefreshTimer = window.setInterval(() => {
            if (!this.isFeatureActiveOnCurrentPage()) return;
            this.ensureWidgetMounted();
        }, WIDGET_REFRESH_MS);

        this.mountPointObserver = new MutationObserver(() => {
            if (!this.isFeatureActiveOnCurrentPage()) return;
            if (document.getElementById(WIDGET_ID)) return;
            const widget = this.ensureWidgetMounted();
            if (widget) {
                this.publishLoopbackStage('widget-mounted');
                void this.refreshCdnState();
            }
        });
        this.mountPointObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        this.syncCurrentPage();
        this.scheduleSync(250);
    }

    unmount() {
        if (this.syncTimer != null) {
            window.clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        if (this.routePollTimer != null) {
            window.clearInterval(this.routePollTimer);
            this.routePollTimer = null;
        }
        if (this.widgetRefreshTimer != null) {
            window.clearInterval(this.widgetRefreshTimer);
            this.widgetRefreshTimer = null;
        }
        this.mountPointObserver?.disconnect();
        this.mountPointObserver = null;

        document.removeEventListener(YT_CDN_STATUS_REPORT_EVENT, this.handlePageReport as EventListener);
        removeRuntimeMessageListener(this.handleRuntimeMessage);
        removeStorageChangedListener(this.handleStorageChanged);
        window.removeEventListener('popstate', this.handleNavigation);
        window.removeEventListener('load', this.handleDocumentReady, true);
        document.removeEventListener('readystatechange', this.handleDocumentReady, true);
        document.removeEventListener('yt-navigate-finish', this.handleNavigation, true);

        this.enabled = false;
        this.lastRouteKey = '';
        this.lastReportedHost = '';
        this.lastReportedAt = 0;
        this.lastOkCountryCode = '';
        this.lastStorageHost = '';
        this.removeWidget();

        if (!isSiteHost('youtube')) return;
        pushYouTubeCdnStatusConfig({ enabled: false });
    }

    updateSettings(settings: unknown) {
        const record = settings as Partial<Settings> | undefined;
        if (!record) return;

        if (record.yt_config) {
            this.config = { ...record.yt_config };
        }

        if (typeof record.language === 'string') {
            this.language = record.language;
        }

        if (this.enabled) {
            this.renderCurrentCountry();
            this.syncCurrentPage();
            this.scheduleSync(250);
        }
    }

    private scheduleSync(delay: number) {
        if (!this.enabled || !isSiteHost('youtube')) return;
        if (this.syncTimer != null) {
            window.clearTimeout(this.syncTimer);
        }
        this.syncTimer = window.setTimeout(() => {
            this.syncTimer = null;
            this.syncCurrentPage();
        }, delay);
    }

    private syncCurrentPage() {
        if (!this.enabled || !isSiteHost('youtube')) return;

        const shouldCapture = this.isFeatureEnabled();
        if (shouldCapture) {
            installYouTubeCdnStatusBridge();
            ensureYouTubeCdnStatusScriptInjected();
            this.publishLoopbackStage('script-injected');
        }

        pushYouTubeCdnStatusConfig({ enabled: shouldCapture });

        if (!this.isFeatureActiveOnCurrentPage()) {
            this.publishLoopbackStage('inactive-page');
            this.removeWidget();
            return;
        }

        const widget = this.ensureWidgetMounted();
        this.publishLoopbackStage(widget ? 'widget-mounted' : 'mount-point-missing');
        void this.refreshCdnState();
    }

    private isFeatureEnabled() {
        return this.config.showCdnCountry === true;
    }

    private isFeatureActiveOnCurrentPage() {
        return this.enabled && this.isFeatureEnabled() && isSiteHost('youtube') && this.isSupportedPage();
    }

    private isSupportedPage() {
        const path = window.location.pathname;
        return path === '/watch' || path.startsWith('/shorts');
    }

    private getRouteKey() {
        return `${window.location.pathname}|${window.location.search}`;
    }

    private playerRoot() {
        return document.getElementById('movie_player')
            || document.querySelector<HTMLElement>('ytd-player #movie_player')
            || document.querySelector<HTMLElement>('#movie_player');
    }

    private getRightControls() {
        return document.querySelector<HTMLElement>('.ytp-right-controls');
    }

    private findMountPoint(): MountPoint | null {
        const right = this.getRightControls();
        if (right) return { el: right, mode: 'controls' };

        const controls = document.querySelector<HTMLElement>('.ytp-chrome-controls')
            || document.querySelector<HTMLElement>('.ytp-chrome-bottom');
        if (controls) return { el: controls, mode: 'controls-fallback' };

        const player = this.playerRoot();
        if (player) return { el: player, mode: 'overlay' };

        if (document.body) {
            return { el: document.body, mode: 'overlay' };
        }

        return null;
    }

    private applyWidgetLayout(widget: HTMLSpanElement, mode: MountPointMode) {
        widget.style.height = '';
        widget.style.marginRight = '';
        widget.style.position = '';
        widget.style.right = '';
        widget.style.bottom = '';
        widget.style.zIndex = '';
        widget.style.padding = '0';
        widget.style.textShadow = 'none';

        if (mode === 'controls' || mode === 'controls-fallback') {
            widget.style.height = '100%';
            widget.style.marginRight = '6px';
            return;
        }

        widget.style.position = 'absolute';
        widget.style.right = '12px';
        widget.style.bottom = '54px';
        widget.style.zIndex = '999999';
        widget.style.textShadow = '0 1px 2px rgba(0,0,0,0.6)';
    }

    private createWidget(mode: MountPointMode) {
        const el = document.createElement('span');
        el.id = WIDGET_ID;
        el.textContent = '…';
        el.setAttribute('aria-label', 'YouTube CDN country');
        el.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            line-height: 1;
            color: #fff;
            user-select: none;
            pointer-events: none;
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            box-sizing: border-box;
            text-shadow: none;
            background: transparent;
            min-width: 44px;
            text-align: right;
        `;
        this.applyWidgetLayout(el, mode);
        return el;
    }

    private ensureWidgetMounted() {
        if (!this.isFeatureActiveOnCurrentPage()) return null;

        const mountPoint = this.findMountPoint();
        if (!mountPoint) return null;

        let widget = document.getElementById(WIDGET_ID) as HTMLSpanElement | null;
        if (!widget) {
            widget = this.createWidget(mountPoint.mode);
            mountPoint.el.insertBefore(widget, mountPoint.el.firstElementChild || mountPoint.el.firstChild);
        } else if (widget.parentElement !== mountPoint.el) {
            this.applyWidgetLayout(widget, mountPoint.mode);
            mountPoint.el.insertBefore(widget, mountPoint.el.firstElementChild || mountPoint.el.firstChild);
        } else {
            this.applyWidgetLayout(widget, mountPoint.mode);
        }

        const right = this.getRightControls();
        if (right && widget) {
            this.applyWidgetLayout(widget, 'controls');
            const first = right.firstElementChild;
            if (widget.parentElement !== right || first !== widget) {
                right.insertBefore(widget, first);
            }
        }

        return widget;
    }

    private removeWidget() {
        document.getElementById(WIDGET_ID)?.remove();
    }

    private setWidgetText(text: string, isOk: boolean, label: string) {
        const widget = (document.getElementById(WIDGET_ID) as HTMLSpanElement | null) || this.ensureWidgetMounted();
        if (!widget) return;

        if (widget.textContent !== text) {
            widget.textContent = text;
        }
        widget.style.opacity = isOk ? '1' : '0.9';
        widget.setAttribute('aria-label', label || 'YouTube CDN country');
        widget.dataset.countryCode = this.lastOkCountryCode;
    }

    private applyCdnState(state?: YtCdnState) {
        const status = typeof state?.status === 'string' ? state.status : '';
        const code = this.normalizeCountryCode(state?.countryCode);

        if (status === 'ok' && code) {
            this.lastOkCountryCode = code;
            this.publishLoopbackStage('country-resolved');
            this.renderCurrentCountry();
            return;
        }

        if (this.lastOkCountryCode) {
            this.renderCurrentCountry();
            return;
        }

        this.setWidgetText('…', false, 'YouTube CDN country');
    }

    private renderCurrentCountry() {
        if (!this.isFeatureActiveOnCurrentPage()) return;
        if (!this.lastOkCountryCode) return;

        const label = this.getCompactCountryLabel(this.lastOkCountryCode);
        const fullName = this.getLocalizedCountryName(this.lastOkCountryCode) || this.lastOkCountryCode;
        this.setWidgetText(label, true, `YouTube CDN: ${fullName}`);
    }

    private async refreshCdnState() {
        if (!this.isFeatureActiveOnCurrentPage()) return;

        try {
            if (isFirefoxExtensionRuntime()) {
                const host = this.lastStorageHost || this.lastReportedHost;
                if (!host) {
                    this.publishLoopbackStage('state-polled:none');
                    this.applyCdnState(undefined);
                    return;
                }

                const response = await storageLocalGet<Record<string, unknown>>(
                    youTubeCdnStatusStorageStateKey(host)
                );
                const state = isRecord(response[youTubeCdnStatusStorageStateKey(host)])
                    ? response[youTubeCdnStatusStorageStateKey(host)] as YtCdnState
                    : undefined;
                const status = typeof state?.status === 'string' ? state.status : '';
                if (status) {
                    this.publishLoopbackStage(`state-polled:${status}`);
                } else {
                    this.publishLoopbackStage('state-polled:none');
                }
                this.applyCdnState(state);
                return;
            }

            const response = await runtimeSendMessage({
                type: 'VB_YT_GET_CDN_STATE'
            });
            const state = isRecord(response) ? response.state as YtCdnState | undefined : undefined;
            const status = typeof state?.status === 'string' ? state.status : '';
            if (status) {
                this.publishLoopbackStage(`state-polled:${status}`);
            } else {
                this.publishLoopbackStage('state-polled:none');
            }
            this.applyCdnState(state);
        } catch {
            this.publishLoopbackStage('state-polled:error');
            if (!this.lastOkCountryCode) {
                this.setWidgetText('…', false, 'YouTube CDN country');
            }
        }
    }

    private normalizeCountryCode(value: unknown) {
        const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return /^[A-Z]{2}$/.test(code) ? code : '';
    }

    private resolveLocale() {
        if (this.language === 'zh') return 'zh-CN';
        if (this.language === 'en') return 'en';

        const browserLocale = navigator.language || 'en';
        return browserLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
    }

    private getLocalizedCountryName(code: string) {
        const locale = this.resolveLocale();
        const shortNames = locale.startsWith('zh') ? ZH_SHORT_NAMES : EN_SHORT_NAMES;

        try {
            let displayNames = this.displayNames.get(locale);
            if (!displayNames) {
                displayNames = new Intl.DisplayNames([locale], { type: 'region' });
                this.displayNames.set(locale, displayNames);
            }
            const localized = displayNames.of(code);
            if (typeof localized === 'string' && localized.trim()) {
                return localized;
            }
        } catch {
            // ignore Intl lookup failures
        }

        return shortNames[code] || code;
    }

    private getCompactCountryLabel(code: string) {
        const locale = this.resolveLocale();
        const shortNames = locale.startsWith('zh') ? ZH_SHORT_NAMES : EN_SHORT_NAMES;
        const localized = this.getLocalizedCountryName(code);
        const maxLength = locale.startsWith('zh') ? 8 : 18;
        return localized.length <= maxLength ? localized : (shortNames[code] || code);
    }

    private hostFromUrl(url: string) {
        try {
            return new URL(url).hostname;
        } catch {
            return '';
        }
    }
}
