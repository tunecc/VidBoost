import { describe, it, expect } from 'vitest';
import { parseScrollingAsrSubtitles } from '../../parsers/scrolling-asr';
import type { TimedTextEvent } from '../../utils/types';

describe('parseScrollingAsrSubtitles', () => {
  describe('faithful event output', () => {
    it('should turn each non-separator event into one fragment', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: 'World' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'Hello', start: 1000, end: 3000 });
      expect(result[1]).toEqual({ text: 'World', start: 3000, end: 5000 });
    });

    it('should preserve YouTube original timing verbatim', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 4799, dDurationMs: 1581, segs: [{ utf8: 'also my hair got so' }] },
        { tStartMs: 15640, dDurationMs: 3639, segs: [{ utf8: 'long need to get my' }] },
        { tStartMs: 26560, dDurationMs: 2360, segs: [{ utf8: 'hair thank you to Lucan for sponsoring' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result).toEqual([
        { text: 'also my hair got so', start: 4799, end: 6380 },
        { text: 'long need to get my', start: 15640, end: 19279 },
        { text: 'hair thank you to Lucan for sponsoring', start: 26560, end: 28920 },
      ]);
    });

    it('should skip separator events (aAppend) without text', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 1000, aAppend: 1 },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'World' }] },
        { tStartMs: 2000, aAppend: 1 },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      // Two text events => two fragments with original timing
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'Hello', start: 0, end: 1000 });
      expect(result[1]).toEqual({ text: 'World', start: 1000, end: 2000 });
    });
  });

  describe('multi-segment events', () => {
    it('should join segs within an event with spaces for English', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 3000,
          segs: [
            { utf8: 'this', tOffsetMs: 0 },
            { utf8: 'is a', tOffsetMs: 500 },
            { utf8: 'test', tOffsetMs: 1500 },
          ],
        },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('this is a test');
      expect(result[0].start).toBe(1000);
    });

    it('should join segs without spaces for CJK languages', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 3000,
          segs: [
            { utf8: '你', tOffsetMs: 0 },
            { utf8: '好', tOffsetMs: 200 },
            { utf8: '世界', tOffsetMs: 500 },
          ],
        },
      ];

      const result = parseScrollingAsrSubtitles(events, 'zh-CN');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('你好世界');
    });

    it('should use explicit dDurationMs for end time', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 5000, dDurationMs: 2500, segs: [{ utf8: 'hello' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result[0].start).toBe(5000);
      expect(result[0].end).toBe(7500);
    });
  });

  describe('whitespace normalization', () => {
    it('should normalize whitespace within text', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'hello    world' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result[0].text).toBe('hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '  hello world  ' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result[0].text).toBe('hello world');
    });
  });

  describe('edge cases', () => {
    it('should handle empty events array', () => {
      const result = parseScrollingAsrSubtitles([], 'en');
      expect(result).toEqual([]);
    });

    it('should skip events with no segs', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000 },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hi' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hi');
    });

    it('should skip events with only empty segs', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '' }] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: '  ' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello');
    });

    it('should assign minimal end time when duration is missing', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 5000, segs: [{ utf8: 'Hello' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result[0].start).toBe(5000);
      expect(result[0].end).toBe(5001);
    });

    it('should fix overlapping end times between consecutive fragments', () => {
      // First event ends after second starts (overlap)
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'First' }] }, // 0-2000
        { tStartMs: 1500, dDurationMs: 2000, segs: [{ utf8: 'Second' }] }, // 1500-3500
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      // First fragment's end clamped to second's start to avoid overlap
      expect(result[0].end).toBe(1500);
      expect(result[1].start).toBe(1500);
      expect(result[1].end).toBe(3500);
    });

    it('should handle undefined language code as space-separated', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'hello' }, { utf8: 'world' }],
        },
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result[0].text).toBe('hello world');
    });
  });

  describe('noise tags passthrough', () => {
    it('should preserve [Music] text events (noise filtering happens upstream)', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '[Music]' }] },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] },
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      // Parser does not filter; filterNoiseFromEvents runs before the parser
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('[Music]');
      expect(result[1].text).toBe('Hello');
    });
  });
});
