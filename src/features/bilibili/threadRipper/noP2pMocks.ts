// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (src/modules/no-p2p.ts, src/utils/define-readonly-property.ts).
//
// Adaptation: the userscript's `unsafeWindow` (the page window through the GM sandbox) becomes the
// MAIN-world `window`; `foxts/noop` comes from the local `../vendor/foxts`; the upstream module-menu
// wrapper (`MakeBilibiliGreatThanEverBeforeModule`) is replaced by this file's `installNoP2p`
// assembly function, which a later page-entry work package calls.

import { noop } from './vendor/foxts';
import type { MakeBilibiliGreatThanEverBeforeHook } from './types';
import type { MediaCandidate } from './player/candidates';
import { noP2PPolicy } from './noP2pPolicy';

/** Upstream `src/utils/define-readonly-property.ts` (inlined) */
function defineReadonlyProperty<T, K extends string | symbol>(
    target: T,
    key: K,
    value: K extends keyof T ? T[K] : unknown,
    enumerable = true
) {
    Object.defineProperty(target, key, {
        get() {
            return value;
        },
        set: noop,
        configurable: false,
        enumerable
    });
}

class MockPCDNLoader { }

class MockBPP2PSDK {
    on = noop;
}

class MockSeederSDK { }

/**
 * The player request interceptor's policy phase: no media from P2P / PCDN hosts. The player's
 * P2P URLs are replaced by official ones.
 *
 * Upstream equivalent of the `no-p2p` module's `any(hook)` body: stub the three P2P SDK globals
 * the player feature-detects, then register the policy phase with the player interceptor.
 */
export function installNoP2p(
    hook: MakeBilibiliGreatThanEverBeforeHook,
    filter: (this: void, candidates: readonly MediaCandidate[]) => MediaCandidate[] = noP2PPolicy
): void {
    defineReadonlyProperty(window, 'PCDNLoader', MockPCDNLoader);
    defineReadonlyProperty(window, 'BPP2PSDK', MockBPP2PSDK);
    defineReadonlyProperty(window, 'SeederSDK', MockSeederSDK);

    hook.player.registerPhase({
        type: 'policy',
        name: 'no-p2p',
        filter
    });
}
