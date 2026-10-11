import { describe, expect, it } from 'vitest';
import {
    acceptsFamily,
    estimate,
    isAddressBanned,
    isCoolingDown,
    isExcluded,
    isFamilyRefused,
    MediaOutcome,
    noteBytes,
    provenAddress,
    recordOutcome,
    recordSpeed,
    typicalSpeed
} from '../player/hostModel';
import type { MediaFile } from '../player/registry';

let fileSeq = 0;

/** A hand-built MediaFile: hostModel is keyed by `file.key` / `file.videoKey` only */
function makeFile(): MediaFile {
    const n = ++fileSeq;
    return {
        key: `host-model-file-${n}`,
        videoKey: `host-model-video-${n}`,
        kind: 'video',
        codecs: 'avc1.640028',
        mimeType: 'video/mp4',
        bandwidth: 2000000,
        segmentBase: null,
        addresses: []
    };
}

/** The host just served something, so it is warm and `estimate` does not apply the cold multiplier */
function warmUp(host: string, file: MediaFile) {
    recordOutcome(host, file, { key: `/${host}?warm=1`, family: 'upos' }, MediaOutcome.Ok, performance.now(), false);
}

describe('threadRipper host model estimates', () => {
    it('updates the estimate as speed samples arrive and falls back to the typical speed', () => {
        const file = makeFile();
        const host = 'hm-basic.bilivideo.com';
        warmUp(host, file);
        const before = estimate(host, file, 8000);
        expect(before.measured).toBe(false);

        for (let i = 0; i < 8; i++) {
            recordSpeed(host, file, { ttfb: 100, rate: 1000, partial: false, gap: 20 });
        }
        const est = estimate(host, file, 8000);
        expect(est.measured).toBe(true);
        expect(est.ttfb).toBe(100);
        expect(est.rate).toBe(1000);
        expect(est.eta).toBe(100 + 8);
        expect(est.gap).toBe(20);

        // an unmeasured host on the same video falls back to the typical speed, doubled: it is cold
        const other = estimate('hm-basic-other.bilivideo.com', file, 8000);
        expect(other.measured).toBe(false);
        expect(other.ttfb).toBe(200);
        expect(other.rate).toBe(1000);
    });

    it('keeps only the last 8 samples per host and video', () => {
        const file = makeFile();
        const host = 'hm-window.bilivideo.com';
        warmUp(host, file);
        recordSpeed(host, file, { ttfb: 1000, rate: 1000, partial: false, gap: null });
        recordSpeed(host, file, { ttfb: 1000, rate: 1000, partial: false, gap: null });
        for (let i = 0; i < 8; i++) {
            recordSpeed(host, file, { ttfb: 100, rate: 1000, partial: false, gap: null });
        }
        // the two 1000 ms samples fell out of the 8-sample window
        expect(estimate(host, file, 0).ttfb).toBe(100);
    });

    it('shows a sudden turn for the worse at once (the robust mutation rule)', () => {
        const file = makeFile();
        // ttfb, higher is worse: the two latest are both 2x the median -> they win over the median
        const ttfbHost = 'hm-robust-ttfb.bilivideo.com';
        warmUp(ttfbHost, file);
        for (let i = 0; i < 3; i++) {
            recordSpeed(ttfbHost, file, { ttfb: 100, rate: 1000, partial: false, gap: null });
        }
        recordSpeed(ttfbHost, file, { ttfb: 300, rate: 1000, partial: false, gap: null });
        recordSpeed(ttfbHost, file, { ttfb: 300, rate: 1000, partial: false, gap: null });
        expect(estimate(ttfbHost, file, 0).ttfb).toBe(300);

        // only one bad sample: the median still stands
        const singleHost = 'hm-robust-single.bilivideo.com';
        warmUp(singleHost, file);
        for (let i = 0; i < 3; i++) {
            recordSpeed(singleHost, file, { ttfb: 100, rate: 1000, partial: false, gap: null });
        }
        recordSpeed(singleHost, file, { ttfb: 300, rate: 1000, partial: false, gap: null });
        expect(estimate(singleHost, file, 0).ttfb).toBe(100);

        // rate, lower is worse: the two latest are both half the median -> they win over the median
        const rateHost = 'hm-robust-rate.bilivideo.com';
        warmUp(rateHost, file);
        for (let i = 0; i < 3; i++) {
            recordSpeed(rateHost, file, { ttfb: 100, rate: 1000, partial: false, gap: null });
        }
        recordSpeed(rateHost, file, { ttfb: 100, rate: 100, partial: false, gap: null });
        recordSpeed(rateHost, file, { ttfb: 100, rate: 100, partial: false, gap: null });
        expect(estimate(rateHost, file, 0).rate).toBe(100);
    });

    it('doubles the ttfb of a host idle for longer than WARM_MS (30s)', () => {
        const file = makeFile();
        const host = 'hm-warm.bilivideo.com';
        warmUp(host, file);
        for (let i = 0; i < 4; i++) {
            recordSpeed(host, file, { ttfb: 100, rate: 1000, partial: false, gap: null });
        }
        expect(estimate(host, file, 0).ttfb).toBe(100);

        // the host has been idle for 31s: its connection is probably closed
        recordOutcome(host, file, { key: '/warm?x=1', family: 'upos' }, MediaOutcome.Ok, performance.now() - 31 * 1000, false);
        expect(estimate(host, file, 0).ttfb).toBe(200);
    });
});

describe('threadRipper recordOutcome transitions', () => {
    const now = performance.now();

    it('records a validated response: proven address and accepted family, no cooldown', () => {
        const file = makeFile();
        const host = 'hm-ok.bilivideo.com';
        const key = '/ok?x=1';
        recordOutcome(host, file, { key, family: 'upos' }, MediaOutcome.Ok, now, false);
        expect(provenAddress(host)).toBe(key);
        expect(acceptsFamily(host, 'upos')).toBe(true);
        expect(isCoolingDown(host, now)).toBe(false);
        expect(isAddressBanned(key)).toBe(false);
    });

    it('cools a host down by 500ms for Truncated, Reset and Stall', () => {
        const file = makeFile();
        for (const [i, outcome] of [MediaOutcome.Truncated, MediaOutcome.Reset, MediaOutcome.Stall].entries()) {
            const host = `hm-short-cool-${i}.bilivideo.com`;
            // these are connection failures: the network must look up for the outcome to count
            noteBytes(now - 100);
            recordOutcome(host, file, { key: `/short-${i}?x=1`, family: 'upos' }, outcome, now, false);
            expect(isCoolingDown(host, now + 499), MediaOutcome[outcome]).toBe(true);
            expect(isCoolingDown(host, now + 500), MediaOutcome[outcome]).toBe(false);
        }
    });

    it('excludes the host from the file for good on structural failures', () => {
        const file = makeFile();
        for (const [i, outcome] of [MediaOutcome.BadRange, MediaOutcome.StaleObject, MediaOutcome.NoRange, MediaOutcome.Unverifiable, MediaOutcome.Redirect, MediaOutcome.Missing, MediaOutcome.Integrity].entries()) {
            const host = `hm-exclude-${i}.bilivideo.com`;
            recordOutcome(host, file, { key: `/exclude-${i}?x=1`, family: 'upos' }, outcome, now, false);
            // even an hour later the host has not got this file
            expect(isExcluded(host, file, now + 60 * 60 * 1000), MediaOutcome[outcome]).toBe(true);
        }
    });

    it('bans the signed address itself when it has expired', () => {
        const file = makeFile();
        const key = '/expired?x=1';
        recordOutcome('hm-expired.bilivideo.com', file, { key, family: 'upos' }, MediaOutcome.Expired, now, false);
        expect(isAddressBanned(key)).toBe(true);
        // the host itself is not punished for it
        expect(isCoolingDown('hm-expired.bilivideo.com', now)).toBe(false);
        expect(isExcluded('hm-expired.bilivideo.com', file, now)).toBe(false);
    });

    it('cools a host down by 2000ms scaled by 2^streak for Throttled', () => {
        const file = makeFile();
        const host = 'hm-throttled.bilivideo.com';
        recordOutcome(host, file, { key: '/t?x=1', family: 'upos' }, MediaOutcome.Throttled, now, false);
        expect(isCoolingDown(host, now + 1999)).toBe(true);
        expect(isCoolingDown(host, now + 2000)).toBe(false);
        // streak 1: 2000 * 2
        recordOutcome(host, file, { key: '/t?x=1', family: 'upos' }, MediaOutcome.Throttled, now + 2000, false);
        expect(isCoolingDown(host, now + 2000 + 3999)).toBe(true);
        expect(isCoolingDown(host, now + 2000 + 4000)).toBe(false);
    });

    it('cools a host down by 1000ms scaled by 2^streak for ServerError and Network', () => {
        const file = makeFile();
        const serverHost = 'hm-server-error.bilivideo.com';
        recordOutcome(serverHost, file, { key: '/se?x=1', family: 'upos' }, MediaOutcome.ServerError, now, false);
        expect(isCoolingDown(serverHost, now + 999)).toBe(true);
        expect(isCoolingDown(serverHost, now + 1000)).toBe(false);

        // Network is a connection failure: it only counts while the network is otherwise up
        const networkHost = 'hm-network.bilivideo.com';
        noteBytes(now - 100);
        recordOutcome(networkHost, file, { key: '/nw?x=1', family: 'upos' }, MediaOutcome.Network, now, false);
        expect(isCoolingDown(networkHost, now + 999)).toBe(true);
        expect(isCoolingDown(networkHost, now + 1000)).toBe(false);
    });

    it('cools a host down by 60s scaled by 2^streak (capped) for ConnectFail', () => {
        const file = makeFile();
        const host = 'hm-connect-fail.bilivideo.com';
        noteBytes(now - 100);
        recordOutcome(host, file, { key: '/cf?x=1', family: 'upos' }, MediaOutcome.ConnectFail, now, false);
        expect(isCoolingDown(host, now + 60 * 1000 - 1)).toBe(true);
        expect(isCoolingDown(host, now + 60 * 1000)).toBe(false);
        // streak 2 caps the multiplier: 60s * 4. Every later call is 60s later, so the network
        // must look up again for the ConnectFail to count
        let t = now + 60 * 1000;
        for (let i = 0; i < 3; i++) {
            noteBytes(t - 100);
            recordOutcome(host, file, { key: '/cf?x=1', family: 'upos' }, MediaOutcome.ConnectFail, t, false);
            t += 60 * 1000;
        }
        // the later failures are capped at 60s * 4: cooldownUntil is the last call plus 4*60s
        expect(isCoolingDown(host, now + 3 * 60 * 1000 + 4 * 60 * 1000 - 1)).toBe(true);
        expect(isCoolingDown(host, now + 3 * 60 * 1000 + 4 * 60 * 1000)).toBe(false);
    });

    it('exempts connection failures while another request to the host is alive', () => {
        const file = makeFile();
        const host = 'hm-alive.bilivideo.com';
        recordOutcome(host, file, { key: '/alive?x=1', family: 'upos' }, MediaOutcome.ConnectFail, now, true);
        expect(isCoolingDown(host, now + 60 * 1000)).toBe(false);
        recordOutcome(host, file, { key: '/alive?x=1', family: 'upos' }, MediaOutcome.Stall, now, true);
        expect(isCoolingDown(host, now + 1000)).toBe(false);
    });

    it('exempts connection failures when nothing arrived from any host for over 3s', () => {
        const file = makeFile();
        const host = 'hm-network-down.bilivideo.com';
        // the viewer's network went away: bytes last arrived 4s ago
        noteBytes(now - 4000);
        recordOutcome(host, file, { key: '/down?x=1', family: 'upos' }, MediaOutcome.Network, now, false);
        expect(isCoolingDown(host, now + 5000)).toBe(false);
        // and once the network works again, the same outcome counts
        noteBytes(now - 100);
        recordOutcome(host, file, { key: '/down2?x=1', family: 'upos' }, MediaOutcome.Network, now, false);
        expect(isCoolingDown(host, now + 999)).toBe(true);
    });
});

describe('threadRipper Refused disambiguation', () => {
    const now = performance.now();

    it('bans an address no host ever served when the host otherwise works', () => {
        const file = makeFile();
        const host = 'hm-refused-a.bilivideo.com';
        recordOutcome(host, file, { key: '/a-known?x=1', family: 'upos' }, MediaOutcome.Ok, now, false);
        recordOutcome(host, file, { key: '/a-unknown?x=1', family: 'upos' }, MediaOutcome.Refused, now + 10, false);
        expect(isAddressBanned('/a-unknown?x=1')).toBe(true);
        expect(isExcluded(host, file, now + 20)).toBe(false);
        expect(isFamilyRefused(host, 'upos', now + 20)).toBe(false);
    });

    it('excludes the host from the file for 60s when neither the host nor the address is known', () => {
        const file = makeFile();
        const host = 'hm-refused-b.bilivideo.com';
        recordOutcome(host, file, { key: '/b?x=1', family: 'upos' }, MediaOutcome.Refused, now, false);
        expect(isAddressBanned('/b?x=1')).toBe(false);
        expect(isExcluded(host, file, now + 60 * 1000 - 1)).toBe(true);
        expect(isExcluded(host, file, now + 60 * 1000)).toBe(false);
        expect(isFamilyRefused(host, 'upos', now + 1000)).toBe(false);
    });

    it('excludes the host from the file for 60s when both the host and the address work elsewhere', () => {
        const file = makeFile();
        const host = 'hm-refused-c.bilivideo.com';
        // the address is served fine by another host
        recordOutcome('hm-refused-c-other.bilivideo.com', file, { key: '/c?x=1', family: 'upos' }, MediaOutcome.Ok, now, false);
        // this host knows the signature family, so it is not refusing the family
        recordOutcome(host, file, { key: '/c-other?x=1', family: 'upos' }, MediaOutcome.Ok, now, false);
        recordOutcome(host, file, { key: '/c?x=1', family: 'upos' }, MediaOutcome.Refused, now + 10, false);
        expect(isAddressBanned('/c?x=1')).toBe(false);
        expect(isExcluded(host, file, now + 30 * 1000)).toBe(true);
        expect(isFamilyRefused(host, 'upos', now + 30 * 1000)).toBe(false);
    });

    it('marks the whole signature family refused for 30 minutes when only the address works elsewhere', () => {
        const file = makeFile();
        const host = 'hm-refused-d.bilivideo.com';
        // the address itself is served fine elsewhere
        recordOutcome('hm-refused-d-other.bilivideo.com', file, { key: '/d?x=1', family: 'upos' }, MediaOutcome.Ok, now, false);
        // this host has never accepted the family
        recordOutcome(host, file, { key: '/d?x=1', family: 'upos' }, MediaOutcome.Refused, now + 10, false);
        expect(isFamilyRefused(host, 'upos', now + 10 + 29 * 60 * 1000)).toBe(true);
        expect(isFamilyRefused(host, 'upos', now + 10 + 30 * 60 * 1000)).toBe(false);
        expect(isAddressBanned('/d?x=1')).toBe(false);
        expect(isExcluded(host, file, now + 20)).toBe(false);
    });
});

describe('threadRipper typicalSpeed', () => {
    it('medians the measured hosts of the video, else the assumed prior', () => {
        const file = makeFile();
        const prior = typicalSpeed(file);
        expect(prior.ttfb).toBe(350);
        expect(prior.rate).toBe(768 * 1024 / 1000);

        const fast = 'hm-typical-fast.bilivideo.com';
        const mid = 'hm-typical-mid.bilivideo.com';
        const slow = 'hm-typical-slow.bilivideo.com';
        warmUp(fast, file);
        warmUp(mid, file);
        warmUp(slow, file);
        for (let i = 0; i < 4; i++) {
            recordSpeed(fast, file, { ttfb: 50, rate: 2000, partial: false, gap: null });
            recordSpeed(mid, file, { ttfb: 150, rate: 600, partial: false, gap: null });
            recordSpeed(slow, file, { ttfb: 400, rate: 100, partial: false, gap: null });
        }
        // nearest-rank p50 over the three measured hosts
        const typical = typicalSpeed(file);
        expect(typical.ttfb).toBe(150);
        expect(typical.rate).toBe(600);
    });
});
