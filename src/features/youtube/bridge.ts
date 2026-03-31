export function isPageBridgeMessageEvent(event: MessageEvent<unknown>) {
    if (typeof window === 'undefined') return false;
    if (typeof event.origin === 'string' && event.origin && event.origin !== window.location.origin) {
        return false;
    }
    return event.source === window || event.source === null;
}
