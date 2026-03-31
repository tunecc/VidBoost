import {
    DEFAULT_YT_CDN_STATUS_PAGE_CONFIG,
    YT_CDN_STATUS_CONFIG_ATTRIBUTE,
    YT_CDN_STATUS_CONFIG_EVENT,
    YT_CDN_STATUS_REPORT_EVENT,
    type YouTubeCdnStatusPageConfig
} from './cdnStatus.shared';

(() => {
    const host = window as unknown as Record<string, unknown>;
    const globalKey = '__vb_yt_cdn_status_installed__';
    if (host[globalKey]) return;
    host[globalKey] = true;

    let enabled = false;
    let lastReportedUrl = '';
    let lastReportedAt = 0;

    function publishDebug(key: string, value: string) {
        const root = document.documentElement;
        if (!root) return;
        root.dataset[key] = value;
    }

    publishDebug('vbYtCdnPageInstalled', '1');

    function isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object';
    }

    function shouldReport(url: string) {
        return enabled && url.includes('googlevideo.com') && url.includes('/videoplayback');
    }

    function parseConfig(value: unknown): YouTubeCdnStatusPageConfig {
        if (typeof value !== 'string' || !value.trim()) {
            return { ...DEFAULT_YT_CDN_STATUS_PAGE_CONFIG };
        }
        try {
            const parsed = JSON.parse(value) as Partial<YouTubeCdnStatusPageConfig>;
            return {
                enabled: parsed.enabled === true
            };
        } catch {
            return { ...DEFAULT_YT_CDN_STATUS_PAGE_CONFIG };
        }
    }

    function applyConfig(config: YouTubeCdnStatusPageConfig) {
        enabled = config.enabled === true;
        publishDebug('vbYtCdnPageEnabled', enabled ? '1' : '0');
    }

    function readConfigFromDocument() {
        const raw = document.documentElement?.getAttribute(YT_CDN_STATUS_CONFIG_ATTRIBUTE) || '';
        applyConfig(parseConfig(raw));
    }

    function report(url: string) {
        const now = Date.now();
        if (url === lastReportedUrl && now - lastReportedAt < 250) return;
        lastReportedUrl = url;
        lastReportedAt = now;
        publishDebug('vbYtCdnPageLastUrl', url.slice(0, 96));

        document.dispatchEvent(new CustomEvent(YT_CDN_STATUS_REPORT_EVENT, {
            detail: JSON.stringify({
                type: 'videoplayback-url',
                url
            })
        }));
    }

    function onConfigEvent(event: Event) {
        if (!(event instanceof CustomEvent)) return;
        applyConfig(parseConfig(event.detail));
    }

    document.addEventListener(YT_CDN_STATUS_CONFIG_EVENT, onConfigEvent as EventListener);
    readConfigFromDocument();

    try {
        const originalFetch = window.fetch;
        window.fetch = function (...args: Parameters<typeof window.fetch>) {
            try {
                const input = args[0];
                const url = typeof input === 'string'
                    ? input
                    : input instanceof Request
                        ? input.url
                        : input instanceof URL
                            ? input.href
                            : undefined;

                if (typeof url === 'string' && shouldReport(url)) {
                    report(url);
                }
            } catch {
                // ignore fetch probe errors
            }
            return originalFetch.apply(this, args);
        };
    } catch {
        // ignore fetch patch errors
    }

    try {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (...args: unknown[]) {
            try {
                const url = args[1];
                if (typeof url === 'string' && shouldReport(url)) {
                    report(url);
                }
            } catch {
                // ignore xhr probe errors
            }
            return originalOpen.apply(this, args as Parameters<typeof originalOpen>);
        };
    } catch {
        // ignore xhr patch errors
    }
})();
