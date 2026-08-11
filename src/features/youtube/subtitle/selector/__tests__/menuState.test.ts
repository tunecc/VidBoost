import { describe, expect, it } from 'vitest';
import type { SubtitleMenuGroups, SubtitleOption } from '../types';
import {
    filterSubtitleMenuGroups,
    flattenSubtitleMenuGroups,
    getNextOptionIndex
} from '../menuState';

const sourceTrack = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=v1&lang=en',
    languageCode: 'en',
    vssId: 'a.en',
    kind: 'asr'
};

const options: SubtitleOption[] = [{
    kind: 'provided',
    id: 'provided:a.en:en',
    targetLanguageCode: 'en',
    label: 'English',
    searchText: 'english en',
    sourceTrack,
    sourceKind: 'asr'
}, {
    kind: 'translated',
    id: 'translated:a.en:zh-Hans',
    targetLanguageCode: 'zh-Hans',
    label: 'Chinese (Simplified)',
    searchText: 'chinese (simplified) zh-hans',
    sourceTrack,
    translationLanguageCode: 'zh-Hans'
}, {
    kind: 'translated',
    id: 'translated:a.en:ja',
    targetLanguageCode: 'ja',
    label: 'Japanese',
    searchText: 'japanese ja',
    sourceTrack,
    translationLanguageCode: 'ja'
}];

const groups: SubtitleMenuGroups = {
    provided: [options[0] as Extract<SubtitleOption, { kind: 'provided' }>],
    translated: options.slice(1) as Array<Extract<SubtitleOption, { kind: 'translated' }>>
};

describe('subtitle selector menu state', () => {
    it('filters localized labels and language codes case-insensitively', () => {
        expect(filterSubtitleMenuGroups(groups, 'zh').translated.map((item) => item.id))
            .toEqual(['translated:a.en:zh-Hans']);
        expect(filterSubtitleMenuGroups(groups, 'Chinese').translated.map((item) => item.id))
            .toEqual(['translated:a.en:zh-Hans']);
    });

    it('preserves group order when flattening visible options', () => {
        expect(flattenSubtitleMenuGroups(groups).map((item) => item.kind))
            .toEqual(['provided', 'translated', 'translated']);
    });

    it('wraps keyboard movement in both directions', () => {
        expect(getNextOptionIndex(3, 2, 1)).toBe(0);
        expect(getNextOptionIndex(3, 0, -1)).toBe(2);
        expect(getNextOptionIndex(0, -1, 1)).toBe(-1);
    });
});
