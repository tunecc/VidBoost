import { describe, expect, it, vi } from 'vitest';
import {
    BB_UPLOADER_RETRY_DELAYS_MS,
    hasBilibiliUploaderInfo,
    lookupBilibiliUploader
} from '../bilibiliUploaderLookup';

describe('lookupBilibiliUploader', () => {
    it('retries until the content script resolves the uploader', async () => {
        const sendMessage = vi
            .fn()
            .mockResolvedValueOnce({ uploader: null, reason: 'not-ready' })
            .mockResolvedValueOnce({ uploader: null, reason: 'not-ready' })
            .mockResolvedValueOnce({ uploader: { uid: '596842980', name: '南翔' } });
        const sleep = vi.fn().mockResolvedValue(undefined);

        const result = await lookupBilibiliUploader(sendMessage, { sleep });

        expect(result.uploader).toEqual({ uid: '596842980', name: '南翔' });
        expect(sendMessage).toHaveBeenCalledTimes(3);
        expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
            BB_UPLOADER_RETRY_DELAYS_MS[0],
            BB_UPLOADER_RETRY_DELAYS_MS[1]
        ]);
    });

    it('stops immediately when the page is not a Bilibili video page', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ uploader: null, reason: 'unsupported-page' });
        const sleep = vi.fn().mockResolvedValue(undefined);

        const result = await lookupBilibiliUploader(sendMessage, { sleep });

        expect(result).toEqual({ uploader: null, reason: 'unsupported-page' });
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('returns not-ready after the retry budget is exhausted', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ uploader: null, reason: 'not-ready' });
        const sleep = vi.fn().mockResolvedValue(undefined);

        const result = await lookupBilibiliUploader(sendMessage, { sleep });

        expect(result).toEqual({ uploader: null, reason: 'not-ready' });
        expect(sendMessage).toHaveBeenCalledTimes(BB_UPLOADER_RETRY_DELAYS_MS.length + 1);
        expect(sleep).toHaveBeenCalledTimes(BB_UPLOADER_RETRY_DELAYS_MS.length);
    });

    it('treats a failed message as retryable', async () => {
        const sendMessage = vi
            .fn()
            .mockRejectedValueOnce(new Error('Receiving end does not exist'))
            .mockResolvedValueOnce({ uploader: { name: '南翔' } });
        const sleep = vi.fn().mockResolvedValue(undefined);

        const result = await lookupBilibiliUploader(sendMessage, { sleep });

        expect(result.uploader).toEqual({ name: '南翔' });
        expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    it('stops retrying once a single call consumes the content-side budget', async () => {
        let clock = 0;
        const sendMessage = vi.fn().mockImplementation(async () => {
            clock += 1200;
            return { uploader: null, reason: 'not-ready' };
        });
        const sleep = vi.fn().mockImplementation(async (ms: number) => {
            clock += ms;
        });

        const result = await lookupBilibiliUploader(sendMessage, { now: () => clock, sleep });

        expect(result).toEqual({ uploader: null, reason: 'not-ready' });
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('stops retrying when the total budget is reached', async () => {
        let clock = 0;
        const sendMessage = vi.fn().mockImplementation(async () => {
            clock += 600;
            return { uploader: null, reason: 'not-ready' };
        });
        const sleep = vi.fn().mockImplementation(async (ms: number) => {
            clock += ms;
        });

        const result = await lookupBilibiliUploader(sendMessage, {
            now: () => clock,
            sleep,
            totalBudgetMs: 1000
        });

        expect(result).toEqual({ uploader: null, reason: 'not-ready' });
        expect(sendMessage).toHaveBeenCalledTimes(2);
    });
});

describe('hasBilibiliUploaderInfo', () => {
    it('accepts any partial uploader identity', () => {
        expect(hasBilibiliUploaderInfo({ uid: '1' })).toBe(true);
        expect(hasBilibiliUploaderInfo({ name: '南翔' })).toBe(true);
        expect(hasBilibiliUploaderInfo({ profileUrl: 'https://space.bilibili.com/1' })).toBe(true);
        expect(hasBilibiliUploaderInfo({})).toBe(false);
        expect(hasBilibiliUploaderInfo(null)).toBe(false);
    });
});
