import { describe, it, expect } from 'vitest';
import { filterNoiseFromEvents } from '../../utils/noise-filter';
import type { TimedTextEvent } from '../../utils/types';

describe('filterNoiseFromEvents', () => {
  describe('noise pattern filtering', () => {
    it('should filter [Music] pattern', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '[Music]' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should filter [Applause] and [Laughter] patterns', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '[Applause]' }]
        },
        {
          tStartMs: 1000,
          segs: [{ utf8: '[Laughter]' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
      expect(result[1].segs).toEqual([]);
    });

    it('should filter (音乐) pattern', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '(音乐)' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should filter (掌声) pattern', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '(掌声)' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should filter ♪...♪ pattern', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '♪ background music ♪' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should filter single ♪ without closing', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '♪' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should filter 🎵 emoji', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '🎵' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should filter 🎶...🎶 pattern', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '🎶 music playing 🎶' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });
  });

  describe('mixed content handling', () => {
    it('should keep valid text and filter noise in same event', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [
            { utf8: 'Hello world' },
            { utf8: '[Music]' },
            { utf8: 'How are you?' }
          ]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([
        { utf8: 'Hello world' },
        { utf8: 'How are you?' }
      ]);
    });

    it('should handle multiple noise patterns in one event', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [
            { utf8: '[Music]' },
            { utf8: '(音乐)' },
            { utf8: '🎵' },
            { utf8: 'Valid text' }
          ]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([
        { utf8: 'Valid text' }
      ]);
    });

    it('should preserve text that contains noise pattern but has additional content', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [
            { utf8: '[Music] starts here' },
            { utf8: 'The song (音乐) is beautiful' }
          ]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([
        { utf8: '[Music] starts here' },
        { utf8: 'The song (音乐) is beautiful' }
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty events array', () => {
      const events: TimedTextEvent[] = [];

      const result = filterNoiseFromEvents(events);

      expect(result).toEqual([]);
    });

    it('should handle event with undefined segs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toBeUndefined();
    });

    it('should handle event with empty segs array', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: []
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should handle seg with undefined utf8', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: undefined as any }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should handle seg with empty string utf8', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should handle seg with whitespace-only utf8', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '   ' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should trim whitespace before pattern matching', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [
            { utf8: '  [Music]  ' },
            { utf8: '\t(音乐)\n' }
          ]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
    });

    it('should preserve other event properties', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          aAppend: 1,
          wpWinPosId: 3,
          wWinId: 5,
          segs: [{ utf8: 'Hello', tOffsetMs: 100 }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0]).toEqual({
        tStartMs: 1000,
        dDurationMs: 2000,
        aAppend: 1,
        wpWinPosId: 3,
        wWinId: 5,
        segs: [{ utf8: 'Hello', tOffsetMs: 100 }]
      });
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical subtitle sequence with mixed noise and content', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '[Music]' }]
        },
        {
          tStartMs: 2000,
          segs: [{ utf8: 'Welcome to the show' }]
        },
        {
          tStartMs: 4000,
          segs: [{ utf8: '(音乐)' }]
        },
        {
          tStartMs: 6000,
          segs: [{ utf8: 'Today we will discuss' }]
        },
        {
          tStartMs: 8000,
          segs: [{ utf8: '🎵' }]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([]);
      expect(result[1].segs).toEqual([{ utf8: 'Welcome to the show' }]);
      expect(result[2].segs).toEqual([]);
      expect(result[3].segs).toEqual([{ utf8: 'Today we will discuss' }]);
      expect(result[4].segs).toEqual([]);
    });

    it('should handle karaoke-style subtitles with multiple segments', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [
            { utf8: 'The', tOffsetMs: 0 },
            { utf8: ' quick', tOffsetMs: 200 },
            { utf8: ' brown', tOffsetMs: 400 },
            { utf8: ' fox', tOffsetMs: 600 }
          ]
        },
        {
          tStartMs: 1000,
          segs: [
            { utf8: '[Music]', tOffsetMs: 0 },
            { utf8: 'jumps', tOffsetMs: 500 }
          ]
        }
      ];

      const result = filterNoiseFromEvents(events);

      expect(result[0].segs).toEqual([
        { utf8: 'The', tOffsetMs: 0 },
        { utf8: ' quick', tOffsetMs: 200 },
        { utf8: ' brown', tOffsetMs: 400 },
        { utf8: ' fox', tOffsetMs: 600 }
      ]);
      expect(result[1].segs).toEqual([
        { utf8: 'jumps', tOffsetMs: 500 }
      ]);
    });
  });
});
