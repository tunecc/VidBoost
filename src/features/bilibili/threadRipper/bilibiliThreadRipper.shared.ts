/**
 * Shared constants and types for the Bilibili thread-ripper / no-p2p bridge
 * (between content script in ISOLATED world and page script in MAIN world).
 *
 * Feature origin: ported from Make-Bilibili-Great-Than-Ever-Before (MIT,
 * Copyright (c) 2024 Sukka), PR #31 "feat: thread-ripper".
 */

export type BilibiliThreadRipperRegion = 'auto' | 'mainland' | 'overseas';

export type BilibiliThreadRipperConfig = {
    enabled: boolean;
    region: BilibiliThreadRipperRegion;
};

export type BilibiliNoP2pConfig = {
    enabled: boolean;
};

export type BilibiliThreadRipperPageConfig = {
    threadRipper: BilibiliThreadRipperConfig;
    noP2p: BilibiliNoP2pConfig;
};

export const BB_TR_GLOBAL_KEY = '__VB_BB_THREAD_RIPPER__';
export const BB_TR_LS_KEY = '__vb_bb_thread_ripper_config__';
export const BB_TR_BRIDGE_CHANNEL = 'vb:bb-thread-ripper';
export const BB_TR_PAGE_SOURCE = 'vb:bb-thread-ripper:page';
export const BB_TR_CONTENT_SOURCE = 'vb:bb-thread-ripper:content';

export const DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG: BilibiliThreadRipperPageConfig = {
    threadRipper: { enabled: false, region: 'auto' },
    noP2p: { enabled: false }
};

function sanitizeEnabledFlag(value: unknown): boolean {
    return value === true;
}

function sanitizeRegion(value: unknown): BilibiliThreadRipperRegion {
    return value === 'mainland' || value === 'overseas' ? value : 'auto';
}

export function cloneBilibiliThreadRipperPageConfig(
    config: BilibiliThreadRipperPageConfig
): BilibiliThreadRipperPageConfig {
    return {
        threadRipper: { enabled: config.threadRipper.enabled, region: config.threadRipper.region },
        noP2p: { enabled: config.noP2p.enabled }
    };
}

export function sanitizeBilibiliThreadRipperPageConfig(
    config?: Partial<BilibiliThreadRipperPageConfig> | null
): BilibiliThreadRipperPageConfig {
    return {
        threadRipper: {
            enabled: sanitizeEnabledFlag(config?.threadRipper?.enabled),
            region: sanitizeRegion(config?.threadRipper?.region)
        },
        noP2p: {
            enabled: sanitizeEnabledFlag(config?.noP2p?.enabled)
        }
    };
}
