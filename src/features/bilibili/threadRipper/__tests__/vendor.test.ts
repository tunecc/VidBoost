import { describe, expect, it } from 'vitest';
import { p, p50 } from '../vendor/percentile';
import flru from '../vendor/lru';
import {
    FIFO,
    addArrayElementsToSet,
    clamp,
    createRetrieKeywordFilter,
    falseFn,
    isAbortErrorLike,
    never,
    noop,
    pickOne,
    split0th,
    wait
} from '../vendor/foxts';

describe('threadRipper vendor percentile (fast-percentile semantics)', () => {
    it('returns the nearest-rank percentile of an unsorted array', () => {
        // sorted: [2, 5, 12, 25, 37, 43, 61, 78, 84, 99], k = ceil(50 * 10 / 100) = 5 -> 37
        expect(p50([12, 5, 99, 37, 2, 84, 61, 43, 78, 25])).toBe(37);
        expect(p(50)([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(5);
        expect(p(90)([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    });

    it('p(0) is the minimum and p(100) is the maximum', () => {
        expect(p(0)([7, 3, 9])).toBe(3);
        expect(p(100)([7, 3, 9])).toBe(9);
    });

    it('does not mutate the input array', () => {
        const samples = [12, 5, 99, 37, 2];
        p50(samples);
        expect(samples).toEqual([12, 5, 99, 37, 2]);
    });

    it('throws on empty samples and on non-integer percentiles', () => {
        expect(() => p50([])).toThrow(RangeError);
        expect(() => p(50.5)([1])).toThrow(RangeError);
        expect(() => p(-1)([1])).toThrow(RangeError);
        expect(() => p(101)([1])).toThrow(RangeError);
    });
});

describe('threadRipper vendor lru (flru semantics)', () => {
    it('returns set values and overwrites existing keys', () => {
        const cache = flru<number>(400);
        cache.set('a', 1);
        expect(cache.get('a')).toBe(1);
        expect(cache.get('missing')).toBeUndefined();
        cache.set('a', 2);
        expect(cache.get('a')).toBe(2);
    });

    it('demotes the previous generation past the capacity limit', () => {
        const cache = flru<number>(1);
        cache.set('a', 1);
        cache.set('b', 2);
        expect(cache.has('a')).toBe(true); // still readable from the previous generation
        cache.set('c', 3);
        // both generations have rotated past `a`
        expect(cache.has('a')).toBe(false);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('c')).toBe(3);
    });

    it('promotes a previous-generation hit back into the current generation', () => {
        const cache = flru<number>(2);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        expect(cache.get('a')).toBe(1); // promoted from the previous generation
        expect(cache.has('a')).toBe(true);
        expect(cache.get('c')).toBe(3);
    });
});

describe('threadRipper vendor foxts', () => {
    it('clamps values into [min, max]', () => {
        expect(clamp(5, 1, 10)).toBe(5);
        expect(clamp(-3, 1, 10)).toBe(1);
        expect(clamp(42, 1, 10)).toBe(10);
        const clamp1to10 = clamp(1, 10);
        expect(clamp1to10(5)).toBe(5);
        expect(clamp1to10(0)).toBe(1);
        expect(clamp1to10(99)).toBe(10);
    });

    it('noop and falseFn behave as their names say', () => {
        expect(noop()).toBeUndefined();
        expect(noop(1, 2, 3)).toBeUndefined();
        expect(falseFn()).toBe(false);
    });

    it('FIFO dequeues in enqueue order', () => {
        const fifo = new FIFO<number>();
        expect(fifo.size).toBe(0);
        fifo.enqueue(1);
        fifo.push(2);
        fifo.enqueue(3);
        expect(fifo.size).toBe(3);
        expect(fifo.length).toBe(3);
        expect(fifo.peek()).toBe(1);
        expect([...fifo]).toEqual([1, 2, 3]);
        expect(fifo.dequeue()).toBe(1);
        expect(fifo.shift()).toBe(2);
        expect(fifo.size).toBe(1);
        fifo.clear();
        expect(fifo.size).toBe(0);
        expect(fifo.dequeue()).toBeUndefined();
        expect(fifo.peek()).toBeUndefined();
    });

    it('wait resolves no earlier than the requested delay', async () => {
        const start = Date.now();
        await wait(25);
        expect(Date.now() - start).toBeGreaterThanOrEqual(20);
    });

    it('never throws a TypeError', () => {
        expect(() => never('oops' as never)).toThrow(TypeError);
    });

    it('pickOne returns a member of the array', () => {
        const pool = [1, 2, 3, 4, 5] as const;
        for (let i = 0; i < 50; i++) {
            expect(pool).toContain(pickOne(pool));
        }
        expect(pickOne([7 as const])).toBe(7);
    });

    it('addArrayElementsToSet appends every element and returns the same set', () => {
        const set = new Set<number>([0]);
        const returned = addArrayElementsToSet(set, [1, 2, 3]);
        expect(returned).toBe(set);
        expect([...set]).toEqual([0, 1, 2, 3]);
        expect([...addArrayElementsToSet(new Set<number>(), [1, 2], (v) => v * 10)]).toEqual([10, 20]);
    });

    it('isAbortErrorLike matches real AbortError DOMExceptions', () => {
        expect(isAbortErrorLike(new DOMException('The operation was aborted.', 'AbortError'))).toBe(true);
        expect(isAbortErrorLike(new DOMException('signed out', 'SecurityError'))).toBe(false);
        expect(isAbortErrorLike(new Error('plain'))).toBe(false);
        // upstream `isErrorLikeObject` requires string `name` AND `message` fields
        expect(isAbortErrorLike({ name: 'SomethingElse', message: 'x', code: 'ABORT_ERR' })).toBe(true);
        expect(isAbortErrorLike({ name: 'AbortError', message: 'x' })).toBe(true);
        expect(isAbortErrorLike({ name: 'SomethingElse', message: 'x', code: 'OTHER' })).toBe(false);
        expect(isAbortErrorLike(null)).toBe(false);
        expect(isAbortErrorLike('AbortError')).toBe(false);
    });

    it('createRetrieKeywordFilter matches keywords with escaped dots and none otherwise', () => {
        const isKnownNonVideo = createRetrieKeywordFilter([
            'bilibili.com',
            'hdslb.com',
            'bvc.bilivideo.com',
            'bvc-drm.bilivideo.com'
        ]);
        expect(isKnownNonVideo('https://api.bilibili.com/x/player/wbi/playurl')).toBe(true);
        expect(isKnownNonVideo('https://i0.hdslb.com/bfs/avatar.jpg')).toBe(true);
        expect(isKnownNonVideo('https://xy123.szb.d.com/x')).toBe(false);
        expect(isKnownNonVideo('https://upos-sz-mirrorali.bilivideo.com/upgcxcode/x/y/video.m4s')).toBe(false);

        const neverMatches = createRetrieKeywordFilter([]);
        expect(neverMatches('anything')).toBe(false);
    });

    it('split0th returns everything before the first separator', () => {
        expect(split0th('upos-sz-mirrorali.bilivideo.com', '.')).toBe('upos-sz-mirrorali');
        expect(split0th('302kodo', '.')).toBe('302kodo');
        expect(split0th('', '.')).toBe('');
        expect(split0th('a.b.c', '.')).toBe('a');
    });
});
