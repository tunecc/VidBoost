import { describe, expect, it } from 'vitest';
import {
    areTargetLanguagesCompatible,
    canonicalizeLanguageCode
} from '../language';

describe('subtitle target language matching', () => {
    it('canonicalizes valid BCP-47 values and trims invalid values safely', () => {
        expect(canonicalizeLanguageCode(' zh-cn ')).toBe('zh-CN');
        expect(canonicalizeLanguageCode('EN-us')).toBe('en-US');
        expect(canonicalizeLanguageCode('')).toBe('');
    });

    it('matches generic and regional variants without conflating two regions', () => {
        expect(areTargetLanguagesCompatible('en', 'en-US')).toBe(true);
        expect(areTargetLanguagesCompatible('en-US', 'en')).toBe(true);
        expect(areTargetLanguagesCompatible('en-US', 'en-GB')).toBe(false);
    });

    it('matches equivalent Chinese script and region groups', () => {
        expect(areTargetLanguagesCompatible('zh-CN', 'zh-Hans')).toBe(true);
        expect(areTargetLanguagesCompatible('zh-TW', 'zh-Hant')).toBe(true);
    });

    it('never conflates Simplified and Traditional Chinese', () => {
        expect(areTargetLanguagesCompatible('zh-Hans', 'zh-Hant')).toBe(false);
        expect(areTargetLanguagesCompatible('zh-CN', 'zh-TW')).toBe(false);
        expect(areTargetLanguagesCompatible('zh', 'zh-Hans')).toBe(false);
    });
});
