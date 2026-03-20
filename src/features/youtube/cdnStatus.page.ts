import {
    YT_CDN_STATUS_BRIDGE_CHANNEL,
    YT_CDN_STATUS_CONTENT_SOURCE,
    YT_CDN_STATUS_PAGE_SOURCE,
    type YouTubeCdnStatusPageConfig
} from './cdnStatus.shared';

type BridgeToPageMessage = {
    source: string;
    channel: string;
    type: 'initial' | 'change';
    config?: YouTubeCdnStatusPageConfig;
};

(() => {
    const host = window as unknown as Record<string, unknown>;
    const globalKey = '__vb_yt_cdn_status_installed__';
    if (host[globalKey]) return;
    host[globalKey] = true;

    let enabled = false;
    let lastReportedUrl = '';
    let lastReportedAt = 0;

    function isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object';
    }

    function shouldReport(url: string) {
        return enabled && url.includes('googlevideo.com') && url.includes('/videoplayback');
    }

    function report(url: string) {
        const now = Date.now();
        if (url === lastReportedUrl && now - lastReportedAt < 250) return;
        lastReportedUrl = url;
        lastReportedAt = now;

        window.postMessage({
            source: YT_CDN_STATUS_PAGE_SOURCE,
            channel: YT_CDN_STATUS_BRIDGE_CHANNEL,
            type: 'videoplayback-url',
            url
        }, window.location.origin);
    }

    function onBridgeMessage(event: MessageEvent<unknown>) {
        if (event.source !== window) return;
        if (!isRecord(event.data)) return;

        const data = event.data as Partial<BridgeToPageMessage>;
        if (data.source !== YT_CDN_STATUS_CONTENT_SOURCE) return;
        if (data.channel !== YT_CDN_STATUS_BRIDGE_CHANNEL) return;
        if (data.type !== 'initial' && data.type !== 'change') return;

        enabled = data.config?.enabled === true;
    }

    window.addEventListener('message', onBridgeMessage as EventListener);

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

    window.postMessage({
        source: YT_CDN_STATUS_PAGE_SOURCE,
        channel: YT_CDN_STATUS_BRIDGE_CHANNEL,
        type: 'init'
    }, window.location.origin);
})();
