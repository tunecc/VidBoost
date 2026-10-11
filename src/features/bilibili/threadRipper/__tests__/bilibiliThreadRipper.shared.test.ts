import { describe, expect, it } from 'vitest';
import {
    BB_TR_BRIDGE_CHANNEL,
    BB_TR_CONTENT_SOURCE,
    BB_TR_GLOBAL_KEY,
    BB_TR_LS_KEY,
    BB_TR_PAGE_SOURCE,
    DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG,
    cloneBilibiliThreadRipperPageConfig,
    sanitizeBilibiliThreadRipperPageConfig
} from '../bilibiliThreadRipper.shared';

describe('bilibili thread ripper shared config', () => {
    it('exposes stable channel constants', () => {
        expect(BB_TR_GLOBAL_KEY).toBe('__VB_BB_THREAD_RIPPER__');
        expect(BB_TR_LS_KEY).toBe('__vb_bb_thread_ripper_config__');
        expect(BB_TR_BRIDGE_CHANNEL).toBe('vb:bb-thread-ripper');
        expect(BB_TR_PAGE_SOURCE).toBe('vb:bb-thread-ripper:page');
        expect(BB_TR_CONTENT_SOURCE).toBe('vb:bb-thread-ripper:content');
    });

    it('defaults both capabilities to disabled', () => {
        expect(DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG).toEqual({
            threadRipper: { enabled: false },
            noP2p: { enabled: false }
        });
    });

    it('clones only whitelisted fields', () => {
        const clone = cloneBilibiliThreadRipperPageConfig({
            threadRipper: { enabled: true },
            noP2p: { enabled: true }
        } as Parameters<typeof cloneBilibiliThreadRipperPageConfig>[0]);
        expect(clone).toEqual({ threadRipper: { enabled: true }, noP2p: { enabled: true } });
        expect(Object.keys(clone)).toEqual(['threadRipper', 'noP2p']);
    });

    it('sanitizes non-boolean and missing fields back to defaults', () => {
        expect(sanitizeBilibiliThreadRipperPageConfig(null)).toEqual({
            threadRipper: { enabled: false },
            noP2p: { enabled: false }
        });
        expect(
            sanitizeBilibiliThreadRipperPageConfig({
                threadRipper: { enabled: 'yes' as unknown as boolean },
                noP2p: {}
            })
        ).toEqual({ threadRipper: { enabled: false }, noP2p: { enabled: false } });
        expect(
            sanitizeBilibiliThreadRipperPageConfig({
                threadRipper: { enabled: true },
                noP2p: { enabled: false }
            })
        ).toEqual({ threadRipper: { enabled: true }, noP2p: { enabled: false } });
    });
});
