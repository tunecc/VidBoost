/**
 * Bilibili CDN node data from PiliPlus project.
 * Source: https://github.com/yujincheng08/BiliRoaming
 *
 * Each node has an id, human-readable label (cloud provider), and host domain.
 */

export type CdnNode = {
    id: string;
    label: string;
    host: string;
};

export const CDN_NODES: CdnNode[] = [
    { id: 'ali', label: 'ali（阿里云）', host: 'upos-sz-mirrorali.bilivideo.com' },
    { id: 'alib', label: 'alib（阿里云）', host: 'upos-sz-mirroralib.bilivideo.com' },
    { id: 'alio1', label: 'alio1（阿里云）', host: 'upos-sz-mirroralio1.bilivideo.com' },
    { id: 'cos', label: 'cos（腾讯云）', host: 'upos-sz-mirrorcos.bilivideo.com' },
    { id: 'cosb', label: 'cosb（腾讯云 VOD）', host: 'upos-sz-mirrorcosb.bilivideo.com' },
    { id: 'coso1', label: 'coso1（腾讯云）', host: 'upos-sz-mirrorcoso1.bilivideo.com' },
    { id: 'hw', label: 'hw（华为云）', host: 'upos-sz-mirrorhw.bilivideo.com' },
    { id: 'hwb', label: 'hwb（华为云）', host: 'upos-sz-mirrorhwb.bilivideo.com' },
    { id: 'hwo1', label: 'hwo1（华为云）', host: 'upos-sz-mirrorhwo1.bilivideo.com' },
    { id: 'hw_08c', label: '08c（华为云）', host: 'upos-sz-mirror08c.bilivideo.com' },
    { id: 'hw_08h', label: '08h（华为云）', host: 'upos-sz-mirror08h.bilivideo.com' },
    { id: 'hw_08ct', label: '08ct（华为云）', host: 'upos-sz-mirror08ct.bilivideo.com' },
    { id: 'tf_hw', label: 'tf_hw（华为云）', host: 'upos-tf-all-hw.bilivideo.com' },
    { id: 'tf_tx', label: 'tf_tx（腾讯云）', host: 'upos-tf-all-tx.bilivideo.com' },
    { id: 'akamai', label: 'akamai（Akamai 海外）', host: 'upos-hz-mirrorakam.akamaized.net' },
    { id: 'aliov', label: 'aliov（阿里云海外）', host: 'upos-sz-mirroraliov.bilivideo.com' },
    { id: 'cosov', label: 'cosov（腾讯云海外）', host: 'upos-sz-mirrorcosov.bilivideo.com' },
    { id: 'hwov', label: 'hwov（华为云海外）', host: 'upos-sz-mirrorhwov.bilivideo.com' },
    { id: 'hk_bcache', label: 'hk_bcache（Bilibili 海外）', host: 'cn-hk-eq-bcache-01.bilivideo.com' },
];

/** Speed test sample video — a short public video for download benchmarking */
export const SPEED_TEST_BV = 'BV1fK4y1t7hj';
export const SPEED_TEST_CID = 196018899;
/** Max bytes to download per node during speed test (8 MB) */
export const SPEED_TEST_MAX_BYTES = 8 * 1024 * 1024;
