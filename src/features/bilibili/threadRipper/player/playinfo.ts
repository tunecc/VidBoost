// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (src/core/player/playinfo.ts).
//
// Adaptation: the userscript's `unsafeWindow` becomes the MAIN-world `window`; `onDOMContentLoaded`
// (upstream `src/utils/on-load-event.ts`, outside this work package's file list) is inlined below
// verbatim; imports come from the local `../logger`, `../types` and `../interceptor/` modules.

import { logger } from '../logger';
import type { MakeBilibiliGreatThanEverBeforeHook } from '../types';
import { getUrlFromRequest } from '../interceptor/getUrlFromRequest';
import { isObject } from '../interceptor/isObject';
import type { ReadonlyURL } from '../interceptor/readonlyUrl';

declare global {
    interface Window {
        __playinfo__?: unknown
    }
}

const playurlApiRegex = /\/\/api\.bilibili\.com\/(?:x\/player\/(?:wbi\/)?playurl|pgc\/player\/web\/(?:v2\/)?playurl|pugv\/player\/web\/playurl)(?:[#/?]|$)/;

export function isPlayurlApi(url: string | ReadonlyURL): boolean {
    return playurlApiRegex.test(url.toString());
}

/** Upstream `src/utils/on-load-event.ts` (inlined) */
function onDOMContentLoaded(callback: () => void) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
        callback();
    }
}

/**
 * Catch every playinfo the page receives: the one embedded in the page (`window.__playinfo__`),
 * and every playurl API response over XHR or fetch.
 */
export function initPlayinfoCapture(
    { onXhrResponse, onResponse }: Pick<MakeBilibiliGreatThanEverBeforeHook, 'onXhrResponse' | 'onResponse'>,
    ingest: (json: object, meta: string) => void
) {
    let current: unknown = window.__playinfo__;
    let lastIngested: unknown = null;

    const ingestEmbedded = (value: unknown, meta: string) => {
        if (value !== lastIngested && isObject(value)) {
            lastIngested = value;
            ingest(value, meta);
        }
    };

    ingestEmbedded(current, 'window.__playinfo__');

    // The page assigns `window.__playinfo__` in an inline script, before the player loads:
    // trap the assignment instead of polling for it
    try {
        Object.defineProperty(window, '__playinfo__', {
            configurable: true,
            enumerable: true,
            get() {
                return current;
            },
            set(value: unknown) {
                current = value;
                ingestEmbedded(value, 'window.__playinfo__ (setter)');
            }
        });
    } catch (e) {
        logger.warn('Failed to trap window.__playinfo__', e);
    }

    // In case the page (re)defines the property instead of assigning it
    onDOMContentLoaded(() => {
        ingestEmbedded(window.__playinfo__, 'window.__playinfo__ (DOMContentLoaded)');
    });

    onXhrResponse((_method, url, response) => {
        if (!isPlayurlApi(url)) {
            return response;
        }
        if (typeof response === 'string') {
            try {
                const json: unknown = JSON.parse(response);
                if (isObject(json)) {
                    ingest(json, 'playurl XHR API');
                }
            } catch (e) {
                logger.error('Failed to parse playinfo XHR API JSON', e, { response });
            }
        } else if (isObject(response)) {
            // responseType: 'json'
            ingest(response, 'playurl XHR API (json)');
        }
        return response;
    });

    onResponse((response, fetchArgs) => {
        const url = response.url || getUrlFromRequest(fetchArgs[0]);
        if (url && isPlayurlApi(url)) {
            response
                .clone()
                .json()
                .then((json: unknown) => {
                    if (isObject(json)) {
                        ingest(json, 'playurl fetch API');
                    }
                })
                .catch((e: unknown) => logger.error('Failed to parse playinfo fetch API JSON', e, { url }));
        }
        return response;
    });
}
