import { describe, expect, it } from 'vitest';
import { findFile, ingestPlayinfo, noteHost, toMediaAddress, upgcxcodeHosts } from '../player/registry';

const VIDEO_PATHNAME = '/upgcxcode/21/07/268854021/Bd1/Bd1-1-30080.m4s';
const AUDIO_PATHNAME = '/upgcxcode/21/07/268854021/Bd1/Bd1-1-30280.m4s';

const videoPlayinfo = {
    code: 0,
    data: {
        dash: {
            video: [{
                id: 80,
                baseUrl: `https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}?deadline=1728000000&upsig=v1&os=aliob`,
                backupUrl: [`https://upos-sz-mirror0814.bilivideo.com${VIDEO_PATHNAME}?deadline=1728000000&upsig=v2&os=0814`],
                bandwidth: 2000000,
                mimeType: 'video/mp4',
                codecs: 'avc1.640028',
                SegmentBase: { Initialization: '0-1011', indexRange: '1012-1500' }
            }],
            audio: [{
                id: 30280,
                baseUrl: `https://upos-sz-mirrorali.bilivideo.com${AUDIO_PATHNAME}?deadline=1728000000&upsig=a1&os=aliob`,
                bandwidth: 320000,
                mimeType: 'audio/mp4',
                codecs: 'mp4a.40.2',
                SegmentBase: { Initialization: '0-906', indexRange: '907-1200' }
            }]
        }
    }
};

describe('threadRipper playinfo registry', () => {
    it('ingests a normal DASH playinfo into video and audio MediaFiles', () => {
        const files = ingestPlayinfo(videoPlayinfo, 'normal playinfo');
        expect(files).not.toBeNull();
        expect(files!.length).toBe(2);

        const [video, audio] = files!;
        expect(video.kind).toBe('video');
        expect(video.codecs).toBe('avc1.640028');
        expect(video.mimeType).toBe('video/mp4');
        expect(video.bandwidth).toBe(2000000);
        expect(video.segmentBase).toEqual({
            init: { start: 0, end: 1011 },
            index: { start: 1012, end: 1500 }
        });
        expect(video.addresses.length).toBe(2);
        expect(video.addresses[0].href).toBe(`https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}?deadline=1728000000&upsig=v1&os=aliob`);
        expect(video.addresses[0].hostname).toBe('upos-sz-mirrorali.bilivideo.com');
        expect(video.addresses[0].pathname).toBe(VIDEO_PATHNAME);
        expect(video.addresses[0].key).toBe(`${VIDEO_PATHNAME}?deadline=1728000000&upsig=v1&os=aliob`);
        expect(video.addresses[0].class).toBe('mirror');
        expect(video.addresses[0].family).toBe('upos');
        expect(video.addresses[0].deadline).toBe(1728000000);
        expect(video.addresses[1].hostname).toBe('upos-sz-mirror0814.bilivideo.com');
        expect(video.key).toMatch(/^file-\d+$/);
        expect(video.videoKey).toMatch(/^video-\d+$/);
        // every representation of one playinfo shares the videoKey
        expect(audio.kind).toBe('audio');
        expect(audio.codecs).toBe('mp4a.40.2');
        expect(audio.addresses.length).toBe(1);
        expect(audio.videoKey).toBe(video.videoKey);
    });

    it('collects mirror and bcache hosts into upgcxcodeHosts', () => {
        ingestPlayinfo(videoPlayinfo, 'host collection');
        expect(upgcxcodeHosts.has('upos-sz-mirrorali.bilivideo.com')).toBe(true);
        expect(upgcxcodeHosts.has('upos-sz-mirror0814.bilivideo.com')).toBe(true);

        noteHost(toMediaAddress(new URL(`https://cn-sccd-cu-01-01.bilivideo.com${VIDEO_PATHNAME}?upsig=abc`)));
        expect(upgcxcodeHosts.has('cn-sccd-cu-01-01.bilivideo.com')).toBe(true);

        // non-mirror/bcache classes are not collected
        const mcdnTf = toMediaAddress(new URL('https://113.194.35.225:4483/v1/resource?upsig=abc'));
        expect(mcdnTf.class).toBe('mcdn-tf');
        noteHost(mcdnTf);
        expect(upgcxcodeHosts.has('113.194.35.225')).toBe(false);
    });

    it('reuses the file and video keys when the same pathnames are ingested again', () => {
        const first = ingestPlayinfo(videoPlayinfo, 'first ingest')!;
        const reSignedPlayinfo = {
            code: 0,
            data: {
                dash: {
                    video: [{
                        ...videoPlayinfo.data.dash.video[0],
                        baseUrl: `https://upos-sz-mirrorali.bilivideo.com${VIDEO_PATHNAME}?deadline=1728900000&upsig=fresh&os=aliob`
                    }],
                    audio: [{
                        ...videoPlayinfo.data.dash.audio[0],
                        baseUrl: `https://upos-sz-mirrorali.bilivideo.com${AUDIO_PATHNAME}?deadline=1728900000&upsig=fresh&os=aliob`
                    }]
                }
            }
        };
        const second = ingestPlayinfo(reSignedPlayinfo, 're-signed ingest')!;

        expect(second[0].key).toBe(first[0].key);
        expect(second[0].videoKey).toBe(first[0].videoKey);
        expect(second[1].key).toBe(first[1].key);
        // the addresses themselves are the fresher ones
        expect(second[0].addresses[0].key).not.toBe(first[0].addresses[0].key);
        expect(second[0].addresses[0].deadline).toBe(1728900000);
    });

    it('ingests the bangumi result.video_info.dash shape', () => {
        const files = ingestPlayinfo({
            code: 0,
            result: {
                video_info: {
                    dash: {
                        video: [{
                            baseUrl: `https://upos-sz-mirrorali.bilivideo.com/upgcxcode/33/09/999999999/Ep1/Ep1-1-30080.m4s?deadline=1728000000&upsig=epv`,
                            bandwidth: 1500000,
                            mimeType: 'video/mp4',
                            codecs: 'hev1.1.6.L120.90',
                            SegmentBase: { Initialization: '0-951', indexRange: '952-1400' }
                        }],
                        audio: [{
                            baseUrl: `https://upos-sz-mirrorali.bilivideo.com/upgcxcode/33/09/999999999/Ep1/Ep1-1-30280.m4s?deadline=1728000000&upsig=epa`,
                            bandwidth: 320000,
                            mimeType: 'audio/mp4',
                            codecs: 'mp4a.40.2'
                        }]
                    }
                }
            }
        }, 'bangumi playinfo');
        expect(files).not.toBeNull();
        expect(files!.length).toBe(2);
        expect(files![0].kind).toBe('video');
        expect(files![0].codecs).toBe('hev1.1.6.L120.90');
        // a representation without SegmentBase has a null one
        expect(files![1].segmentBase).toBeNull();
    });

    it('ingests dolby and flac audio representations', () => {
        const files = ingestPlayinfo({
            code: 0,
            data: {
                dash: {
                    video: [{
                        baseUrl: `https://upos-sz-mirrorali.bilivideo.com/upgcxcode/44/00/111111111/V/V-1-30080.m4s?deadline=1728000000&upsig=dv`,
                        bandwidth: 2000000,
                        mimeType: 'video/mp4',
                        codecs: 'avc1.640028'
                    }],
                    audio: [],
                    dolby: {
                        audio: [{
                            baseUrl: `https://upos-sz-mirrorali.bilivideo.com/upgcxcode/44/00/111111111/A/A-1-30251.m4s?deadline=1728000000&upsig=dd`,
                            bandwidth: 768000,
                            mimeType: 'audio/mp4',
                            codecs: 'ec-3'
                        }]
                    },
                    flac: {
                        audio: {
                            baseUrl: `https://upos-sz-mirrorali.bilivideo.com/upgcxcode/44/00/111111111/A/A-1-30250.m4s?deadline=1728000000&upsig=df`,
                            bandwidth: 1200000,
                            mimeType: 'audio/mp4',
                            codecs: 'fLaC'
                        }
                    }
                }
            }
        }, 'dolby/flac playinfo');
        expect(files).not.toBeNull();
        expect(files!.length).toBe(3);
        expect(files!.filter(f => f.kind === 'audio').map(f => f.codecs)).toEqual(['ec-3', 'fLaC']);
        expect(files![0].videoKey).toBe(files![1].videoKey);
    });

    it('returns null for a JSON that is not a DASH playinfo', () => {
        expect(ingestPlayinfo({ code: -404, message: '啥都木有' }, 'error response')).toBeNull();
        expect(ingestPlayinfo({ code: 0, data: { durl: [] } }, 'legacy durl playinfo')).toBeNull();
    });

    it('finds the newest file listed for an ingested pathname', () => {
        const files = ingestPlayinfo(videoPlayinfo, 'findFile source')!;
        const address = toMediaAddress(new URL(files[0].addresses[0].href));
        const found = findFile(address);
        expect(found?.key).toBe(files[0].key);
        expect(found?.addresses.map(a => a.href)).toContain(files[0].addresses[1].href);

        const unknown = toMediaAddress(new URL(`https://upos-sz-mirrorali.bilivideo.com/upgcxcode/00/00/0/None/none.m4s?x=1`));
        expect(findFile(unknown)).toBeNull();
    });
});
