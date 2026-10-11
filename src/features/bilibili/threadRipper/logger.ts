// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (src/logger.ts).
//
// Thin console wrapper replacing the upstream GM-sandbox logger: the upstream one binds the page's
// `unsafeWindow.console` methods with a `[make-bilibili-great-than-ever-before]` prefix; here the
// MAIN-world `console` is bound directly with a `[VB-TR]` prefix. The upstream debug logger is
// no-op unless the userscript's build-time DEBUG flag is set; the extension keeps `debug` bound so
// the ported modules' diagnostics stay reachable.

const PREFIX = '[VB-TR]';

export const logger = {
    log: console.log.bind(console, PREFIX),
    error: console.error.bind(console, PREFIX),
    warn: console.warn.bind(console, PREFIX),
    info: console.info.bind(console, PREFIX),
    debug: console.debug.bind(console, PREFIX)
};
