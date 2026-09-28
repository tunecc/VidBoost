import { describe, expect, it } from 'vitest';
import {
    BILIBILI_QUALITY_OPTIONS,
    filterBilibiliBlockedQualityValues,
    normalizeBilibiliBlockedQualityValues,
    pickBilibiliQualityAtOrBelow
} from '../bilibiliQuality';

function resolve(
    available: string[],
    blocked: string[],
    desired: string | null
): string | null {
    const candidates = filterBilibiliBlockedQualityValues(available, blocked);
    return pickBilibiliQualityAtOrBelow(candidates, desired);
}

describe('pickBilibiliQualityAtOrBelow', () => {
    it('returns the desired quality when available', () => {
        expect(pickBilibiliQualityAtOrBelow(['116', '112', '80'], '116')).toBe('116');
    });

    it('falls back to the nearest quality at or below the desired one', () => {
        expect(pickBilibiliQualityAtOrBelow(['112', '80'], '116')).toBe('112');
        expect(pickBilibiliQualityAtOrBelow(['80', '64', '32'], '74')).toBe('64');
    });

    it('falls back to the highest available quality when everything is above the desired one', () => {
        expect(pickBilibiliQualityAtOrBelow(['127', '125', '120'], '116')).toBe('127');
        expect(pickBilibiliQualityAtOrBelow(['125', '120'], '116')).toBe('125');
    });

    it('returns the first listed quality when no desired value is given', () => {
        expect(pickBilibiliQualityAtOrBelow(['116', '112', '80'], null)).toBe('116');
        expect(pickBilibiliQualityAtOrBelow(['112', '80', '116'], null)).toBe('112');
    });

    it('ignores unknown values and duplicates', () => {
        expect(pickBilibiliQualityAtOrBelow(['999', '80', '80'], '80')).toBe('80');
        expect(pickBilibiliQualityAtOrBelow(['999'], '80')).toBeNull();
    });
});

describe('filterBilibiliBlockedQualityValues', () => {
    it('removes blocked values from the available list', () => {
        expect(filterBilibiliBlockedQualityValues(['116', '112', '80'], ['112']))
            .toEqual(['116', '80']);
    });

    it('returns the normalized list unchanged when nothing is blocked', () => {
        expect(filterBilibiliBlockedQualityValues(['80', '999', '80', '64'], []))
            .toEqual(['80', '64']);
        expect(filterBilibiliBlockedQualityValues(['80'], null)).toEqual(['80']);
    });

    it('ignores unknown blocked values', () => {
        expect(filterBilibiliBlockedQualityValues(['116', '80'], ['999', 'abc']))
            .toEqual(['116', '80']);
    });

    it('keeps the original list when every available value is blocked', () => {
        expect(filterBilibiliBlockedQualityValues(['112', '80'], ['80', '112']))
            .toEqual(['112', '80']);
        expect(filterBilibiliBlockedQualityValues(['112'], ['112'])).toEqual(['112']);
    });

    it('returns an empty list when there is nothing available', () => {
        expect(filterBilibiliBlockedQualityValues([], ['80'])).toEqual([]);
        expect(filterBilibiliBlockedQualityValues(['999'], ['80'])).toEqual([]);
    });
});

describe('normalizeBilibiliBlockedQualityValues', () => {
    it('keeps known quality values, trims strings and drops duplicates', () => {
        expect(normalizeBilibiliBlockedQualityValues(['112', ' 112 ', 116, '116']))
            .toEqual(['112', '116']);
    });

    it('drops unknown and malformed values', () => {
        expect(normalizeBilibiliBlockedQualityValues(['999', 'abc', null, undefined]))
            .toEqual([]);
    });

    it('returns an empty list for non-array input', () => {
        expect(normalizeBilibiliBlockedQualityValues(undefined)).toEqual([]);
        expect(normalizeBilibiliBlockedQualityValues('112')).toEqual([]);
    });
});

describe('blocked quality selection scenarios', () => {
    it('A2: prefers 1080P60 when available even with 1080P+ blocked', () => {
        expect(resolve(['116', '112', '80'], ['112'], '116')).toBe('116');
    });

    it('A3: never picks blocked 1080P+ and falls back to 1080P', () => {
        expect(resolve(['112', '80'], ['112'], '116')).toBe('80');
    });

    it('A4: resolves conflicting target to the nearest non-blocked lower tier', () => {
        expect(resolve(['112', '80'], ['112'], '112')).toBe('80');
        expect(resolve(['112', '80'], ['112'], '80')).toBe('80');
    });

    it('A5: honors multiple blocked tiers at once', () => {
        expect(resolve(['126', '112', '80'], ['112', '126'], '125')).toBe('80');
    });

    it('A6: ignores the blocklist when every available tier is blocked', () => {
        expect(resolve(['112', '80'], ['80', '112'], '116')).toBe('112');
    });

    it('A8: unchanged fallback order for the regular path', () => {
        expect(resolve(['112', '80'], [], '116')).toBe('112');
        expect(resolve(['120', '125'], [], '116')).toBe('125');
    });
});

describe('BILIBILI_QUALITY_OPTIONS', () => {
    it('exposes every tier used by the popup blocklist chips', () => {
        expect(BILIBILI_QUALITY_OPTIONS).toHaveLength(11);
        expect(BILIBILI_QUALITY_OPTIONS.map((option) => option.value)).toEqual([
            '127', '126', '125', '120', '116', '112', '80', '74', '64', '32', '16'
        ]);
    });
});
