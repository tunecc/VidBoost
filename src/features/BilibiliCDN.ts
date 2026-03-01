import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import { installBilibiliCdnBridge, pushBilibiliCdnConfig, startSpeedTest, abortSpeedTest } from './bilibili/bilibiliCdn';
import type { BilibiliCdnConfig } from '../lib/settings';
import type { SpeedTestResult } from './bilibili/bilibiliCdn.shared';
import type { CdnNode } from '../lib/bilibiliCdnData';

export class BilibiliCDN implements Feature {
    private enabled = false;
    private config: BilibiliCdnConfig = { enabled: false, node: '', bangumiMode: false };

    mount() {
        if (!isSiteHost('bilibili')) return;
        if (this.enabled) return;
        this.enabled = true;

        installBilibiliCdnBridge();

        pushBilibiliCdnConfig({
            enabled: this.config.enabled,
            node: this.config.node,
            bangumiMode: this.config.bangumiMode
        });
    }

    unmount() {
        this.enabled = false;
        pushBilibiliCdnConfig({ enabled: false, node: '', bangumiMode: false });
    }

    updateSettings(settings: unknown) {
        const record = settings as Record<string, unknown> | undefined;
        if (!record) return;

        const cdnConfig = record.bb_cdn as BilibiliCdnConfig | undefined;
        if (cdnConfig) {
            this.config = { ...cdnConfig };
        }

        if (this.enabled) {
            pushBilibiliCdnConfig({
                enabled: this.config.enabled,
                node: this.config.node,
                bangumiMode: this.config.bangumiMode
            });
        }
    }

    runSpeedTest(
        nodes: CdnNode[],
        onResult: (result: SpeedTestResult) => void,
        onDone: () => void
    ) {
        if (!this.enabled) {
            if (isSiteHost('bilibili')) {
                installBilibiliCdnBridge();
                this.enabled = true;
            }
        }

        startSpeedTest(
            nodes.map(n => ({ id: n.id, host: n.host })),
            onResult,
            onDone
        );
    }

    abortSpeedTest() {
        if (!this.enabled) return;
        abortSpeedTest();
    }
}
