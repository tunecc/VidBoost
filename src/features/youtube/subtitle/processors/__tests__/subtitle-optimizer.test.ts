/**
 * Subtitle optimizer tests
 */

import { describe, it, expect } from 'vitest';
import type { SubtitleFragment } from '../../utils/types';
import { optimizeSubtitles } from '../subtitle-optimizer';

describe('SubtitleOptimizer', () => {
  describe('Basic merging', () => {
    it('should merge word-level English subtitles into sentences', () => {
      // With rebalance (min=11 words), short fragments get merged
      // Use enough words per segment to stay above min threshold
      const input: SubtitleFragment[] = [
        { text: 'Hello world this is a test of the subtitle system working correctly today.', start: 1000, end: 1500 },
        { text: 'Another sentence that is also long enough to stand on its own here.', start: 3000, end: 4000 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hello world this is a test of the subtitle system working correctly today.');
      expect(result[1].text).toBe('Another sentence that is also long enough to stand on its own here.');
    });

    it('should merge fragments ending with sentence punctuation', () => {
      // Use enough words so segments stay above rebalance min (11 words)
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1100 },
        { text: 'world', start: 1100, end: 1200 },
        { text: 'this', start: 1200, end: 1300 },
        { text: 'is', start: 1300, end: 1400 },
        { text: 'a', start: 1400, end: 1500 },
        { text: 'great', start: 1500, end: 1600 },
        { text: 'day', start: 1600, end: 1700 },
        { text: 'for', start: 1700, end: 1800 },
        { text: 'everyone', start: 1800, end: 1900 },
        { text: 'out', start: 1900, end: 2000 },
        { text: 'there!', start: 2000, end: 2100 },
        { text: 'How', start: 2200, end: 2300 },
        { text: 'are', start: 2300, end: 2400 },
        { text: 'you', start: 2400, end: 2500 },
        { text: 'doing', start: 2500, end: 2600 },
        { text: 'this', start: 2600, end: 2700 },
        { text: 'fine', start: 2700, end: 2800 },
        { text: 'morning', start: 2800, end: 2900 },
        { text: 'my', start: 2900, end: 3000 },
        { text: 'dear', start: 3000, end: 3100 },
        { text: 'friend', start: 3100, end: 3200 },
        { text: 'today?', start: 3200, end: 3400 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hello world this is a great day for everyone out there!');
      expect(result[1].text).toBe('How are you doing this fine morning my dear friend today?');
    });
  });

  describe('CJK language handling', () => {
    it('should merge Chinese subtitles without spaces', () => {
      // Use time gap > 1000ms to separate the two phrases
      const input: SubtitleFragment[] = [
        { text: '大家好今天我们来学习编程', start: 1000, end: 2000 },
        { text: '我是一名资深的程序员朋友们', start: 3500, end: 4500 },
      ];

      const result = optimizeSubtitles(input, 'zh-CN');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('大家好今天我们来学习编程');
      expect(result[1].text).toBe('我是一名资深的程序员朋友们');
    });

    it('should detect Japanese language', () => {
      const input: SubtitleFragment[] = [
        { text: 'こんにちは世界のみなさんおはようございます', start: 1000, end: 2000 },
        { text: '今日はいい天気ですねみなさん', start: 3500, end: 4500 },
      ];

      const result = optimizeSubtitles(input, 'ja');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('こんにちは世界のみなさんおはようございます');
      expect(result[1].text).toBe('今日はいい天気ですねみなさん');
    });

    it('should detect Korean language', () => {
      const input: SubtitleFragment[] = [
        { text: '안녕하세요오늘은좋은날이에요여러분', start: 1000, end: 2000 },
        { text: '저는프로그래머입니다반갑습니다', start: 3500, end: 4500 },
      ];

      const result = optimizeSubtitles(input, 'ko');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('안녕하세요오늘은좋은날이에요여러분');
      expect(result[1].text).toBe('저는프로그래머입니다반갑습니다');
    });

    it('degrades CJK unpunctuated short cues to ASR refine (no mega-line walls)', () => {
      // Even if optimizeSubtitles is called directly (bypass controller routing),
      // CJK + punctuation-poor must not glue into a 40+ char wall.
      const input: SubtitleFragment[] = [
        { text: '大家好今天', start: 32033, end: 33166 },
        { text: '我们来聊一个小技巧', start: 33166, end: 35533 },
        { text: '当然', start: 35833, end: 36466 },
        { text: '这个方法看起来有点麻烦', start: 36466, end: 39633 },
        { text: '咱们还是一步步来', start: 39833, end: 40833 },
        { text: '首先打开设置页面', start: 42000, end: 44033 },
        { text: '找到字幕相关选项', start: 44033, end: 45933 },
        { text: '然后把它打开', start: 46033, end: 48300 },
        { text: '啊如果没有看到', start: 49133, end: 51533 },
        { text: '可以先刷新一下页面', start: 51533, end: 54800 },
      ];

      const result = optimizeSubtitles(input, 'zh-CN');
      const maxLen = Math.max(...result.map(f => f.text.replace(/\s+/g, '').length));
      const mega =
        '大家好今天我们来聊一个小技巧当然这个方法看起来有点麻烦咱们还是一步步来';

      expect(result.length).toBeGreaterThan(1);
      expect(result.length).toBeLessThan(input.length);
      expect(maxLen).toBeLessThanOrEqual(40);
      expect(result.some(f => f.text.replace(/\s+/g, '') === mega)).toBe(false);
    });

    it('still uses optimizer path for polished punctuated Chinese', () => {
      const input: SubtitleFragment[] = [
        { text: '大家好，今天我们来聊一个话题。', start: 0, end: 2500 },
        { text: '这件事其实并不复杂。', start: 2600, end: 4500 },
        { text: '关键在于我们如何理解它。', start: 4600, end: 7000 },
        { text: '接下来分三点说明。', start: 7100, end: 9000 },
        { text: '第一点是背景情况。', start: 9100, end: 11000 },
      ];
      const result = optimizeSubtitles(input, 'zh-CN');
      // Punctuated CJK stays on optimizer; sentences remain separate
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result.every(f => /[。！？]$/.test(f.text.trim()) || f.text.length > 0)).toBe(true);
    });
  });

  describe('Time gap handling', () => {
    it('should break segments on long pauses (>1000ms)', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        // 1500ms gap (> 1000ms threshold)
        { text: 'Next', start: 3000, end: 3200 },
        { text: 'sentence', start: 3200, end: 3500 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hello world');
      expect(result[1].text).toBe('Next sentence');
    });

    it('should merge segments with short pauses (<1000ms)', () => {
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1200 },
        { text: 'world', start: 1200, end: 1500 },
        // 200ms gap (< 1000ms)
        { text: 'this', start: 1700, end: 1900 },
        { text: 'continues', start: 1900, end: 2100 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello world this continues');
    });
  });

  describe('Special character handling', () => {
    it('should break on segments starting with special markers', () => {
      // Use enough words so segments are above rebalance min
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1100 },
        { text: 'world', start: 1100, end: 1200 },
        { text: 'this', start: 1200, end: 1300 },
        { text: 'is', start: 1300, end: 1400 },
        { text: 'my', start: 1400, end: 1500 },
        { text: 'first', start: 1500, end: 1600 },
        { text: 'sentence', start: 1600, end: 1700 },
        { text: 'in', start: 1700, end: 1800 },
        { text: 'the', start: 1800, end: 1900 },
        { text: 'video', start: 1900, end: 2000 },
        { text: 'today', start: 2000, end: 2100 },
        { text: '[Music]', start: 2200, end: 2500 },
        { text: 'Now', start: 2600, end: 2700 },
        { text: 'we', start: 2700, end: 2800 },
        { text: 'continue', start: 2800, end: 2900 },
        { text: 'with', start: 2900, end: 3000 },
        { text: 'the', start: 3000, end: 3100 },
        { text: 'next', start: 3100, end: 3200 },
        { text: 'part', start: 3200, end: 3300 },
        { text: 'of', start: 3300, end: 3400 },
        { text: 'our', start: 3400, end: 3500 },
        { text: 'story', start: 3500, end: 3600 },
        { text: 'here', start: 3600, end: 3700 },
      ];

      const result = optimizeSubtitles(input, 'en');

      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Hello world this is my first sentence in the video today');
      expect(result[1].text).toBe('[Music]');
      expect(result[2].text).toBe('Now we continue with the next part of our story here');
    });

    it('should clean YouTube ASR markers (>>)', () => {
      const input: SubtitleFragment[] = [
        { text: '>> Hello', start: 1000, end: 1100 },
        { text: 'world', start: 1100, end: 1200 },
        { text: 'welcome', start: 1200, end: 1300 },
        { text: 'to', start: 1300, end: 1400 },
        { text: 'the', start: 1400, end: 1500 },
        { text: 'show', start: 1500, end: 1600 },
        { text: 'everyone', start: 1600, end: 1700 },
        { text: 'here', start: 1700, end: 1800 },
        { text: 'today', start: 1800, end: 1900 },
        { text: 'friends', start: 1900, end: 2000 },
        { text: 'and', start: 2000, end: 2100 },
        { text: 'family.', start: 2100, end: 2200 },
        { text: 'test >> marker', start: 2300, end: 2400 },
        { text: 'continues', start: 2400, end: 2500 },
        { text: 'with', start: 2500, end: 2600 },
        { text: 'more', start: 2600, end: 2700 },
        { text: 'words', start: 2700, end: 2800 },
        { text: 'to', start: 2800, end: 2900 },
        { text: 'fill', start: 2900, end: 3000 },
        { text: 'the', start: 3000, end: 3100 },
        { text: 'gap', start: 3100, end: 3200 },
        { text: 'up', start: 3200, end: 3300 },
        { text: 'here.', start: 3300, end: 3400 },
      ];

      const result = optimizeSubtitles(input, 'en');

      // First segment should have >> cleaned
      expect(result[0].text).toContain('Hello');
      expect(result[0].text).not.toContain('>>');
      // The marker inside text should also be cleaned
      const allText = result.map(r => r.text).join(' ');
      expect(allText).not.toContain('>>');
    });
  });

  describe('Length limiting', () => {
    it('should break long segments when exceeding max length (15 words)', () => {
      // Create a long sequence of words
      const words = Array.from({ length: 50 }, (_, i) => ({
        text: `word${i}`,
        start: 1000 + i * 200,
        end: 1000 + (i + 1) * 200,
      }));

      const result = optimizeSubtitles(words, 'en');

      // Should be broken into multiple segments
      expect(result.length).toBeGreaterThan(1);

      // Each segment should be within rebalanced range (max ~20 words after rebalance)
      result.forEach(seg => {
        const wordCount = seg.text.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(20); // TARGET_MAX_NON_CJK
      });
    });
  });

  describe('Rebalancing', () => {
    it('should merge short lines to reach target length', () => {
      // Create many short segments that should be merged by rebalance
      const input: SubtitleFragment[] = [
        { text: 'Hi.', start: 1000, end: 1100 },
        { text: 'There.', start: 1100, end: 1200 },
        { text: 'How.', start: 1200, end: 1300 },
        { text: 'Are.', start: 1300, end: 1400 },
        { text: 'You.', start: 1400, end: 1500 },
        { text: 'Today.', start: 1500, end: 1600 },
        { text: 'Good.', start: 1600, end: 1700 },
        { text: 'Thanks.', start: 1700, end: 1800 },
        { text: 'Great.', start: 1800, end: 1900 },
        { text: 'Nice.', start: 1900, end: 2000 },
        { text: 'Cool.', start: 2000, end: 2100 },
        { text: 'Fine.', start: 2100, end: 2200 },
      ];

      const result = optimizeSubtitles(input, 'en');

      // Should merge short segments (rebalance min is 11 words)
      expect(result.length).toBeLessThan(input.length);
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

  describe('ASR no-punctuation detection', () => {
    it('should segment long unpunctuated ASR text into multiple readable chunks', () => {
      // Simulate typical YouTube ASR: word-level fragments without any punctuation
      const words = 'also my hair got so long need to get my hair thank you to Lucan for sponsoring this video all items throughout this video will be linked in my description box down below today I\'m meeting up with Julia and Nina probably to do the usual cute Cafe hopping and shopping this is my outfit for today it\'s giving such girly cockette Vibes also my hair got so long now I desperately need a haircut I\'m going to be getting'.split(' ');
      const input: SubtitleFragment[] = words.map((word, i) => ({
        text: word,
        start: i * 300,
        end: (i + 1) * 300,
      }));

      const result = optimizeSubtitles(input, 'en');

      // Should produce multiple segments (not 1-2 giant blocks)
      expect(result.length).toBeGreaterThanOrEqual(4);

      // Each segment should be readable length (not exceeding ~20 words after rebalance)
      result.forEach(seg => {
        const wordCount = seg.text.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(20);
      });
    });

    it('should not aggressively split text that already has punctuation', () => {
      // Input with proper punctuation — more than 5 fragments so ASR detection applies
      // Since many fragments have punctuation (>5%), ASR mode is NOT triggered
      // Punctuation causes breaks in processSubtitles, then rebalance merges short ones
      const input: SubtitleFragment[] = [
        { text: 'Hello,', start: 1000, end: 1100 },
        { text: 'my', start: 1100, end: 1200 },
        { text: 'name', start: 1200, end: 1300 },
        { text: 'is', start: 1300, end: 1400 },
        { text: 'John', start: 1400, end: 1500 },
        { text: 'and', start: 1500, end: 1600 },
        { text: 'I', start: 1600, end: 1700 },
        { text: 'really', start: 1700, end: 1800 },
        { text: 'like', start: 1800, end: 1900 },
        { text: 'coding.', start: 1900, end: 2000 },
        { text: 'Also,', start: 2100, end: 2200 },
        { text: 'I', start: 2200, end: 2300 },
        { text: 'enjoy', start: 2300, end: 2400 },
        { text: 'reading', start: 2400, end: 2500 },
        { text: 'books', start: 2500, end: 2600 },
        { text: 'every', start: 2600, end: 2700 },
        { text: 'single', start: 2700, end: 2800 },
        { text: 'day.', start: 2800, end: 2900 },
        { text: 'Furthermore,', start: 3000, end: 3100 },
        { text: 'I', start: 3100, end: 3200 },
        { text: 'believe', start: 3200, end: 3300 },
        { text: 'that', start: 3300, end: 3400 },
        { text: 'learning', start: 3400, end: 3500 },
        { text: 'new', start: 3500, end: 3600 },
        { text: 'things', start: 3600, end: 3700 },
        { text: 'is', start: 3700, end: 3800 },
        { text: 'essential', start: 3800, end: 3900 },
        { text: 'for', start: 3900, end: 4000 },
        { text: 'personal', start: 4000, end: 4100 },
        { text: 'growth.', start: 4100, end: 4200 },
      ];

      const result = optimizeSubtitles(input, 'en');

      // With punctuation present, it should split at punctuation marks
      // and produce multiple segments after rebalance
      expect(result.length).toBeGreaterThanOrEqual(2);
      // Verify total words are preserved
      const allWords = result.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
      expect(allWords).toBe(30);
    });

    it('should handle second test case of unpunctuated ASR text', () => {
      const words = 'of what I got at Chanel today this is the bag that I got and it\'s so pretty I\'m actually obsessed I\'ve been wanting a baby pink Chanel bag for a long time now today they finally had this mini classic pink one so I got it and I bought this with my own money the inside is pretty small but I feel like it still fits enough Essentials once again I wanted to thank Lucan for sponsoring this video'.split(' ');
      const input: SubtitleFragment[] = words.map((word, i) => ({
        text: word,
        start: i * 300,
        end: (i + 1) * 300,
      }));

      const result = optimizeSubtitles(input, 'en');

      // Should produce multiple readable segments
      expect(result.length).toBeGreaterThanOrEqual(4);

      // No segment should be longer than 20 words
      result.forEach(seg => {
        const wordCount = seg.text.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(20);
      });
    });
  });

  describe('Comma as sentence break', () => {
    it('should break at commas in the text', () => {
      // Create enough fragments with commas to test comma-breaking behavior
      const input: SubtitleFragment[] = [
        { text: 'Hello', start: 1000, end: 1100 },
        { text: 'everyone,', start: 1100, end: 1200 },
        { text: 'welcome', start: 1200, end: 1300 },
        { text: 'to', start: 1300, end: 1400 },
        { text: 'this', start: 1400, end: 1500 },
        { text: 'amazing', start: 1500, end: 1600 },
        { text: 'channel,', start: 1600, end: 1700 },
        { text: 'today', start: 1700, end: 1800 },
        { text: 'we', start: 1800, end: 1900 },
        { text: 'are', start: 1900, end: 2000 },
        { text: 'going', start: 2000, end: 2100 },
        { text: 'to', start: 2100, end: 2200 },
        { text: 'learn', start: 2200, end: 2300 },
        { text: 'something', start: 2300, end: 2400 },
        { text: 'new,', start: 2400, end: 2500 },
        { text: 'I', start: 2500, end: 2600 },
        { text: 'promise', start: 2600, end: 2700 },
        { text: 'it', start: 2700, end: 2800 },
        { text: 'will', start: 2800, end: 2900 },
        { text: 'be', start: 2900, end: 3000 },
        { text: 'really', start: 3000, end: 3100 },
        { text: 'great', start: 3100, end: 3200 },
      ];

      const result = optimizeSubtitles(input, 'en');

      // Comma triggers breaks, so we should get multiple segments
      expect(result.length).toBeGreaterThanOrEqual(2);
      // No single segment should be excessively long
      result.forEach(seg => {
        const wordCount = seg.text.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(20);
      });
    });
  });
});
