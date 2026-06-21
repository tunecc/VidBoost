import { describe, it, expect } from 'vitest';
import { parseStylizedKaraokeSubtitles } from '../../parsers/stylized-karaoke';
import type { TimedTextEvent, SubtitleFragment } from '../../utils/types';

describe('parseStylizedKaraokeSubtitles', () => {
  describe('basic functionality', () => {
    it('should parse single track with single event', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Test lyrics' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toEqual([
        {
          text: 'Test lyrics',
          start: 1000,
          end: 3000
        }
      ]);
    });

    it('should merge segments within same event', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [
            { utf8: 'Hello ' },
            { utf8: 'world' }
          ]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toEqual([
        { text: 'Hello world', start: 1000, end: 3000 }
      ]);
    });
  });

  describe('main track selection', () => {
    it('should select track with highest event count', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'track1-event1' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'track2-event1' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'track2-event2' }]
        },
        {
          tStartMs: 3000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'track2-event3' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Should return 4 fragments: 3 from track2 (main) + 1 from track1 (non-overlapping off-track)
      expect(result).toHaveLength(4);
      // Main track fragments should be from track2
      const mainTrackFragments = result.filter(f => f.text.startsWith('track2'));
      expect(mainTrackFragments).toHaveLength(3);
    });

    it('should use marker count as tiebreaker when event counts are equal', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'plain text' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'text/with/markers' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Both tracks have 1 event, but track 2 has markers so it's selected as main
      expect(result).toHaveLength(2);
      // Slashes are removed entirely
      expect(result[1].text).toBe('textwithmarkers');
    });

    it('should count zero-width space as marker', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'plain' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'with​marker' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Track 2 is selected as main due to zero-width space marker
      expect(result).toHaveLength(2);
      expect(result[1].text).toBe('withmarker');
    });

    it('should use total text length as third tiebreaker', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'short' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'much longer text here' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Track 2 selected as main due to longer text
      expect(result).toHaveLength(2);
      expect(result[1].text).toBe('much longer text here');
    });

    it('should use track ID as final tiebreaker', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'track1' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 5,
          segs: [{ utf8: 'track5' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Track 5 selected as main due to higher ID
      expect(result).toHaveLength(2);
      expect(result[1].text).toBe('track5');
    });

    it('should skip events with no wpWinPosId during selection', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'no track' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'has track' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('has track');
    });

    it('should skip events with empty text after cleaning during selection', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: '   ' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'valid' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('valid');
    });
  });

  describe('text cleaning', () => {
    it('should remove zero-width spaces', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Hello​World​Test' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0].text).toBe('HelloWorldTest');
    });

    it('should remove forward slashes', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Hello/World/Test' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0].text).toBe('HelloWorldTest');
    });

    it('should normalize multiple whitespaces to single space', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Hello    World  Test' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0].text).toBe('Hello World Test');
    });

    it('should trim leading and trailing whitespace', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: '  Test  ' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0].text).toBe('Test');
    });

    it('should clean all markers in one pass', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: '  Hello​/World  /​Test  ' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Zero-width spaces and slashes removed, whitespace normalized
      expect(result[0].text).toBe('HelloWorld Test');
    });
  });

  describe('sentence family merging', () => {
    it('should merge identical text within time window', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Same text' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Same text' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Same text' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: 'Same text', start: 0, end: 1500 });
    });

    it('should merge progressive text (prefix match)', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Hello world' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Hello world today' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello world today');
    });

    it('should not merge if time gap exceeds 1200ms', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'First' }]
        },
        {
          tStartMs: 1500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'First' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
    });

    it('should not merge if prefix is shorter than 10 characters', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Short' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Short text here' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
    });

    it('should replace with longer text in same family', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'A very long prefix text here' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'A very long prefix text here with more' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('A very long prefix text here with more');
    });

    it('should keep shorter text if next text is shorter', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Long text here with content' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Long text here with content' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Long text here with content');
    });

    it('should use case-insensitive comparison for family matching', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'Hello World Test' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: 'HELLO WORLD TEST' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
    });
  });

  describe('timing adjustments', () => {
    it('should adjust previous fragment end time to prevent overlap', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'First' }]
        },
        {
          tStartMs: 1500,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Second' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0]).toEqual({ text: 'First', start: 0, end: 1500 });
      expect(result[1]).toEqual({ text: 'Second', start: 1500, end: 3500 });
    });

    it('should not adjust when fragments do not overlap', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'First' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Second' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0]).toEqual({ text: 'First', start: 0, end: 1000 });
      expect(result[1]).toEqual({ text: 'Second', start: 2000, end: 3000 });
    });
  });

  describe('off-track merging', () => {
    it('should include non-overlapping off-track events', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'main' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'off-track' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('main');
      expect(result[1].text).toBe('off-track');
    });

    it('should exclude off-track events that overlap with main track', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 2,
          segs: [{ utf8: 'main track with more text' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'overlapping' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('main track with more text');
    });

    it('should handle partial overlap (exclude off-track)', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1500,
          wpWinPosId: 2,
          segs: [{ utf8: 'main track text here' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'partial overlap' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('main track text here');
    });

    it('should merge off-track events into sentence families', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'main' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 500,
          wpWinPosId: 2,
          segs: [{ utf8: 'off-track text' }]
        },
        {
          tStartMs: 2500,
          dDurationMs: 500,
          wpWinPosId: 2,
          segs: [{ utf8: 'off-track text' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({ text: 'off-track text', start: 2000, end: 3000 });
    });

    it('should sort merged main and off-track fragments by start time', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'main 1' }]
        },
        {
          tStartMs: 5000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'off 2' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'main 2' }]
        },
        {
          tStartMs: 7000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: 'off 3' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result.map(f => f.text)).toEqual(['main 1', 'main 2', 'off 2', 'off 3']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty events array', () => {
      const result = parseStylizedKaraokeSubtitles([]);

      expect(result).toEqual([]);
    });

    it('should handle all events without wpWinPosId', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'No track' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle event with empty segs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: []
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle event with undefined segs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle missing dDurationMs', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Text' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0]).toEqual({ text: 'Text', start: 1000, end: 1000 });
    });

    it('should handle segment with undefined utf8', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: undefined as any }, { utf8: 'Valid' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result[0].text).toBe('Valid');
    });

    it('should skip off-track events with empty text after cleaning', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          wpWinPosId: 1,
          segs: [{ utf8: 'main' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: '   ' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('main');
    });
  });

  describe('real-world scenarios', () => {
    it('should handle stylized Japanese karaoke with progressive reveal', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: '君​と​見​た' }]
        },
        {
          tStartMs: 500,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: '君​と​見​た​夢' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 500,
          wpWinPosId: 1,
          segs: [{ utf8: '君​と​見​た​夢​を' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Short texts (<10 chars) won't merge via prefix matching, so each becomes separate
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('君と見た');
      expect(result[1].text).toBe('君と見た夢');
      expect(result[2].text).toBe('君と見た夢を');
    });

    it('should handle multi-track with romaji and kanji', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'ki/mi/to' }]
        },
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 2,
          segs: [{ utf8: '君​と​見​た' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'yu/me/wo' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 2000,
          wpWinPosId: 2,
          segs: [{ utf8: '夢​を​忘​れ​ない' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      // Track 1 selected as main (both have 2 events and 2 markers, but track 1 has more text)
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('kimito');
      expect(result[1].text).toBe('yumewo');
    });

    it('should handle background vocals in non-overlapping sections', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'Main vocals' }]
        },
        {
          tStartMs: 3000,
          dDurationMs: 1000,
          wpWinPosId: 2,
          segs: [{ utf8: '(Background)' }]
        },
        {
          tStartMs: 5000,
          dDurationMs: 2000,
          wpWinPosId: 1,
          segs: [{ utf8: 'More main vocals' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Main vocals');
      expect(result[1].text).toBe('(Background)');
      expect(result[2].text).toBe('More main vocals');
    });

    it('should handle complex progressive text with markers', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 300,
          wpWinPosId: 1,
          segs: [{ utf8: 'This/is/a/long/sentence' }]
        },
        {
          tStartMs: 300,
          dDurationMs: 300,
          wpWinPosId: 1,
          segs: [{ utf8: 'This/is/a/long/sentence/with' }]
        },
        {
          tStartMs: 600,
          dDurationMs: 300,
          wpWinPosId: 1,
          segs: [{ utf8: 'This/is/a/long/sentence/with/more' }]
        }
      ];

      const result = parseStylizedKaraokeSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Thisisalongsentencewithmore');
      expect(result[0].end).toBe(900);
    });
  });
});
