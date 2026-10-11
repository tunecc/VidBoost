import { describe, expect, it } from 'vitest';
import {
    classifyCdnUrl,
    hostRegion,
    isAkamaiHost,
    isKnownNonVideoUrl,
    isMirrorHost,
    isP2PCDNDomain,
    signatureDeadlineOf,
    signatureFamilyOf
} from '../player/cdnClassify';

function classify(url: string) {
    return classifyCdnUrl(new URL(url));
}

describe('threadRipper CDN classification', () => {
    it('classifies upos mirrors with an upgcxcode path as mirror', () => {
        expect(classify('https://upos-sz-mirrorali.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?e=ig&uipk=5&upsig=abc&deadline=1728000000')).toBe('mirror');
        expect(classify('https://upos-sz-mirror0814.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc')).toBe('mirror');
        expect(isMirrorHost('upos-sz-mirrorali.bilivideo.com')).toBe(true);
        expect(isMirrorHost('cn-sccd-cu-01-01.bilivideo.com')).toBe(false);
    });

    it('classifies Bilibili self-hosted PoP hosts as bcache', () => {
        expect(classify('https://cn-sccd-cu-01-01.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc')).toBe('bcache');
        expect(classify('https://ct-xymirrorkodo01.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc')).toBe('bcache');
    });

    it('treats mountaintoys PCDN edges as P2P hosts (upstream predates this delivery form)', () => {
        // bilibili now serves P2P delivery from *.edge.mountaintoys.cn; upstream's P2P domain
        // list predates it, so these edges were misclassified as plain bcache and no-p2p
        // passed their traffic straight through.
        expect(isP2PCDNDomain('29e749o.edge.mountaintoys.cn')).toBe(true);
        expect(isP2PCDNDomain('b-baaa93cg2y85fbm6d2wwavz6ydx6f.edge.mountaintoys.cn')).toBe(true);
        expect(isP2PCDNDomain('upos-sz-mirrorali.bilivideo.com')).toBe(false);
        expect(classify('https://29e749o.edge.mountaintoys.cn/upgcxcode/99/91/137649199/137649199_da2-1-100026.m4s?upsig=abc&os=mcdn'))
            .toBe('mcdn-upgcxcode');
    });

    it('classifies P2P CDNs serving an upgcxcode path as mcdn-upgcxcode', () => {
        expect(classify('https://xxx.mcdn.bilivideo.com:4483/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc')).toBe('mcdn-upgcxcode');
        // a mirror URL re-signed with os=mcdn
        expect(classify('https://upos-sz-mirrorcoso1.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?os=mcdn&upsig=abc')).toBe('mcdn-upgcxcode');
        // HTTP 302 P2P CDN: *-*302*.*
        expect(classify('https://upos-sz-302ppio.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc')).toBe('mcdn-upgcxcode');
        expect(isP2PCDNDomain('xxx.mcdn.bilivideo.com')).toBe(true);
        expect(isP2PCDNDomain('upos-sz-mirrorali.bilivideo.com')).toBe(false);
    });

    it('classifies pure-IP and mcdn hosts with their own resource path as mcdn-tf', () => {
        expect(classify('https://113.194.35.225:4483/v1/resource?os=112&upsig=abc')).toBe('mcdn-tf');
        expect(classify('https://xxx.mcdn.bilivideo.com:4483/v1/resource?os=112&upsig=abc')).toBe('mcdn-tf');
        expect(classify('https://113.194.35.225:4483/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc')).toBe('bcache');
    });

    it('classifies the deprecated szbdyd PCDN as szbdyd', () => {
        expect(classify('https://xy233xy60.szbdyd.com/v1/resource?xy_usource=upos-sz-mirror0814.bilivideo.com')).toBe('szbdyd');
        expect(isP2PCDNDomain('xy233xy60.szbdyd.com')).toBe(true);
    });

    it('classifies the Akamai mirror family as mirror with an akam signature', () => {
        const url = new URL('https://upos-hz-mirrorakam.akamaized.net/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?hdnts=exp=9999999999~acl=/upgcxcode/*~hmac=abc&deadline=1728000000&upsig=abc');
        expect(classifyCdnUrl(url)).toBe('mirror');
        expect(isAkamaiHost(url.hostname)).toBe(true);
        expect(isMirrorHost(url.hostname)).toBe(true);
        expect(signatureFamilyOf(url)).toBe('akam');
        // the token expiry is the deadline, if it comes before the `deadline` parameter
        expect(signatureDeadlineOf(url)).toBe(1728000000);
        const laterDeadline = new URL('https://upos-hz-mirrorakam.akamaized.net/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?hdnts=exp=9999999999~acl=/upgcxcode/*~hmac=abc&deadline=1999999999&upsig=abc');
        expect(signatureDeadlineOf(laterDeadline)).toBe(1999999999);
    });

    it('treats upos signatures as the upos family and unknown hosts as unknown', () => {
        const url = new URL('https://upos-sz-mirrorali.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc&deadline=1728000000');
        expect(signatureFamilyOf(url)).toBe('upos');
        expect(signatureDeadlineOf(url)).toBe(1728000000);
        expect(signatureDeadlineOf(new URL('https://upos-sz-mirrorali.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s'))).toBe(0);

        expect(classify('https://api.bilibili.com/x/player/wbi/playurl')).toBe('unknown');
        expect(classify('https://example.com/some/other/path')).toBe('unknown');
    });

    it('recognizes known non-video URLs', () => {
        expect(isKnownNonVideoUrl('https://api.bilibili.com/x/player/wbi/playurl')).toBe(true);
        expect(isKnownNonVideoUrl('https://i0.hdslb.com/bfs/avatar.jpg')).toBe(true);
        expect(isKnownNonVideoUrl('data:video/mp4;base64,AAAA')).toBe(true);
        expect(isKnownNonVideoUrl('blob:https://www.bilibili.com/1234')).toBe(true);
        expect(isKnownNonVideoUrl('https://upos-sz-mirrorali.bilivideo.com/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s?upsig=abc')).toBe(false);
        expect(isKnownNonVideoUrl(new URL('https://www.bilibili.com/video/BV1xx'))).toBe(true);
    });
});

describe('hostRegion', () => {
    it('classifies delivery regions per the upstream BTR convention (Hong Kong = overseas)', () => {
        expect(hostRegion('upos-sz-mirrorali.bilivideo.com')).toBe('mainland');
        expect(hostRegion('upos-sz-mirrorcos.bilivideo.com')).toBe('mainland');
        expect(hostRegion('upos-sz-mirror08c.bilivideo.com')).toBe('mainland');
        expect(hostRegion('upos-sz-estgoss.bilivideo.com')).toBe('mainland');
        expect(hostRegion('upos-sz-mirrorcoso1.bilivideo.com')).toBe('mainland'); // `o1` 结尾非 `ov`
        expect(hostRegion('upos-sz-mirrorcosb.bilivideo.com')).toBe('mainland');
        expect(hostRegion('upos-sz-mirrorcosov.bilivideo.com')).toBe('overseas');
        expect(hostRegion('upos-sz-mirroraliov.bilivideo.com')).toBe('overseas');
        expect(hostRegion('cn-hk-eq-01-01.bilivideo.com')).toBe('overseas');
        expect(hostRegion('cn-hk-eq-01-03.bilivideo.com')).toBe('overseas');
        expect(hostRegion('upos-hz-mirrorakam.akamaized.net')).toBe('overseas');
    });
});
