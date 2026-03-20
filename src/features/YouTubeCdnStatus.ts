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
    YT_CDN_STATUS_BRIDGE_CHANNEL,
    YT_CDN_STATUS_PAGE_SOURCE
} from './youtube/cdnStatus.shared';

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

export class YouTubeCdnStatus implements Feature {
    private enabled = false;
    private config: YTConfig = {};
    private language: I18nLang = 'auto';
    private syncTimer: number | null = null;
    private routePollTimer: number | null = null;
    private widgetRefreshTimer: number | null = null;
    private lastRouteKey = '';
    private lastReportedHost = '';
    private lastReportedAt = 0;
    private lastOkCountryCode = '';
    private displayNames = new Map<string, Intl.DisplayNames>();

    private readonly handleNavigation = () => {
        this.scheduleSync(200);
    };

    private readonly handleWindowMessage = (event: MessageEvent<unknown>) => {
        if (event.source !== window) return;
        if (!this.isFeatureActiveOnCurrentPage()) return;
        if (!isRecord(event.data)) return;

        const data = event.data;
        if (data.source !== YT_CDN_STATUS_PAGE_SOURCE) return;
        if (data.channel !== YT_CDN_STATUS_BRIDGE_CHANNEL) return;
        if (data.type !== 'videoplayback-url') return;
        if (typeof data.url !== 'string') return;

        const host = this.hostFromUrl(data.url);
        const now = Date.now();
        if (host && host === this.lastReportedHost && now - this.lastReportedAt < URL_FORWARD_THROTTLE_MS) {
            return;
        }

        this.lastReportedHost = host;
        this.lastReportedAt = now;

        try {
            void chrome.runtime.sendMessage({
                type: 'VB_YT_CDN_CAPTURED_URL',
                url: data.url
            });
        } catch {
            // ignore messaging errors
        }
    };

    private readonly handleRuntimeMessage = (message: unknown) => {
        if (!this.isFeatureActiveOnCurrentPage()) return;
        if (!isRecord(message)) return;
        if (message.type !== 'VB_YT_CDN_STATE') return;

        this.applyCdnState(message.state as YtCdnState | undefined);
    };

    mount() {
        if (!isSiteHost('youtube')) return;
        if (this.enabled) return;
        this.enabled = true;

        installYouTubeCdnStatusBridge();
        window.addEventListener('message', this.handleWindowMessage as EventListener);
        chrome.runtime.onMessage.addListener(this.handleRuntimeMessage);
        window.addEventListener('popstate', this.handleNavigation);
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

        this.scheduleSync(0);
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

        window.removeEventListener('message', this.handleWindowMessage as EventListener);
        chrome.runtime.onMessage.removeListener(this.handleRuntimeMessage);
        window.removeEventListener('popstate', this.handleNavigation);
        document.removeEventListener('yt-navigate-finish', this.handleNavigation, true);

        this.enabled = false;
        this.lastRouteKey = '';
        this.lastReportedHost = '';
        this.lastReportedAt = 0;
        this.lastOkCountryCode = '';
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
            this.scheduleSync(0);
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
        }

        pushYouTubeCdnStatusConfig({ enabled: shouldCapture });

        if (!this.isFeatureActiveOnCurrentPage()) {
            this.removeWidget();
            return;
        }

        this.ensureWidgetMounted();
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

        return null;
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

        if (mode === 'controls' || mode === 'controls-fallback') {
            el.style.height = '100%';
            el.style.marginRight = '6px';
            el.style.padding = '0';
        } else {
            el.style.position = 'absolute';
            el.style.right = '12px';
            el.style.bottom = '54px';
            el.style.zIndex = '999999';
            el.style.padding = '0';
            el.style.textShadow = '0 1px 2px rgba(0,0,0,0.6)';
        }

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
        }

        const right = this.getRightControls();
        if (right && widget) {
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
            const response = await chrome.runtime.sendMessage({
                type: 'VB_YT_GET_CDN_STATE'
            });
            const state = isRecord(response) ? response.state as YtCdnState | undefined : undefined;
            this.applyCdnState(state);
        } catch {
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
