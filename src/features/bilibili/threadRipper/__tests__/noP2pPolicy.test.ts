import { describe, expect, it } from 'vitest';
import { mediaCandidates } from '../player/candidates';
import { CandidateTier } from '../player/candidates';
import { ingestPlayinfo } from '../player/registry';
import type { MediaFile } from '../player/registry';
import { noP2PPolicy } from '../noP2pPolicy';

const VIDEO_PATHNAME = '/upgcxcode/61/03/368854061/Dd1/Dd1-1-30080.m4s';

function ingestFile(baseUrl: string): MediaFile {
    const files = ingestPlayinfo({
        code: 0,
        data: {
            dash: {
                video: [{
                    id: 80,
                    baseUrl,
                    bandwidth: 2000000,
                    mimeType: 'video/mp4',
                    codecs: 'avc1.640028'
                }],
                audio: []
            }
        }
    }, 'no-p2p policy test');
    expect(files).not.toBeNull();
    return files![0];
}

describe('threadRipper no-p2p policy', () => {
    it('lets non-P2P candidates through untouched', () => {
        const file = ingestFile(`https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}?deadline=1728000000&upsig=n1&os=aliob`);
        const candidates = mediaCandidates(null, file);
        expect(candidates.length).toBeGreaterThan(0);
        const acceptable = noP2PPolicy(candidates);
        // nothing was a P2P URL: the policy is the identity on them
        expect(acceptable.length).toBe(candidates.length);
        expect(acceptable.map(c => c.href)).toEqual(candidates.map(c => c.href));
        expect(acceptable.every(c => !c.p2p)).toBe(true);
    });

    it('points a szbdyd URL back at its xy_usource source host as tier Source', () => {
        const source = 'upos-sz-mirrorali.bilivideo.com';
        const file = ingestFile(`http://xy123.szbdyd.com/v1/resource?deadline=1728000000&upsig=s1&xy_usource=${source}`);
        const candidates = mediaCandidates(null, file);
        expect(candidates.length).toBe(1);
        expect(candidates[0].tier).toBe(CandidateTier.P2P);

        const acceptable = noP2PPolicy(candidates);
        expect(acceptable.length).toBe(1);
        const converted = acceptable[0];
        expect(converted.hostname).toBe(source);
        expect(converted.href).toBe(`https://${source}/v1/resource?deadline=1728000000&upsig=s1&xy_usource=${source}`);
        expect(converted.key).toBe(`/v1/resource?deadline=1728000000&upsig=s1&xy_usource=${source}`);
        expect(converted.tier).toBe(CandidateTier.Source);
        expect(converted.p2p).toBe(false);
        // the signature metadata is carried over
        expect(converted.family).toBe(candidates[0].family);
        expect(converted.deadline).toBe(candidates[0].deadline);
    });

    it('fetches a pure-IP mcdn URL through Bilibili\'s proxy as tier Proxy', () => {
        const original = `https://113.194.35.225:4483/v1/resource?deadline=1728000000&upsig=t1`;
        const file = ingestFile(original);
        const candidates = mediaCandidates(null, file);
        expect(candidates.length).toBe(1);
        expect(candidates[0].tier).toBe(CandidateTier.P2P);

        const acceptable = noP2PPolicy(candidates);
        expect(acceptable.length).toBe(1);
        const converted = acceptable[0];
        const proxy = new URL('https://proxy-tf-all-ws.bilivideo.com');
        proxy.searchParams.set('url', original);
        expect(converted.href).toBe(proxy.href);
        expect(converted.hostname).toBe('proxy-tf-all-ws.bilivideo.com');
        expect(converted.tier).toBe(CandidateTier.Proxy);
        expect(converted.p2p).toBe(false);
        expect(converted.family).toBe(candidates[0].family);
        expect(converted.deadline).toBe(candidates[0].deadline);
    });

    it('drops a mcdn upgcxcode URL whose signature already exists on every upgcxcode host', () => {
        // a mirror-shaped host that is a known P2P domain: its signature is host-agnostic
        const file = ingestFile(`https://upos-sz-mirror14b.bilivideo.com${VIDEO_PATHNAME}?deadline=1728000000&upsig=u1&os=p2p`);
        const candidates = mediaCandidates(null, file);
        expect(candidates.some(c => c.hostname === 'upos-sz-mirror14b.bilivideo.com' && c.tier === CandidateTier.P2P)).toBe(true);

        const acceptable = noP2PPolicy(candidates);
        // the listed P2P one is dropped, but the same signed path is kept on official hosts
        expect(acceptable.every(c => c.hostname !== 'upos-sz-mirror14b.bilivideo.com')).toBe(true);
        const swapped = acceptable.find(c => c.hostname === 'upos-sz-mirror08c.bilivideo.com');
        expect(swapped).toBeDefined();
        expect(swapped!.key).toBe(`${VIDEO_PATHNAME}?deadline=1728000000&upsig=u1&os=p2p`);
        expect(swapped!.tier).toBe(CandidateTier.Mirror);
    });
});
