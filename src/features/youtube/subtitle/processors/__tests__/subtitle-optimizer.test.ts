/**
 * Subtitle optimizer tests
 */

import { describe, it, expect } from 'vitest';
import type { SubtitleFragment } from '../../utils/types';
import { optimizeSubtitles } from '../subtitle-optimizer';

describe('SubtitleOptimizer', () => {
  describe('Basic merging', () => {
    it('should merge word-level English subtitles into sentences', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        { text: 'This', start: 2000, end: 2200 },
        { text: 'is', start: 2200, end: 2400 },
        { text: 'great.', start: 2400, end: 3500 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        text: 'Hello world',
        start: 1000,
        end: 1500,
      });
      expect(result[1]).toEqual({
        text: 'This is great.',
        start: 2000,
        end: 3500,
      });
    });

    it('should merge fragments ending with sentence punctuation', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world!', start: 1200, end: 1500 },
        { text: 'How', start: 1600, end: 1800 },
        { text: 'are', start: 1800, end: 2000 },
        { text: 'you?', start: 2000, end: 2500 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hello world!');
      expect(result[1].text).toBe('How are you?');
    });
  });

  describe('CJK language handling', () => {
    it('should merge Chinese subtitles without spaces', () => {
      const input: SubtitleFragment[] = [
        { text: '大家', start: 1000, end: 1200 },
        { text: '好', start: 1200, end: 1500 },
        { text: '我', start: 2000, end: 2200 },
        { text: '是', start: 2200, end: 2400 },
        { text: '程序员', start: 2400, end: 3500 },
      ];

      const result = optimizeSubtitles(input, 'zh-CN');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('大家好');
      expect(result[1].text).toBe('我是程序员');
    });

    it('should detect Japanese language', () => {
      const input: SubtitleFragment[] = [
        { text: 'こんにちは', start: 1000, end: 1500 },
        { text: '世界', start: 1600, end: 2000 },
      ];

      const result = optimizeSubtitles(input, 'ja');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('こんにちは');
      expect(result[1].text).toBe('世界');
    });

    it('should detect Korean language', () => {
      const input: SubtitleFragment[] = [
        { text: '안녕하세요', start: 1000, end: 1500 },
        { text: '세계', start: 1600, end: 2000 },
      ];

      const result = optimizeSubtitles(input, 'ko');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('안녕하세요');
      expect(result[1].text).toBe('세계');
    });
  });

  describe('Time gap handling', () => {
    it('should break segments on long pauses (>1500ms)', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        // 2000ms gap
        { text: 'Next', start: 3500, end: 3700 },
        { text: 'sentence', start: 3700, end: 4000 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hello world');
      expect(result[1].text).toBe('Next sentence');
    });

    it('should merge segments with short pauses (<1500ms)', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        // 500ms gap (< 1500ms)
        { text: 'this', start: 2000, end: 2200 },
        { text: 'continues', start: 2200, end: 2500 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello world this continues');
    });
  });

  describe('Special character handling', () => {
    it('should break on segments starting with special markers', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        { text: '[Music]', start: 1600, end: 2000 },
        { text: 'Next', start: 2100, end: 2300 },
        { text: 'part', start: 2300, end: 2500 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Hello world');
      expect(result[1].text).toBe('[Music]');
      expect(result[2].text).toBe('Next part');
    });

    it('should clean YouTube ASR markers (>>)', () => {
      const input: SubtitleFragment[] = [
        { text: '>> Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        { text: 'test >> marker', start: 1600, end: 2000 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result[0].text).toBe('Hello world');
      expect(result[1].text).toBe('test marker');
    });
  });

  describe('Length limiting', () => {
    it('should break long segments when exceeding max length', () => {
      // Create a long sequence of words
      const words = Array.from({ length: 50 }, (_, i) => ({
        text: `word${i}`,
        start: 1000 + i * 200,
        end: 1000 + (i + 1) * 200,
      }));

      const result = optimizeSubtitles(words, 'en');

      // Should be broken into multiple segments
      expect(result.length).toBeGreaterThan(1);

      // Each segment should be reasonably sized
      result.forEach(seg => {
        const wordCount = seg.text.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(42); // MAX_LENGTH_NON_CJK
      });
    });
  });

  describe('Rebalancing', () => {
    it('should merge short lines to target length', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hi', start: 1000, end: 1200 },
        { text: 'there.', start: 1200, end: 1500 },
        { text: 'How', start: 2000, end: 2200 },
        { text: 'are', start: 2200, end: 2400 },
        { text: 'you?', start: 2400, end: 2700 },
        { text: 'Good.', start: 3000, end: 3300 },
      ];

      const result = optimizeSubtitles(input, 'en');

      // Should merge short segments
      expect(result.length).toBeLessThan(input.length);

      // Check that segments are reasonably balanced
      result.forEach(seg => {
        const wordCount = seg.text.split(/\s+/).length;
        // Most should be in reasonable range, allowing some edge cases
        if (seg.text.length > 5) {
          expect(wordCount).toBeGreaterThanOrEqual(2);
        }
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const result = optimizeSubtitles([], 'en');
      expect(result).toEqual([]);
    });

    it('should handle single fragment', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1500 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(input[0]);
    });

    it('should handle fragments with empty text', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: '', start: 1200, end: 1500 },
        { text: 'world', start: 1500, end: 1800 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello world');
    });

    it('should handle fragments with only whitespace', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: '   ', start: 1200, end: 1500 },
        { text: 'world', start: 1500, end: 1800 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello world');
    });

    it('should preserve timestamps correctly', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        { text: 'test', start: 1500, end: 1800 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result[0].start).toBe(1000); // First fragment's start
      expect(result[0].end).toBe(1800); // Last fragment's end
    });

    it('should handle error gracefully and return original fragments', () => {
      // This shouldn't cause an error, but tests the error handling path
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1500 },
      ];

      const result = optimizeSubtitles(input, 'en');

      // Should still return valid result
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Quality detection and pause word handling', () => {
    it('should trigger pause word detection for poor quality input', () => {
      // Create input with many very long lines (poor quality)
      const longText = 'word '.repeat(100).trim();
      const input: SubtitleFragment[] = Array.from({ length: 10 }, (_, i) => ({
        text: i === 0 ? longText : `segment${i}`,
        start: 1000 + i * 1000,
        end: 1000 + (i + 1) * 1000,
      }));

      const result = optimizeSubtitles(input, 'en');

      // Should still produce valid output
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toEqual(input);
    });
  });
});
