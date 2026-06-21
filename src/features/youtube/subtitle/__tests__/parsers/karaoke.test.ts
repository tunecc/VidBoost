import { describe, it, expect } from 'vitest';
import { parseKaraokeSubtitles } from '../../parsers/karaoke';
import type { TimedTextEvent, SubtitleFragment } from '../../utils/types';

describe('parseKaraokeSubtitles', () => {
  describe('basic functionality', () => {
    it('should parse single track with single event', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          wpWinPosId: 3,
          segs: [{ utf8: '歌詞テスト' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toEqual([
        {
          text: '歌詞テスト',
          start: 1000,
          end: 3000
        }
      ]);
    });

    it('should parse multiple events from same track', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: '最初の行' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: '二番目の行' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: '三番目の行' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toEqual([
        { text: '最初の行', start: 0, end: 1000 },
        { text: '二番目の行', start: 1000, end: 2000 },
        { text: '三番目の行', start: 2000, end: 3000 }
      ]);
    });

    it('should merge segments within same event', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          wpWinPosId: 3,
          segs: [
            { utf8: '君と' },
            { utf8: '見た' },
            { utf8: '夢' }
          ]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toEqual([
        { text: '君と見た夢', start: 1000, end: 3000 }
      ]);
    });
  });

  describe('track selection', () => {
    it('should prefer kanji track (wpWinPosId: 3) when available', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'romaji' }]
        },
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: '漢字' }]
        },
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 5,
          segs: [{ utf8: 'other' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('漢字');
    });

    it('should select highest track ID when kanji track is not available', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'track 1' }]
        },
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 5,
          segs: [{ utf8: 'track 5' }]
        },
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'track 2' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('track 5');
    });

    it('should filter out non-main track events', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'main 1' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'other track' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'main 2' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('main 1');
      expect(result[1].text).toBe('main 2');
    });
  });

  describe('text cleaning', () => {
    it('should remove zero-width spaces', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: '君​と​夢' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0].text).toBe('君と夢');
    });

    it('should normalize multiple whitespaces to single space', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Hello    world  test' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0].text).toBe('Hello world test');
    });

    it('should trim leading and trailing whitespace', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: '  歌詞  ' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0].text).toBe('歌詞');
    });

    it('should handle tabs and newlines', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Line1\n\tLine2\r\nLine3' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0].text).toBe('Line1 Line2 Line3');
    });
  });

  describe('timing adjustments', () => {
    it('should adjust previous fragment end time to prevent overlap', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 3,
          segs: [{ utf8: 'First' }]
        },
        {
          tStartMs: 1500,
          dDurationMs: 2000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Second' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0]).toEqual({ text: 'First', start: 0, end: 1500 });
      expect(result[1]).toEqual({ text: 'Second', start: 1500, end: 3500 });
    });

    it('should not adjust when fragments do not overlap', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'First' }]
        },
        {
          tStartMs: 1500,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Second' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0]).toEqual({ text: 'First', start: 0, end: 1000 });
      expect(result[1]).toEqual({ text: 'Second', start: 1500, end: 2500 });
    });
  });

  describe('deduplication', () => {
    it('should merge adjacent fragments with identical text', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Repeat' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Repeat' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Different' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'Repeat', start: 0, end: 2000 });
      expect(result[1]).toEqual({ text: 'Different', start: 2000, end: 3000 });
    });

    it('should not merge non-adjacent identical text', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Same' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Different' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Same' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Same');
      expect(result[1].text).toBe('Different');
      expect(result[2].text).toBe('Same');
    });
  });

  describe('edge cases', () => {
    it('should handle empty events array', () => {
      const result = parseKaraokeSubtitles([]);

      expect(result).toEqual([]);
    });

    it('should handle events with no wpWinPosId', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'No track' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle event with empty segs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: []
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle event with undefined segs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should skip events with empty text after cleaning', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: '   ' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Valid' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Valid');
    });

    it('should handle missing dDurationMs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'Text' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0]).toEqual({ text: 'Text', start: 1000, end: 1000 });
    });

    it('should handle segment with undefined utf8', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: undefined as any }, { utf8: 'Valid' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result[0].text).toBe('Valid');
    });
  });

  describe('real-world scenarios', () => {
    it('should handle Japanese karaoke with multiple tracks', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'kimi to mita yume' }]
        },
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 3,
          segs: [{ utf8: '君と見た夢' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'wasure wa shinai' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 2000,
          wpWinPosId: 3,
          segs: [{ utf8: '忘れはしない' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('君と見た夢');
      expect(result[1].text).toBe('忘れはしない');
    });

    it('should handle word-by-word karaoke timing', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 3000,
          wpWinPosId: 3,
          segs: [
            { utf8: '桜' },
            { utf8: '舞う' },
            { utf8: '季節' }
          ]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('桜舞う季節');
      expect(result[0].start).toBe(0);
      expect(result[0].end).toBe(3000);
    });

    it('should handle complex multi-track with repeated lyrics', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'ラララ' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'ラララ' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 3,
          segs: [{ utf8: 'ラララ' }]
        },
        {
          tStartMs: 3000,
          dDurationMs: 2000,
          wpWinPosId: 3,
          segs: [{ utf8: '夢の中で' }]
        }
      ];

      const result = parseKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ text: 'ラララ', start: 0, end: 3000 });
      expect(result[1]).toEqual({ text: '夢の中で', start: 3000, end: 5000 });
    });
  });
});
