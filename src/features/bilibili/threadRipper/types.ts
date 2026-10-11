// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (src/types.ts).
//
// Only the types referenced by this work package's ported files are carried over; later work
// packages will append to this file as more upstream modules are ported.

import type { SyntheticXhrSink } from './interceptor/xhrOverride';
import type { player } from './player/interceptorIndex';

export type XHROpenArgs =
    | [
        method: string,
        url: string | URL,
        async: boolean,
        username?: string | null | undefined,
        password?: string | null | undefined
    ]
    | [
        method: string,
        url: string | URL
    ];

/**
 * If `null` is returned, the fetch will be nullified.
 * If a `Response` is returned, the fetch will be mocaked with the response.
 */
export type FetchArgs = [requestInfo: RequestInfo | URL, requestInit?: RequestInit];
export type OnBeforeFetchHook = (fetchArgs: FetchArgs) => FetchArgs | null | Response;
/**
 * If `null` is returned, the XMLHttpRequest will be nullified.
 */
export type OnXhrOpenHook = (xhrOpenArgs: XHROpenArgs, xhr: XMLHttpRequest) => XHROpenArgs | null;

export interface XhrSendContext {
    readonly xhr: XMLHttpRequest,
    /** Upper-cased request method */
    readonly method: string,
    /** Absolute request URL after all `onXhrOpen` hooks */
    readonly url: string,
    /** The URL originally passed to `open()` */
    readonly originalUrl: string | URL,
    readonly async: boolean,
    /** `open()` received a username or password */
    readonly hasUrlCredentials: boolean,
    /** Request headers set by the page, names lower-cased, in call order */
    readonly headers: ReadonlyArray<readonly [name: string, value: string]>,
    readonly body: Document | XMLHttpRequestBodyInit | null | undefined,
    readonly responseType: XMLHttpRequestResponseType,
    readonly withCredentials: boolean,
    readonly timeout: number
}

export type XhrResponder = (response: SyntheticXhrSink) => void;
/**
 * Return a responder to answer the request with a synthetic response, or `null` to let the
 * browser send it. Only `responseType === 'arraybuffer'` requests can be answered.
 */
export type OnXhrSendHook = (ctx: XhrSendContext) => XhrResponder | null;

/** What media modules get as `hook.player`: the player request interceptor (`player/interceptorIndex`) */
export type PlayerHook = typeof player;

export interface MakeBilibiliGreatThanEverBeforeHook {
    addStyle(this: void, css: string): void,
    onBeforeFetch(this: void, cb: OnBeforeFetchHook): void,
    onResponse(this: void, cb: (response: Response, fetchArgs: FetchArgs, $fetch: typeof fetch) => Promise<Response> | Response): void,
    onXhrOpen(this: void, cb: OnXhrOpenHook): void,
    onAfterXhrOpen(this: void, cb: (xhr: XMLHttpRequest) => void): void,
    onXhrResponse(this: void, cb: (method: string, url: string | URL, response: unknown, xhr: XMLHttpRequest) => unknown): void,
    onXhrSend(this: void, cb: OnXhrSendHook): void,
    onlyCallOnce(this: void, fn: () => void): void,
    /** The page's original `fetch`, bypassing every `onBeforeFetch` / `onResponse` hook */
    readonly nativeFetch: typeof fetch,
    /** The player request interceptor: media modules register their phases here */
    readonly player: PlayerHook
};
