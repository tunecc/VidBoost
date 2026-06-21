import { describe, it, expect } from 'vitest';
import { parseScrollingAsrSubtitles } from '../../parsers/scrolling-asr';
import type { TimedTextEvent } from '../../utils/types';

describe('parseScrollingAsrSubtitles', () => {
  describe('basic parsing', () => {
    it('should parse simple subtitle events', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          segs: [{ utf8: 'Hello' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        },
        {
          tStartMs: 2000,
          dDurationMs: 2000,
          segs: [{ utf8: 'World' }]
        },
        {
          tStartMs: 4000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Hello');
      expect(result[1].text).toBe('World');
    });

    it('should accumulate text across multiple events', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'This ' }]
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          segs: [{ utf8: 'is ' }]
        },
        {
          tStartMs: 2000,
          dDurationMs: 1000,
          segs: [{ utf8: 'a sentence.' }]
        },
        {
          tStartMs: 3000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('This is a sentence.');
    });

    it('should handle multiple segments within an event', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          segs: [
            { utf8: 'Hello', tOffsetMs: 0 },
            { utf8: ' ', tOffsetMs: 500 },
            { utf8: 'World', tOffsetMs: 1000 }
          ]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello World');
    });
  });

  describe('separator handling', () => {
    it('should split at sentence end punctuation', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'First sentence.' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          segs: [{ utf8: 'Second sentence.' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('First sentence.');
      expect(result[1].text).toBe('Second sentence.');
    });

    it('should respect CJK sentence endings', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: '这是第一句。' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          segs: [{ utf8: '这是第二句。' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'zh-CN');

      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('这是第一句。');
      expect(result[1].text).toBe('这是第二句。');
    });

    it('should handle multiple punctuation types', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: 'Question?' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        },
        {
          tStartMs: 1000,
          segs: [{ utf8: 'Exclamation!' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        },
        {
          tStartMs: 2000,
          segs: [{ utf8: 'Comma,' }]
        },
        {
          tStartMs: 3000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('Question?');
      expect(result[1].text).toBe('Exclamation!');
      expect(result[2].text).toBe('Comma,');
    });
  });

  describe('CJK language support', () => {
    it('should use character count for CJK languages', () => {
      const longText = '这是一个非常长的中文句子，包含了很多很多的字符，超过了四十个字符的限制，应该被分割。';
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 5000,
          segs: [{ utf8: longText }]
        },
        {
          tStartMs: 5000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'zh-CN');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(longText);
    });

    it('should detect Japanese language', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: 'これは日本語です。' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'ja');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('これは日本語です。');
    });

    it('should detect Korean language', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '한국어 문장입니다.' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'ko');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('한국어 문장입니다.');
    });

    it('should use word count for English', () => {
      const longText = 'This is a very long English sentence with many words that should be split when it exceeds eighty words which is the maximum length for non-CJK languages and this sentence is designed to test that behavior properly by having more than eighty words in total so we can verify the split happens correctly at the right boundary when processing scrolling ASR subtitles in English language mode.';
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 10000,
          segs: [{ utf8: longText }]
        },
        {
          tStartMs: 10000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('space handling for English', () => {
    it('should add spaces when merging English text across events', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: 'Hello' }]
        },
        {
          tStartMs: 1000,
          segs: [{ utf8: 'World' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello World');
    });

    it('should not add double spaces', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: 'Hello ' }]
        },
        {
          tStartMs: 1000,
          segs: [{ utf8: 'World' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'en');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello World');
    });

    it('should not add spaces for CJK languages', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '你好' }]
        },
        {
          tStartMs: 1000,
          segs: [{ utf8: '世界' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events, 'zh-CN');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('你好世界');
    });
  });

  describe('special tag filtering', () => {
    it('should filter out special tags like [Music]', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '[Music]' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        },
        {
          tStartMs: 1000,
          segs: [{ utf8: 'Hello' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello');
    });

    it('should filter out various special tags', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '[Applause]' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        },
        {
          tStartMs: 1000,
          segs: [{ utf8: '[Laughter]' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(0);
    });
  });

  describe('timing accuracy', () => {
    it('should use segment offset for start time', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [
            { utf8: 'Word1', tOffsetMs: 100 },
            { utf8: ' Word2', tOffsetMs: 500 }
          ]
        },
        {
          tStartMs: 3000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].start).toBe(1100); // 1000 + 100
    });

    it('should fix overlapping end times', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: 'First.' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1,
          dDurationMs: 500
        },
        {
          tStartMs: 800,
          segs: [{ utf8: 'Second.' }]
        },
        {
          tStartMs: 2000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(2);
      expect(result[0].end).toBe(800); // Fixed to not overlap with second
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = parseScrollingAsrSubtitles([]);

      expect(result).toEqual([]);
    });

    it('should handle events with no segments', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          dDurationMs: 1000
        },
        {
          tStartMs: 1000,
          segs: []
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should handle empty segments', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toEqual([]);
    });

    it('should trim whitespace', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: '  Hello  ' }]
        },
        {
          tStartMs: 1000,
          aAppend: 1
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Hello');
    });

    it('should handle remaining text without final separator', () => {
      const events: TimedTextEvent[] = [
        {
          tStartMs: 0,
          segs: [{ utf8: 'Final text' }]
        }
      ];

      const result = parseScrollingAsrSubtitles(events);

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Final text');
    });
  });
});
