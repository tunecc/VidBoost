/**
 * Subtitle utility functions tests
 */

import { describe, it, expect } from 'vitest';
import {
  isCJKLanguage,
  getTextLength,
  getMaxLength,
  getTargetBounds,
} from '../subtitle-utils';

describe('SubtitleUtils', () => {
  describe('isCJKLanguage', () => {
    it('should detect Chinese language codes', () => {
      expect(isCJKLanguage('zh')).toBe(true);
      expect(isCJKLanguage('zh-CN')).toBe(true);
      expect(isCJKLanguage('zh-TW')).toBe(true);
      expect(isCJKLanguage('zh-HK')).toBe(true);
      expect(isCJKLanguage('zh-SG')).toBe(true);
    });

    it('should detect Japanese language codes', () => {
      expect(isCJKLanguage('ja')).toBe(true);
      expect(isCJKLanguage('ja-JP')).toBe(true);
    });

    it('should detect Korean language codes', () => {
      expect(isCJKLanguage('ko')).toBe(true);
      expect(isCJKLanguage('ko-KR')).toBe(true);
    });

    it('should return false for non-CJK languages', () => {
      expect(isCJKLanguage('en')).toBe(false);
      expect(isCJKLanguage('en-US')).toBe(false);
      expect(isCJKLanguage('es')).toBe(false);
      expect(isCJKLanguage('fr')).toBe(false);
      expect(isCJKLanguage('de')).toBe(false);
      expect(isCJKLanguage('ru')).toBe(false);
    });

    it('should handle case-insensitive language codes', () => {
      expect(isCJKLanguage('ZH-CN')).toBe(true);
      expect(isCJKLanguage('JA-JP')).toBe(true);
      expect(isCJKLanguage('KO-KR')).toBe(true);
    });

    it('should handle empty or invalid input', () => {
      expect(isCJKLanguage('')).toBe(false);
      expect(isCJKLanguage('invalid')).toBe(false);
    });
  });

  describe('getTextLength', () => {
    it('should count words for non-CJK text', () => {
      expect(getTextLength('Hello world', false)).toBe(2);
      expect(getTextLength('This is a test', false)).toBe(4);
      expect(getTextLength('One', false)).toBe(1);
    });

    it('should count characters for CJK text (excluding spaces)', () => {
      expect(getTextLength('你好世界', true)).toBe(4);
      expect(getTextLength('こんにちは', true)).toBe(5);
      expect(getTextLength('안녕하세요', true)).toBe(5);
    });

    it('should handle text with multiple spaces', () => {
      expect(getTextLength('Hello    world', false)).toBe(2);
      expect(getTextLength('One  two   three', false)).toBe(3);
    });

    it('should handle empty text', () => {
      expect(getTextLength('', false)).toBe(0);
      expect(getTextLength('', true)).toBe(0);
    });

    it('should handle whitespace-only text', () => {
      expect(getTextLength('   ', false)).toBe(0);
      expect(getTextLength('   ', true)).toBe(0);
    });

    it('should handle CJK text with spaces', () => {
      expect(getTextLength('你好 世界', true)).toBe(4); // Spaces ignored
    });
  });

  describe('getMaxLength', () => {
    it('should return correct max length for CJK', () => {
      expect(getMaxLength(true)).toBe(50);
    });

    it('should return correct max length for non-CJK', () => {
      expect(getMaxLength(false)).toBe(42);
    });
  });

  describe('getTargetBounds', () => {
    it('should return correct bounds for CJK', () => {
      const bounds = getTargetBounds(true);
      expect(bounds.min).toBe(15);
      expect(bounds.max).toBe(25);
    });

    it('should return correct bounds for non-CJK', () => {
      const bounds = getTargetBounds(false);
      expect(bounds.min).toBe(11);
      expect(bounds.max).toBe(20);
    });
  });
});
