import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import {
    installBilibiliThreadRipperBridge,
    pushBilibiliThreadRipperPageConfig,
    uninstallBilibiliThreadRipperBridge
} from './bilibili/threadRipper/bilibiliThreadRipper';
import {
    DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG,
    sanitizeBilibiliThreadRipperPageConfig,
    type BilibiliThreadRipperPageConfig
} from './bilibili/threadRipper/bilibiliThreadRipper.shared';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function readEnabledFlag(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return value.enabled === true;
}

export class BilibiliThreadRipper implements Feature {
    private enabled = false;
    private config: BilibiliThreadRipperPageConfig = { ...DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG };

    mount() {
        if (!isSiteHost('bilibili')) return;
        if (this.enabled) return;
        this.enabled = true;

        installBilibiliThreadRipperBridge();

        pushBilibiliThreadRipperPageConfig(sanitizeBilibiliThreadRipperPageConfig(this.config));
    }

    unmount() {
        this.enabled = false;
        uninstallBilibiliThreadRipperBridge();
        pushBilibiliThreadRipperPageConfig({ ...DEFAULT_BB_THREAD_RIPPER_PAGE_CONFIG });
    }

    updateSettings(settings: unknown) {
        const record = settings as Record<string, unknown> | undefined;
        if (!record) return;

        const bbThreadRipperOn = readEnabledFlag(record.bb_thread_ripper);
        const bbNoP2pOn = readEnabledFlag(record.bb_no_p2p);

        // Effective states per the confirmed mutual-exclusion rule:
        // - thread-ripper and no-p2p are independent and may both be on;
        // - CDN is normalized off whenever either of them is on (that
        //   normalized CDN state is pushed to the CDN page script by the
        //   content entry via BilibiliCDN.updateSettings — this class only
        //   pushes its own thread-ripper / no-p2p config).
        const threadRipperEffective = bbThreadRipperOn;
        const noP2pEffective = bbNoP2pOn;

        this.config = sanitizeBilibiliThreadRipperPageConfig({
            threadRipper: { enabled: threadRipperEffective },
            noP2p: { enabled: noP2pEffective }
        });

        if (this.enabled) {
            pushBilibiliThreadRipperPageConfig(this.config);
        }
    }
}
