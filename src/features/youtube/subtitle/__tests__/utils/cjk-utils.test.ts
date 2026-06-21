import { describe, it, expect } from 'vitest';
import { isCJKLanguage, getTextLength, getMaxLength } from '../../utils/cjk-utils';

describe('cjk-utils', () => {
  describe('isCJKLanguage', () => {
    describe('CJK language codes', () => {
      it('should return true for zh', () => {
        expect(isCJKLanguage('zh')).toBe(true);
      });

      it('should return true for zh-CN', () => {
        expect(isCJKLanguage('zh-CN')).toBe(true);
      });

      it('should return true for zh-TW', () => {
        expect(isCJKLanguage('zh-TW')).toBe(true);
      });

      it('should return true for zh-HK', () => {
        expect(isCJKLanguage('zh-HK')).toBe(true);
      });

      it('should return true for ja', () => {
        expect(isCJKLanguage('ja')).toBe(true);
      });

      it('should return true for ja-JP', () => {
        expect(isCJKLanguage('ja-JP')).toBe(true);
      });

      it('should return true for ko', () => {
        expect(isCJKLanguage('ko')).toBe(true);
      });

      it('should return true for ko-KR', () => {
        expect(isCJKLanguage('ko-KR')).toBe(true);
      });
    });

    describe('non-CJK language codes', () => {
      it('should return false for en', () => {
        expect(isCJKLanguage('en')).toBe(false);
      });

      it('should return false for en-US', () => {
        expect(isCJKLanguage('en-US')).toBe(false);
      });

      it('should return false for fr', () => {
        expect(isCJKLanguage('fr')).toBe(false);
      });

      it('should return false for de', () => {
        expect(isCJKLanguage('de')).toBe(false);
      });

      it('should return false for es', () => {
        expect(isCJKLanguage('es')).toBe(false);
      });

      it('should return false for ru', () => {
        expect(isCJKLanguage('ru')).toBe(false);
      });

      it('should return false for ar', () => {
        expect(isCJKLanguage('ar')).toBe(false);
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase ZH', () => {
        expect(isCJKLanguage('ZH')).toBe(true);
      });

      it('should handle uppercase JA', () => {
        expect(isCJKLanguage('JA')).toBe(true);
      });

      it('should handle uppercase KO', () => {
        expect(isCJKLanguage('KO')).toBe(true);
      });

      it('should handle mixed case Zh-CN', () => {
        expect(isCJKLanguage('Zh-CN')).toBe(true);
      });

      it('should handle mixed case EN-US', () => {
        expect(isCJKLanguage('EN-US')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for undefined', () => {
        expect(isCJKLanguage(undefined)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isCJKLanguage('')).toBe(false);
      });

      it('should handle language codes that start with CJK prefix but are not CJK', () => {
        expect(isCJKLanguage('zho')).toBe(true); // starts with 'zh'
        expect(isCJKLanguage('jamaica')).toBe(true); // starts with 'ja'
        expect(isCJKLanguage('korean')).toBe(true); // starts with 'ko'
      });

      it('should return false for whitespace-only string', () => {
        expect(isCJKLanguage('   ')).toBe(false);
      });

      it('should return false for language codes containing CJK but not starting with it', () => {
        expect(isCJKLanguage('ezh')).toBe(false);
        expect(isCJKLanguage('xja')).toBe(false);
      });
    });
  });

  describe('getTextLength', () => {
    describe('CJK text length calculation', () => {
      it('should count characters for Chinese text', () => {
        const text = '你好世界';
        expect(getTextLength(text, true)).toBe(4);
      });

      it('should count characters for Japanese text', () => {
        const text = 'こんにちは世界';
        expect(getTextLength(text, true)).toBe(7);
      });

      it('should count characters for Korean text', () => {
        const text = '안녕하세요';
        expect(getTextLength(text, true)).toBe(5);
      });

      it('should count characters for mixed CJK text', () => {
        const text = '你好こんにちは안녕';
        expect(getTextLength(text, true)).toBe(10);
      });

      it('should count all characters including punctuation for CJK', () => {
        const text = '你好，世界！';
        expect(getTextLength(text, true)).toBe(6);
      });

      it('should count all characters including spaces for CJK', () => {
        const text = '你好 世界';
        expect(getTextLength(text, true)).toBe(5);
      });
    });

    describe('non-CJK text length calculation', () => {
      it('should count words for English text', () => {
        const text = 'Hello world';
        expect(getTextLength(text, false)).toBe(2);
      });

      it('should count words for multi-word English text', () => {
        const text = 'The quick brown fox jumps over the lazy dog';
        expect(getTextLength(text, false)).toBe(9);
      });

      it('should handle multiple spaces between words', () => {
        const text = 'Hello    world';
        expect(getTextLength(text, false)).toBe(2);
      });

      it('should handle leading and trailing spaces', () => {
        const text = '  Hello world  ';
        expect(getTextLength(text, false)).toBe(2);
      });

      it('should handle tabs and newlines as word separators', () => {
        const text = 'Hello\tworld\nfoo\rbar';
        expect(getTextLength(text, false)).toBe(4);
      });

      it('should count hyphenated words as one word', () => {
        const text = 'state-of-the-art technology';
        expect(getTextLength(text, false)).toBe(2);
      });
    });

    describe('edge cases', () => {
      it('should return 0 for empty string when CJK', () => {
        expect(getTextLength('', true)).toBe(0);
      });

      it('should return 0 for empty string when non-CJK', () => {
        expect(getTextLength('', false)).toBe(0);
      });

      it('should return 0 for whitespace-only string when non-CJK', () => {
        expect(getTextLength('   ', false)).toBe(0);
      });

      it('should count whitespace characters when CJK', () => {
        expect(getTextLength('   ', true)).toBe(3);
      });

      it('should handle single character CJK', () => {
        expect(getTextLength('你', true)).toBe(1);
      });

      it('should handle single word non-CJK', () => {
        expect(getTextLength('Hello', false)).toBe(1);
      });

      it('should handle mixed language text with CJK mode', () => {
        const text = 'Hello你好World';
        expect(getTextLength(text, true)).toBe(12);
      });

      it('should handle mixed language text with non-CJK mode', () => {
        const text = 'Hello 你好 World';
        expect(getTextLength(text, false)).toBe(3);
      });

      it('should handle text with only punctuation in CJK mode', () => {
        expect(getTextLength('!!!', true)).toBe(3);
      });

      it('should handle text with only punctuation in non-CJK mode', () => {
        expect(getTextLength('!!!', false)).toBe(1);
      });

      it('should handle numbers in CJK mode', () => {
        expect(getTextLength('12345', true)).toBe(5);
      });

      it('should handle numbers in non-CJK mode', () => {
        expect(getTextLength('123 456', false)).toBe(2);
      });
    });
  });

  describe('getMaxLength', () => {
    it('should return 40 for CJK languages', () => {
      expect(getMaxLength(true)).toBe(40);
    });

    it('should return 80 for non-CJK languages', () => {
      expect(getMaxLength(false)).toBe(80);
    });
  });

  describe('integration scenarios', () => {
    it('should correctly process Chinese subtitle workflow', () => {
      const languageCode = 'zh-CN';
      const text = '这是一个测试字幕文本';

      const isCJK = isCJKLanguage(languageCode);
      const length = getTextLength(text, isCJK);
      const maxLength = getMaxLength(isCJK);

      expect(isCJK).toBe(true);
      expect(length).toBe(10);
      expect(maxLength).toBe(40);
      expect(length).toBeLessThan(maxLength);
    });

    it('should correctly process Japanese subtitle workflow', () => {
      const languageCode = 'ja';
      const text = 'これはテスト字幕です';

      const isCJK = isCJKLanguage(languageCode);
      const length = getTextLength(text, isCJK);
      const maxLength = getMaxLength(isCJK);

      expect(isCJK).toBe(true);
      expect(length).toBe(11);
      expect(maxLength).toBe(40);
      expect(length).toBeLessThan(maxLength);
    });

    it('should correctly process Korean subtitle workflow', () => {
      const languageCode = 'ko-KR';
      const text = '이것은 테스트 자막입니다';

      const isCJK = isCJKLanguage(languageCode);
      const length = getTextLength(text, isCJK);
      const maxLength = getMaxLength(isCJK);

      expect(isCJK).toBe(true);
      expect(length).toBe(13);
      expect(maxLength).toBe(40);
      expect(length).toBeLessThan(maxLength);
    });

    it('should correctly process English subtitle workflow', () => {
      const languageCode = 'en-US';
      const text = 'This is a test subtitle text with multiple words';

      const isCJK = isCJKLanguage(languageCode);
      const length = getTextLength(text, isCJK);
      const maxLength = getMaxLength(isCJK);

      expect(isCJK).toBe(false);
      expect(length).toBe(9);
      expect(maxLength).toBe(80);
      expect(length).toBeLessThan(maxLength);
    });

    it('should handle edge case of undefined language code', () => {
      const languageCode = undefined;
      const text = 'Some text';

      const isCJK = isCJKLanguage(languageCode);
      const length = getTextLength(text, isCJK);
      const maxLength = getMaxLength(isCJK);

      expect(isCJK).toBe(false);
      expect(length).toBe(2);
      expect(maxLength).toBe(80);
    });

    it('should detect when text exceeds max length for CJK', () => {
      const languageCode = 'zh-CN';
      const text = '这是一个非常长的字幕文本用来测试是否超过了最大长度限制这应该会超过四十个字符的限制值以便我们可以正确处理';

      const isCJK = isCJKLanguage(languageCode);
      const length = getTextLength(text, isCJK);
      const maxLength = getMaxLength(isCJK);

      expect(isCJK).toBe(true);
      expect(length).toBeGreaterThan(maxLength);
      expect(length).toBeGreaterThan(40);
    });

    it('should detect when text exceeds max length for non-CJK', () => {
      const languageCode = 'en';
      const text = 'This is a very long subtitle text that is intended to test whether the length exceeds the maximum allowed limit which should be around eighty words for non-CJK languages so we need to make sure this text has enough words to properly test the boundary condition and verify that our length calculation is working correctly in all scenarios that might occur in real-world usage of the subtitle system';

      const isCJK = isCJKLanguage(languageCode);
      const length = getTextLength(text, isCJK);
      const maxLength = getMaxLength(isCJK);

      expect(isCJK).toBe(false);
      expect(length).toBeGreaterThan(maxLength);
      expect(length).toBeGreaterThan(80);
    });
  });
});
