import { describe, expect, it } from 'vitest';
import type { ProvidedSubtitleOption, TranslatedSubtitleOption } from '../types';
import {
    applySubtitleOptionTarget,
    buildSubtitleOptionKey,
    getSubtitleOptionLanguage,
    shouldKeepCurrentSubtitleOnFailure
} from '../request';

const sourceTrack = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=v1&lang=en',
    languageCode: 'en',
    vssId: 'a.en',
    kind: 'asr'
};

const providedEnOption: ProvidedSubtitleOption = {
    kind: 'provided',
    id: 'provided:a.en:en',
    targetLanguageCode: 'en',
    label: 'English',
    searchText: 'english en',
    sourceTrack,
    sourceKind: 'asr'
};

const translatedZhOption: TranslatedSubtitleOption = {
    kind: 'translated',
    id: 'translated:a.en:zh-Hans',
    targetLanguageCode: 'zh-Hans',
    label: 'Chinese (Simplified)',
    searchText: 'chinese (simplified) zh-hans',
    sourceTrack,
    translationLanguageCode: 'zh-Hans'
};

const translatedJaOption: TranslatedSubtitleOption = {
    ...translatedZhOption,
    id: 'translated:a.en:ja',
    targetLanguageCode: 'ja',
    label: 'Japanese',
    searchText: 'japanese ja',
    translationLanguageCode: 'ja'
};

describe('subtitle option request helpers', () => {
    it('adds tlang only for a translated option', () => {
        const translatedUrl = applySubtitleOptionTarget(
            new URL('https://www.youtube.com/api/timedtext?v=v1&lang=en'),
            translatedZhOption
        );
        const providedUrl = applySubtitleOptionTarget(
            new URL('https://www.youtube.com/api/timedtext?v=v1&lang=en&tlang=ja'),
            providedEnOption
        );
        expect(translatedUrl.searchParams.get('tlang')).toBe('zh-Hans');
        expect(providedUrl.searchParams.has('tlang')).toBe(false);
    });

    it('uses the final target language and isolates option keys', () => {
        expect(getSubtitleOptionLanguage(translatedZhOption)).toBe('zh-Hans');
        expect(buildSubtitleOptionKey('v1', translatedZhOption))
            .not.toBe(buildSubtitleOptionKey('v1', translatedJaOption));
    });

    it('keeps current fragments only for a same-video explicit selection failure', () => {
        expect(shouldKeepCurrentSubtitleOnFailure('user-selection', 'v1', 'v1', true)).toBe(true);
        expect(shouldKeepCurrentSubtitleOnFailure('sync', 'v1', 'v1', true)).toBe(false);
        expect(shouldKeepCurrentSubtitleOnFailure('user-selection', 'v1', 'v2', true)).toBe(false);
    });

    it('does not preserve stale fragments after navigation or an empty current state', () => {
        expect(shouldKeepCurrentSubtitleOnFailure('user-selection', 'video-1', 'video-2', true))
            .toBe(false);
        expect(shouldKeepCurrentSubtitleOnFailure('user-selection', 'video-1', 'video-1', false))
            .toBe(false);
    });
});
