import { describe, it, expect } from 'vitest';
import { detectFormat } from '../../core/format-detector';
import type { TimedTextEvent, SubtitleFormat } from '../../utils/types';

describe('detectFormat', () => {
  describe('animated format detection', () => {
    it('should detect animated format with 50+ events, >50% short duration, and wpWinPosId', () => {
      const events: TimedTextEvent[] = Array.from({ length: 60 }, (_, i) => ({
        tStartMs: i * 50,
        dDurationMs: 50,
        wpWinPosId: 0,
        segs: [{ utf8: `Frame ${i}` }]
      }));

      const result = detectFormat(events);

      expect(result).toBe('animated');
    });

    it('should detect animated format with exactly 50% short events', () => {
      const events: TimedTextEvent[] = [
        ...Array.from({ length: 30 }, (_, i) => ({
          tStartMs: i * 50,
          dDurationMs: 50,
          wpWinPosId: 0,
          segs: [{ utf8: `Short ${i}` }]
        })),
        ...Array.from({ length: 30 }, (_, i) => ({
          tStartMs: 30 * 50 + i * 200,
          dDurationMs: 200,
          wpWinPosId: 0,
          segs: [{ utf8: `Long ${i}` }]
        }))
      ];

      const result = detectFormat(events);

      expect(result).toBe('animated');
    });

    it('should not detect animated format with <50 events', () => {
      const events: TimedTextEvent[] = Array.from({ length: 40 }, (_, i) => ({
        tStartMs: i * 50,
        dDurationMs: 50,
        wpWinPosId: 0,
        segs: [{ utf8: `Frame ${i}` }]
      }));

      const result = detectFormat(events);

      expect(result).not.toBe('animated');
    });

    it('should not detect animated format with <50% short events', () => {
      const events: TimedTextEvent[] = [
        ...Array.from({ length: 20 }, (_, i) => ({
          tStartMs: i * 50,
          dDurationMs: 50,
          wpWinPosId: 0,
          segs: [{ utf8: `Short ${i}` }]
        })),
        ...Array.from({ length: 40 }, (_, i) => ({
          tStartMs: 20 * 50 + i * 200,
          dDurationMs: 200,
          wpWinPosId: 0,
          segs: [{ utf8: `Long ${i}` }]
        }))
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('animated');
    });

    it('should not detect animated format without wpWinPosId', () => {
      const events: TimedTextEvent[] = Array.from({ length: 60 }, (_, i) => ({
        tStartMs: i * 50,
        dDurationMs: 50,
        segs: [{ utf8: `Frame ${i}` }]
      }));

      const result = detectFormat(events);

      expect(result).not.toBe('animated');
    });

    it('should consider events with duration <= 100ms as short', () => {
      const events: TimedTextEvent[] = Array.from({ length: 50 }, (_, i) => ({
        tStartMs: i * 100,
        dDurationMs: 100,
        wpWinPosId: 0,
        segs: [{ utf8: `Frame ${i}` }]
      }));

      const result = detectFormat(events);

      expect(result).toBe('animated');
    });

    it('should not consider events with duration > 100ms as short', () => {
      const events: TimedTextEvent[] = Array.from({ length: 50 }, (_, i) => ({
        tStartMs: i * 150,
        dDurationMs: 101,
        wpWinPosId: 0,
        segs: [{ utf8: `Frame ${i}` }]
      }));

      const result = detectFormat(events);

      expect(result).not.toBe('animated');
    });
  });

  describe('stylized karaoke format detection', () => {
    it('should detect stylized karaoke with slash markers and 400ms repeats', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こ/んに/ちは' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こん/にち/は' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんに/ちは' }] },
        { tStartMs: 900, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんにち/は' }] },
        { tStartMs: 1200, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんにちは' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('stylized-karaoke');
    });

    it('should detect stylized karaoke with zero-width space markers', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こ​んに​ちは' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こん​にち​は' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんに​ちは' }] },
        { tStartMs: 900, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんにち​は' }] },
        { tStartMs: 1200, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんにちは' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('stylized-karaoke');
    });

    it('should detect stylized karaoke with expanding text', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Hel/lo' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Hel/lo wor/ld' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Hello wor/ld' }] },
        { tStartMs: 900, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Hello worl/d' }] },
        { tStartMs: 1200, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Hello world' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('stylized-karaoke');
    });

    it('should require at least 3 stylized matches', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こ/んに/ちは' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こん/にち/は' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'さようなら' }] }
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('stylized-karaoke');
    });

    it('should not detect stylized karaoke with gaps > 400ms', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こ/んに/ちは' }] },
        { tStartMs: 500, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こん/にち/は' }] },
        { tStartMs: 1000, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんに/ちは' }] },
        { tStartMs: 1500, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんにちは' }] }
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('stylized-karaoke');
    });

    it('should handle multi-track stylized karaoke', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Top /line' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Top li/ne' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Top lin/e' }] },
        { tStartMs: 900, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'Top line' }] },
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 1, segs: [{ utf8: 'Bottom /text' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 1, segs: [{ utf8: 'Bottom te/xt' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 1, segs: [{ utf8: 'Bottom tex/t' }] },
        { tStartMs: 900, dDurationMs: 300, wpWinPosId: 1, segs: [{ utf8: 'Bottom text' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('stylized-karaoke');
    });

    it('should normalize text for comparison (case-insensitive, no slashes/spaces)', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'HEL/LO' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'hel / lo' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'he l / l o' }] },
        { tStartMs: 900, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'hel/lo' }] },
        { tStartMs: 1200, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'hello' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('stylized-karaoke');
    });
  });

  describe('karaoke format detection', () => {
    it('should detect karaoke format with same timestamp and different wpWinPosId', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 1000, dDurationMs: 2000, wpWinPosId: 0, segs: [{ utf8: 'Top line' }] },
        { tStartMs: 1000, dDurationMs: 2000, wpWinPosId: 1, segs: [{ utf8: 'Bottom line' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('karaoke');
    });

    it('should detect karaoke format with multiple tracks', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 0, segs: [{ utf8: 'Track 1' }] },
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 1, segs: [{ utf8: 'Track 2' }] },
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 2, segs: [{ utf8: 'Track 3' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('karaoke');
    });

    it('should not detect karaoke format with same timestamp and same wpWinPosId', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 1000, dDurationMs: 2000, wpWinPosId: 0, segs: [{ utf8: 'Line 1' }] },
        { tStartMs: 1000, dDurationMs: 2000, wpWinPosId: 0, segs: [{ utf8: 'Line 2' }] }
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('karaoke');
    });

    it('should not detect karaoke format without wpWinPosId', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Line 1' }] },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Line 2' }] }
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('karaoke');
    });

    it('should detect karaoke even with just one overlapping timestamp', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 0, segs: [{ utf8: 'First' }] },
        { tStartMs: 1000, dDurationMs: 1000, wpWinPosId: 0, segs: [{ utf8: 'Second' }] },
        { tStartMs: 1000, dDurationMs: 1000, wpWinPosId: 1, segs: [{ utf8: 'Overlap' }] },
        { tStartMs: 2000, dDurationMs: 1000, wpWinPosId: 0, segs: [{ utf8: 'Third' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('karaoke');
    });
  });

  describe('scrolling ASR format detection', () => {
    it('should detect scrolling ASR format with wWinId and aAppend=1', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, wWinId: 0, aAppend: 1, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 1000, dDurationMs: 1000, wWinId: 0, aAppend: 1, segs: [{ utf8: 'world' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('scrolling-asr');
    });

    it('should detect scrolling ASR with just one aAppend event', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Normal' }] },
        { tStartMs: 1000, dDurationMs: 1000, wWinId: 0, aAppend: 1, segs: [{ utf8: 'Append' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Normal' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('scrolling-asr');
    });

    it('should not detect scrolling ASR without aAppend=1', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, wWinId: 0, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 1000, dDurationMs: 1000, wWinId: 0, segs: [{ utf8: 'world' }] }
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('scrolling-asr');
    });

    it('should not detect scrolling ASR without wWinId', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, aAppend: 1, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 1000, dDurationMs: 1000, aAppend: 1, segs: [{ utf8: 'world' }] }
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('scrolling-asr');
    });

    it('should require aAppend to be exactly 1', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, wWinId: 0, aAppend: 0, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 1000, dDurationMs: 1000, wWinId: 0, aAppend: 2, segs: [{ utf8: 'world' }] }
      ];

      const result = detectFormat(events);

      expect(result).not.toBe('scrolling-asr');
    });
  });

  describe('standard format detection', () => {
    it('should detect standard format as fallback', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'world' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('standard');
    });

    it('should return standard for empty array', () => {
      const result = detectFormat([]);

      expect(result).toBe('standard');
    });

    it('should handle undefined events', () => {
      const result = detectFormat(undefined as any);

      expect(result).toBe('standard');
    });

    it('should handle null events', () => {
      const result = detectFormat(null as any);

      expect(result).toBe('standard');
    });
  });

  describe('detection priority', () => {
    it('should prioritize animated over stylized karaoke', () => {
      const events: TimedTextEvent[] = [
        ...Array.from({ length: 50 }, (_, i) => ({
          tStartMs: i * 50,
          dDurationMs: 50,
          wpWinPosId: 0,
          segs: [{ utf8: `こ/んに${i}` }]
        })),
        { tStartMs: 2500, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こ/んに/ちは' }] },
        { tStartMs: 2800, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こん/にち/は' }] },
        { tStartMs: 3100, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんに/ちは' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('animated');
    });

    it('should prioritize stylized karaoke over karaoke', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こ/んに/ちは' }] },
        { tStartMs: 300, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こん/にち/は' }] },
        { tStartMs: 600, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんに/ちは' }] },
        { tStartMs: 900, dDurationMs: 300, wpWinPosId: 0, segs: [{ utf8: 'こんにち/は' }] },
        { tStartMs: 1200, dDurationMs: 1000, wpWinPosId: 0, segs: [{ utf8: 'Top' }] },
        { tStartMs: 1200, dDurationMs: 1000, wpWinPosId: 1, segs: [{ utf8: 'Bottom' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('stylized-karaoke');
    });

    it('should prioritize karaoke over scrolling ASR', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 0, segs: [{ utf8: 'Track 1' }] },
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 1, segs: [{ utf8: 'Track 2' }] },
        { tStartMs: 1000, dDurationMs: 1000, wWinId: 0, aAppend: 1, segs: [{ utf8: 'ASR' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('karaoke');
    });

    it('should prioritize scrolling ASR over standard', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Normal' }] },
        { tStartMs: 1000, dDurationMs: 1000, wWinId: 0, aAppend: 1, segs: [{ utf8: 'ASR' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Normal' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('scrolling-asr');
    });
  });

  describe('edge cases', () => {
    it('should handle events with missing dDurationMs', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, segs: [{ utf8: 'Text' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('standard');
    });

    it('should handle events with missing segs', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000 }
      ];

      const result = detectFormat(events);

      expect(result).toBe('standard');
    });

    it('should handle events with empty segs', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, segs: [] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('standard');
    });

    it('should handle mixed events with and without wpWinPosId', () => {
      const events: TimedTextEvent[] = [
        { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 0, segs: [{ utf8: 'With' }] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Without' }] }
      ];

      const result = detectFormat(events);

      expect(result).toBe('standard');
    });

    it('should handle dDurationMs of 0', () => {
      const events: TimedTextEvent[] = Array.from({ length: 50 }, (_, i) => ({
        tStartMs: i * 50,
        dDurationMs: 0,
        wpWinPosId: 0,
        segs: [{ utf8: `Frame ${i}` }]
      }));

      const result = detectFormat(events);

      expect(result).toBe('animated');
    });
  });
});
