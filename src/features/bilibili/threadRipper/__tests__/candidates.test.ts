import { describe, expect, it } from 'vitest';
import { CandidateTier, findCandidate, isCandidateUsable, mediaCandidates } from '../player/candidates';
import type { MediaCandidate } from '../player/candidates';
import { ingestPlayinfo, noteHost, toMediaAddress } from '../player/registry';
import type { MediaFile } from '../player/registry';
import { recordOutcome } from '../player/hostModel';
import { MediaOutcome } from '../player/hostModel';

const VIDEO_PATHNAME = '/upgcxcode/51/02/368854051/Cd1/Cd1-1-30080.m4s';

function playinfoOf(baseUrl: string, backupUrl?: string) {
    return {
        code: 0,
        data: {
            dash: {
                video: [{
                    id: 80,
                    baseUrl,
                    ...(backupUrl ? { backupUrl: [backupUrl] } : {}),
                    bandwidth: 2000000,
                    mimeType: 'video/mp4',
                    codecs: 'avc1.640028',
                    SegmentBase: { Initialization: '0-1011', indexRange: '1012-1500' }
                }],
                audio: []
            }
        }
    };
}

function ingestFile(baseUrl: string, backupUrl?: string): MediaFile {
    const files = ingestPlayinfo(playinfoOf(baseUrl, backupUrl), 'candidates test');
    expect(files).not.toBeNull();
    expect(files![0].addresses.length).toBeGreaterThan(0);
    return files![0];
}

describe('threadRipper candidate tiers', () => {
    it('orders the tiers from listed mirrors to foreign hosts', () => {
        const tiers = [
            CandidateTier.ListedMirror,
            CandidateTier.ListedBcache,
            CandidateTier.Mirror,
            CandidateTier.Bcache,
            CandidateTier.Source,
            CandidateTier.Proxy,
            CandidateTier.P2P,
            CandidateTier.Foreign
        ];
        expect(tiers).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });
});

describe('threadRipper mediaCandidates', () => {
    it('generates the same upgcxcode signature on several known hosts', () => {
        const file = ingestFile(`https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}?deadline=1728000000&upsig=c1&os=aliob`);
        const candidates = mediaCandidates(null, file);

        // the listed address itself
        expect(candidates.some(c => c.hostname === 'upos-sz-mirrorali.bilivideo.com' && c.tier === CandidateTier.ListedMirror)).toBe(true);

        // the same signed path moved onto other known upgcxcode hosts (a seed and the file's own set)
        const key = `${VIDEO_PATHNAME}?deadline=1728000000&upsig=c1&os=aliob`;
        for (const hostname of ['upos-sz-mirrorhw.bilivideo.com', 'upos-sz-mirrorbos.bilivideo.com']) {
            const swapped = candidates.find(c => c.hostname === hostname);
            expect(swapped, hostname).toBeDefined();
            expect(swapped!.key).toBe(key);
            expect(swapped!.family).toBe('upos');
            expect(swapped!.tier).toBe(CandidateTier.Mirror);
            expect(swapped!.p2p).toBe(false);
            expect(swapped!.href).toBe(`https://${hostname}${key}`);
        }
        // a PoP host is a bcache tier, not a mirror one
        const pop = candidates.find(c => c.hostname === 'cn-hk-eq-01-01.bilivideo.com');
        expect(pop).toBeDefined();
        expect(pop!.key).toBe(key);
        expect(pop!.tier).toBe(CandidateTier.Bcache);

        // the listed one on its own host wins the dedupe: it stays the listed tier
        expect(candidates.filter(c => c.href === `https://upos-sz-mirrorali.bilivideo.com${key}`).length).toBe(1);
    });

    it('never swaps signatures onto P2P hosts and keeps listed P2P addresses as P2P tier', () => {
        // upos-sz-mirror14b.bilivideo.com matches mirrorRegex but is a known P2P host
        const file = ingestFile(`https://upos-sz-mirror14b.bilivideo.com${VIDEO_PATHNAME}?deadline=1728000000&upsig=p1&os=p2p`);
        const candidates = mediaCandidates(null, file);

        const listed = candidates.find(c => c.hostname === 'upos-sz-mirror14b.bilivideo.com');
        expect(listed).toBeDefined();
        expect(listed!.tier).toBe(CandidateTier.P2P);
        expect(listed!.p2p).toBe(true);

        // the signature itself is still swapped onto every non-P2P upgcxcode host
        const key = `${VIDEO_PATHNAME}?deadline=1728000000&upsig=p1&os=p2p`;
        const swapped = candidates.find(c => c.hostname === 'upos-sz-mirror08c.bilivideo.com');
        expect(swapped).toBeDefined();
        expect(swapped!.key).toBe(key);
        expect(swapped!.p2p).toBe(false);

        // no swap target is a P2P host
        for (const candidate of candidates) {
            if (candidate.hostname === 'upos-sz-mirror14b.bilivideo.com') {
                expect(candidate.p2p).toBe(true);
                expect(candidate.tier).toBe(CandidateTier.P2P);
            }
        }
        expect(candidates.filter(c => c.tier === CandidateTier.P2P).length).toBe(1);
    });

    it('keeps an akam signature on akam hosts and marks it Foreign elsewhere', () => {
        const akamUrl = `https://upos-sz-mirrorakam.akamaized.net${VIDEO_PATHNAME}?deadline=1728000000&hdnts=exp=1728000000~hmac=abc123`;
        const file = ingestFile(akamUrl);
        expect(file.addresses[0].family).toBe('akam');

        // a second akam host, learned from a URL seen outside any playinfo
        noteHost(toMediaAddress(new URL(`https://upos-sz-mirrorakam02.akamaized.net${VIDEO_PATHNAME}?deadline=1728000000&hdnts=exp=1728000000~hmac=xyz`)));

        const candidates = mediaCandidates(null, file);
        const onUposHost = candidates.find(c => c.hostname === 'upos-sz-mirror08c.bilivideo.com');
        expect(onUposHost).toBeDefined();
        expect(onUposHost!.family).toBe('akam');
        expect(onUposHost!.tier).toBe(CandidateTier.Foreign);

        const onAkamHost = candidates.find(c => c.hostname === 'upos-sz-mirrorakam02.akamaized.net');
        expect(onAkamHost).toBeDefined();
        expect(onAkamHost!.family).toBe('akam');
        // an akam signature on an akam host is a normal mirror, not a foreign one
        expect(onAkamHost!.tier).toBe(CandidateTier.Mirror);

        // and the other way round: an upos signature moved onto the akam host is foreign
        const uposFile = ingestFile(`https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}2?deadline=1728000000&upsig=c2&os=aliob`);
        const uposCandidates = mediaCandidates(null, uposFile);
        const onAkam = uposCandidates.find(c => c.hostname === 'upos-sz-mirrorakam.akamaized.net');
        expect(onAkam).toBeDefined();
        expect(onAkam!.tier).toBe(CandidateTier.Foreign);
    });
});

describe('threadRipper isCandidateUsable', () => {
    const nowSec = 1728000000;
    const now = nowSec * 1000;

    function candidateOf(overrides: Partial<MediaCandidate>): MediaCandidate {
        return {
            href: 'https://upos-sz-mirrorali.bilivideo.com/x.m4s?upsig=u',
            hostname: 'upos-sz-mirrorali.bilivideo.com',
            key: '/x.m4s?upsig=u',
            family: 'upos',
            deadline: 0,
            tier: CandidateTier.Mirror,
            p2p: false,
            ...overrides
        };
    }

    it('accepts an address with no known deadline', () => {
        expect(isCandidateUsable(candidateOf({}), null, now, nowSec)).toBe(true);
    });

    it('rejects an address expiring within the 60s signature margin', () => {
        expect(isCandidateUsable(candidateOf({ deadline: nowSec + 120 }), null, now, nowSec)).toBe(true);
        expect(isCandidateUsable(candidateOf({ deadline: nowSec + 59 }), null, now, nowSec)).toBe(false);
        expect(isCandidateUsable(candidateOf({ deadline: nowSec + 61 }), null, now, nowSec)).toBe(true);
    });

    it('rejects a banned address', () => {
        const file = ingestFile(`https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}3?deadline=1728000000&upsig=b1&os=aliob`);
        const bannedKey = '/banned.m4s?upsig=dead';
        recordOutcome('candidates-banned-host.bilivideo.com', file, { key: bannedKey, family: 'upos' }, MediaOutcome.Expired, now, false);
        expect(isCandidateUsable(candidateOf({ key: bannedKey, href: `https://upos-sz-mirrorali.bilivideo.com${bannedKey}` }), null, now, nowSec)).toBe(false);
    });

    it('rejects a host that refuses the signature family or lacks the file', () => {
        const file = ingestFile(`https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}4?deadline=1728000000&upsig=r1&os=aliob`);
        const refusingHost = 'candidates-refusing-host.bilivideo.com';
        // the address works elsewhere, the host never accepted the family: it refuses the family
        recordOutcome('candidates-refused-other.bilivideo.com', file, { key: '/refused.m4s?upsig=r', family: 'akam' }, MediaOutcome.Ok, now, false);
        recordOutcome(refusingHost, file, { key: '/refused.m4s?upsig=r', family: 'akam' }, MediaOutcome.Refused, now, false);
        expect(isCandidateUsable(candidateOf({ hostname: refusingHost, family: 'akam' }), file, now, nowSec)).toBe(false);

        const lackingHost = 'candidates-lacking-host.bilivideo.com';
        recordOutcome(lackingHost, file, { key: '/whatever.m4s?upsig=w', family: 'upos' }, MediaOutcome.Missing, now, false);
        expect(isCandidateUsable(candidateOf({ hostname: lackingHost }), file, now, nowSec)).toBe(false);
        // with no file there is no exclusion to honour
        expect(isCandidateUsable(candidateOf({ hostname: lackingHost }), null, now, nowSec)).toBe(true);
    });

    it('finds the candidate a request stands for', () => {
        const file = ingestFile(`https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}5?deadline=1728000000&upsig=f1&os=aliob`);
        const candidates = mediaCandidates(null, file);
        const found = findCandidate(candidates, file.addresses[0]);
        expect(found).toBeDefined();
        expect(found!.hostname).toBe(file.addresses[0].hostname);
        expect(found!.key).toBe(file.addresses[0].key);
        expect(findCandidate(candidates, { ...file.addresses[0], hostname: 'none.bilivideo.com' })).toBeNull();
    });

    it('strips the /v1/resource transport wrapper from swap keys on wrapped PCDN paths', () => {
        // Bilibili PCDN edges (e.g. *.edge.mountaintoys.cn, *.mcdn.bilivideo.cn) sometimes wrap
        // the swappable /upgcxcode/ path in a /v1/resource transport prefix. The signature rides
        // on the query, so the swap key must be the bare /upgcxcode/ suffix: keeping the wrapper
        // makes every official mirror answer 403.
        const wrapped = ingestFile(`https://xy220x202x9x135xy.mcdn.bilivideo.cn:8082/v1/resource${VIDEO_PATHNAME}?deadline=1728000000&upsig=w1&os=mcdn`);
        const candidates = mediaCandidates(null, wrapped);

        // the listed (wrapped) address itself stays as-is so findCandidate still matches it
        const listed = findCandidate(candidates, wrapped.addresses[0]);
        expect(listed).not.toBeNull();
        expect(listed!.key.startsWith('/v1/resource/upgcxcode/')).toBe(true);

        const swaps = candidates.filter(c => c !== listed && c.hostname !== wrapped.addresses[0].hostname);
        expect(swaps.length).toBeGreaterThan(0);
        for (const swap of swaps) {
            expect(swap.key.startsWith('/upgcxcode/')).toBe(true);
            expect(swap.key.includes('/v1/resource')).toBe(false);
            expect(swap.href).toBe(`https://${swap.hostname}${swap.key}`);
        }
    });
});
