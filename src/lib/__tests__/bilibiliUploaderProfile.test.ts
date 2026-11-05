// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.bilibili.com/video/BV1d2pF6nESA/"}
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BILIBILI_UPLOADER_DOM_WAIT_INTERVAL_MS,
    collectBilibiliUploaderSnapshotFromDocument,
    collectCurrentBilibiliUploaderSnapshot,
    extractBilibiliBvid,
    fetchBilibiliUploaderByBvid,
    isSupportedBilibiliVideoUrl,
    normalizeBilibiliTargetValue,
    resolveBilibiliUploaderSnapshot,
    waitForBilibiliUploaderSnapshot
} from '../../features/bilibili/uploaderProfile';

const NEW_LAYOUT_HTML = `
    <div class="up-info-container">
        <div class="up-avatar-wrap">
            <a class="up-avatar" href="//space.bilibili.com/596842980/?spm_id_from=333.788.upinfo.head.click">
                <img alt="南翔" />
            </a>
        </div>
        <div class="up-detail-top">
            <a class="up-name vip" href="//space.bilibili.com/596842980/?spm_id_from=333.788.upinfo.detail.click">南翔</a>
        </div>
    </div>
`;

const LEGACY_LAYOUT_HTML = `
    <div id="v_upinfo">
        <a href="https://space.bilibili.com/14804670/">无穷小亮的科普日常</a>
    </div>
`;

function withBody(html: string): Document {
    const doc = document.implementation.createHTMLDocument('bilibili');
    doc.body.innerHTML = html;
    return doc;
}

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('collectBilibiliUploaderSnapshotFromDocument', () => {
    it('identifies the uploader from the current video page layout', () => {
        const snapshot = collectBilibiliUploaderSnapshotFromDocument(withBody(NEW_LAYOUT_HTML));

        expect(snapshot.profile?.uid).toBe('596842980');
        expect(snapshot.profile?.name).toBe('南翔');
        expect(snapshot.profile?.profileUrl).toContain('space.bilibili.com/596842980');
        expect(snapshot.targets).toEqual(expect.arrayContaining(['596842980', '南翔']));
    });

    it('identifies the uploader from the legacy upinfo layout', () => {
        const snapshot = collectBilibiliUploaderSnapshotFromDocument(withBody(LEGACY_LAYOUT_HTML));

        expect(snapshot.profile?.uid).toBe('14804670');
        expect(snapshot.profile?.name).toBe('无穷小亮的科普日常');
    });

    it('ignores uploaders from recommendation cards', () => {
        const snapshot = collectBilibiliUploaderSnapshotFromDocument(withBody(`
            ${NEW_LAYOUT_HTML}
            <div class="video-page-card-small">
                <a href="//space.bilibili.com/383819124/">波特可乐z</a>
            </div>
        `));

        expect(snapshot.profile?.uid).toBe('596842980');
        expect(snapshot.targets).not.toContain('383819124');
    });

    it('keeps the live document snapshot available for the quality feature', () => {
        document.body.innerHTML = NEW_LAYOUT_HTML;

        expect(collectCurrentBilibiliUploaderSnapshot().profile?.uid).toBe('596842980');
    });
});

describe('target normalization', () => {
    it('normalizes protocol-relative, query-suffixed and bare UID inputs', () => {
        expect(normalizeBilibiliTargetValue('//space.bilibili.com/596842980/?spm_id_from=333.788.upinfo.head.click'))
            .toBe('596842980');
        expect(normalizeBilibiliTargetValue('https://space.bilibili.com/596842980/')).toBe('596842980');
        expect(normalizeBilibiliTargetValue('596842980')).toBe('596842980');
    });

    it('normalizes nickname inputs and keeps notes out of the comparison', () => {
        expect(normalizeBilibiliTargetValue('@南翔')).toBe('南翔');
        expect(normalizeBilibiliTargetValue('596842980 | 南翔的备注')).toBe('596842980');
    });
});

describe('BVID and page checks', () => {
    it('extracts the BVID from video URLs with query parameters', () => {
        expect(extractBilibiliBvid('https://www.bilibili.com/video/BV1d2pF6nESA/?spm_id_from=333.788'))
            .toBe('BV1d2pF6nESA');
        expect(extractBilibiliBvid('https://www.bilibili.com/bangumi/play/ep847618')).toBeNull();
        expect(extractBilibiliBvid('')).toBeNull();
    });

    it('accepts only supported bilibili video pages', () => {
        expect(isSupportedBilibiliVideoUrl('https://www.bilibili.com/video/BV1d2pF6nESA/')).toBe(true);
        expect(isSupportedBilibiliVideoUrl('https://www.bilibili.com/')).toBe(false);
        expect(isSupportedBilibiliVideoUrl('https://example.com/video/BV1d2pF6nESA/')).toBe(false);
    });
});

describe('waitForBilibiliUploaderSnapshot', () => {
    it('returns as soon as the uploader DOM appears inside the wait window', async () => {
        const doc = withBody('<div class="player"></div>');
        let clock = 0;

        const snapshot = await waitForBilibiliUploaderSnapshot({
            doc,
            now: () => clock,
            sleep: async (ms) => {
                clock += ms;
                if (clock >= BILIBILI_UPLOADER_DOM_WAIT_INTERVAL_MS) {
                    doc.body.innerHTML = NEW_LAYOUT_HTML;
                }
            }
        });

        expect(snapshot.profile?.uid).toBe('596842980');
        expect(snapshot.profile?.name).toBe('南翔');
    });

    it('gives up after the wait window without poisoning anything', async () => {
        const doc = withBody('<div class="player"></div>');
        let clock = 0;

        const snapshot = await waitForBilibiliUploaderSnapshot({
            doc,
            now: () => clock,
            sleep: async (ms) => {
                clock += ms;
            },
            waitTimeoutMs: 600,
            waitIntervalMs: 150
        });

        expect(snapshot.profile).toBeNull();
        expect(snapshot.targets).toEqual([]);
    });
});

describe('resolveBilibiliUploaderSnapshot', () => {
    it('falls back to the public view API when the DOM has no uploader', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: 0, data: { owner: { mid: 596842980, name: '南翔' } } })
        });

        const result = await resolveBilibiliUploaderSnapshot({
            doc: withBody('<div class="player"></div>'),
            href: 'https://www.bilibili.com/video/BV1d2pF6nESA/',
            waitTimeoutMs: 0,
            fetchImpl
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.bilibili.com/x/web-interface/view?bvid=BV1d2pF6nESA',
            expect.objectContaining({ credentials: 'include' })
        );
        expect(result.profile).toEqual({
            uid: '596842980',
            name: '南翔',
            profileUrl: 'https://space.bilibili.com/596842980'
        });
        expect(result.targets).toEqual(expect.arrayContaining(['596842980', '南翔']));
        expect(result.reason).toBeUndefined();
    });

    it('fills the missing uid from the API when the DOM only knows the name', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ code: 0, data: { owner: { mid: 596842980, name: '南翔' } } })
        });

        const result = await resolveBilibiliUploaderSnapshot({
            doc: withBody('<div class="up-detail-top"><a class="up-name">南翔</a></div>'),
            href: 'https://www.bilibili.com/video/BV1d2pF6nESA/',
            waitTimeoutMs: 0,
            fetchImpl
        });

        expect(result.profile?.uid).toBe('596842980');
        expect(result.profile?.name).toBe('南翔');
    });

    it('returns not-ready when both the DOM and the API fail', async () => {
        const result = await resolveBilibiliUploaderSnapshot({
            doc: withBody('<div class="player"></div>'),
            href: 'https://www.bilibili.com/video/BV1d2pF6nESA/',
            waitTimeoutMs: 0,
            fetchImpl: vi.fn().mockRejectedValue(new Error('offline'))
        });

        expect(result.profile).toBeNull();
        expect(result.reason).toBe('not-ready');
    });

    it('returns unsupported-page without touching the network', async () => {
        const fetchImpl = vi.fn();

        const result = await resolveBilibiliUploaderSnapshot({
            doc: withBody(NEW_LAYOUT_HTML),
            href: 'https://www.bilibili.com/',
            fetchImpl
        });

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.reason).toBe('unsupported-page');
    });

    it('uses the short wait window on pages without a BV id', async () => {
        let clock = 0;
        const fetchImpl = vi.fn();

        const result = await resolveBilibiliUploaderSnapshot({
            doc: withBody('<div class="player"></div>'),
            href: 'https://www.bilibili.com/bangumi/play/ss33378',
            now: () => clock,
            sleep: async (ms) => {
                clock += ms;
            },
            fetchImpl
        });

        expect(clock).toBeLessThanOrEqual(450);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.reason).toBe('not-ready');
    });

    it('uses the longer wait window on video pages before falling back', async () => {
        let clock = 0;
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));

        await resolveBilibiliUploaderSnapshot({
            doc: withBody('<div class="player"></div>'),
            href: 'https://www.bilibili.com/video/BV1d2pF6nESA/',
            now: () => clock,
            sleep: async (ms) => {
                clock += ms;
            },
            fetchImpl
        });

        expect(clock).toBeGreaterThanOrEqual(900);
        expect(clock).toBeLessThanOrEqual(1100);
    });

    it('does not call the API when the fallback is disabled for this page key', async () => {
        const fetchImpl = vi.fn();
        const result = await resolveBilibiliUploaderSnapshot({
            doc: withBody('<div class="player"></div>'),
            href: 'https://www.bilibili.com/video/BV1d2pF6nESA/',
            waitTimeoutMs: 0,
            allowApiFallback: false,
            fetchImpl
        });

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(result.reason).toBe('not-ready');
    });
});

describe('fetchBilibiliUploaderByBvid', () => {
    it('treats non-zero API codes as no result', async () => {
        const profile = await fetchBilibiliUploaderByBvid('BV1d2pF6nESA', {
            fetchImpl: vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ code: -404, data: null })
            })
        });

        expect(profile).toBeNull();
    });
});
