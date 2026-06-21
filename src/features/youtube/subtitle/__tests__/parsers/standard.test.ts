import { describe, it, expect } from 'vitest';
import { parseStandardSubtitles } from '../../parsers/standard';
import type { TimedTextEvent, SubtitleFragment } from '../../utils/types';

describe('parseStandardSubtitles', () => {
  describe('basic functionality', () => {
    it('should parse single event with single segment', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [{ utf8: 'Hello world' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toEqual([
        {
          text: 'Hello world',
          start: 1000,
          end: 3000
        }
      ]);
    });

    it('should parse multiple events with single segments', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'First line' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          segs: [{ utf8: 'Second line' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          segs: [{ utf8: 'Third line' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toEqual([
        { text: 'First line', start: 0, end: 1000 },
        { text: 'Second line', start: 1000, end: 2000 },
        { text: 'Third line', start: 2000, end: 3000 }
      ]);
    });

    it('should handle event with multiple segments', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 3000,
          segs: [
            { utf8: 'First', tOffsetMs: 0 },
            { utf8: 'Second', tOffsetMs: 1000 },
            { utf8: 'Third', tOffsetMs: 2000 }
          ]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toEqual([
        { text: 'First', start: 1000, end: 2000 },
        { text: 'Second', start: 2000, end: 3000 },
        { text: 'Third', start: 3000, end: 4000 }
      ]);
    });
  });

  describe('text normalization', () => {
    it('should trim whitespace', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: '  Hello world  ' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0].text).toBe('Hello world');
    });

    it('should normalize multiple whitespaces to single space', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'Hello    world\n\tthere' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0].text).toBe('Hello world there');
    });

    it('should handle tabs and newlines', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'Line1\n\tLine2\r\nLine3' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0].text).toBe('Line1 Line2 Line3');
    });
  });

  describe('timing calculations', () => {
    it('should calculate end time from segment offset', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 5000,
          segs: [
            { utf8: 'First', tOffsetMs: 0 },
            { utf8: 'Second', tOffsetMs: 2000 }
          ]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0]).toEqual({ text: 'First', start: 1000, end: 3000 });
      expect(result[1]).toEqual({ text: 'Second', start: 3000, end: 6000 });
    });

    it('should use event duration for last segment', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [
            { utf8: 'Only', tOffsetMs: 0 }
          ]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0].end).toBe(3000);
    });

    it('should handle default tOffsetMs of 0', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          segs: [{ utf8: 'Text' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0].start).toBe(1000);
    });

    it('should handle overlapping timings correctly', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          segs: [{ utf8: 'First', tOffsetMs: 0 }]
        },
        {
          tStartMs: 1500,
          dDurationMs: 2000,
          segs: [{ utf8: 'Second', tOffsetMs: 0 }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0]).toEqual({ text: 'First', start: 0, end: 1500 });
      expect(result[1]).toEqual({ text: 'Second', start: 1500, end: 3500 });
    });
  });

  describe('edge cases', () => {
    it('should handle empty events array', () => {
      const result = parseStandardSubtitles([]);

      expect(result).toEqual([]);
    });

    it('should handle undefined events', () => {
      const result = parseStandardSubtitles(undefined as any);

      expect(result).toEqual([]);
    });

    it('should handle event with empty segs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: []
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle event with undefined segs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle segment with empty utf8', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: '' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toEqual([
        { text: '', start: 0, end: 1000 }
      ]);
    });

    it('should handle missing dDurationMs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          segs: [{ utf8: 'Text', tOffsetMs: 0 }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0]).toEqual({ text: 'Text', start: 1000, end: 1000 });
    });

    it('should handle missing tStartMs', () => {
      const events: TimedTextEvent[] = [
        {
          dDurationMs: 1000,
          segs: [{ utf8: 'Text' }]
        } as TimedTextEvent
      ];

      const result = parseStandardSubtitles(events);

      expect(result[0].start).toBe(0);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical YouTube subtitle format', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 3000,
          segs: [{ utf8: 'Welcome to this video' }]
        },
        {
          tStartMs: 3000,
          dDurationMs: 4000,
          segs: [{ utf8: "Today we're going to talk about" }]
        },
        {
          tStartMs: 7000,
          dDurationMs: 3000,
          segs: [{ utf8: 'how to build amazing things' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        text: 'Welcome to this video',
        start: 0,
        end: 3000
      });
      expect(result[1]).toEqual({
        text: "Today we're going to talk about",
        start: 3000,
        end: 7000
      });
      expect(result[2]).toEqual({
        text: 'how to build amazing things',
        start: 7000,
        end: 10000
      });
    });

    it('should handle karaoke-style word-by-word timing', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          segs: [
            { utf8: 'The', tOffsetMs: 0 },
            { utf8: ' quick', tOffsetMs: 500 },
            { utf8: ' brown', tOffsetMs: 1000 },
            { utf8: ' fox', tOffsetMs: 1500 }
          ]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ text: 'The', start: 0, end: 500 });
      expect(result[1]).toEqual({ text: 'quick', start: 500, end: 1000 });
      expect(result[2]).toEqual({ text: 'brown', start: 1000, end: 1500 });
      expect(result[3]).toEqual({ text: 'fox', start: 1500, end: 2000 });
    });

    it('should handle mixed single and multi-segment events', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'Start' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [
            { utf8: 'First', tOffsetMs: 0 },
            { utf8: 'Second', tOffsetMs: 1000 }
          ]
        },
        {
          tStartMs: 3000,
          dDurationMs: 1000,
          segs: [{ utf8: 'End' }]
        }
      ];

      const result = parseStandardSubtitles(events);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ text: 'Start', start: 0, end: 1000 });
      expect(result[1]).toEqual({ text: 'First', start: 1000, end: 2000 });
      expect(result[2]).toEqual({ text: 'Second', start: 2000, end: 3000 });
      expect(result[3]).toEqual({ text: 'End', start: 3000, end: 4000 });
    });
  });
});
