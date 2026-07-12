/**
 * ASR refine (Scheme B+) tests
 */

import { describe, it, expect } from 'vitest';
import type { SubtitleFragment } from '../../utils/types';
import {
  mergeAsrFragments,
  isPunctuationPoor,
  splitFragmentBySentencePunctuation,
  splitBySentencePunctuation,
  refineAsrFragments,
} from '../asr-merge';

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe('isPunctuationPoor', () => {
  it('detects unpunctuated ASR', () => {
    const input: SubtitleFragment[] = Array.from({ length: 10 }, (_, i) => ({
      text: `word${i} more text here`,
      start: i * 1000,
      end: i * 1000 + 800,
    }));
    expect(isPunctuationPoor(input)).toBe(true);
  });

  it('detects punctuated ASR', () => {
    const input: SubtitleFragment[] = [
      { text: 'Hello, guys.', start: 0, end: 1000 },
      { text: 'It is January 1st today.', start: 1000, end: 2000 },
      { text: 'Happy New Year!', start: 2000, end: 3000 },
      { text: "I'm heading to the airport.", start: 3000, end: 4000 },
      { text: 'This is great.', start: 4000, end: 5000 },
    ];
    expect(isPunctuationPoor(input)).toBe(false);
  });
});

describe('splitFragmentBySentencePunctuation', () => {
  it('splits multi-sentence cue on period', () => {
    const frag: SubtitleFragment = {
      text: "to the airport. I'm flying to Korea",
      start: 1000,
      end: 3000,
    };
    const result = splitFragmentBySentencePunctuation(frag);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('to the airport.');
    expect(result[1].text).toBe("I'm flying to Korea");
    expect(result[0].start).toBe(1000);
    expect(result[1].end).toBe(3000);
    expect(result[0].end).toBe(result[1].start);
  });

  it('splits three sentences', () => {
    const frag: SubtitleFragment = {
      text: 'Hello. How are you? Fine!',
      start: 0,
      end: 3000,
    };
    const result = splitFragmentBySentencePunctuation(frag);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.text)).toEqual(['Hello.', 'How are you?', 'Fine!']);
  });

  it('does not split a.m. abbreviation', () => {
    const frag: SubtitleFragment = {
      text: "It's currently 8:42 a.m. and I'm heading",
      start: 0,
      end: 2000,
    };
    const result = splitFragmentBySentencePunctuation(frag);
    // Should stay one piece (a.m. is abbreviation)
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('a.m.');
  });

  it('does not split when only trailing punctuation', () => {
    const frag: SubtitleFragment = {
      text: "I'm flying to Korea today.",
      start: 0,
      end: 1000,
    };
    const result = splitFragmentBySentencePunctuation(frag);
    expect(result).toHaveLength(1);
  });

  it('leaves noise tags alone', () => {
    const frag: SubtitleFragment = {
      text: '[Music]',
      start: 0,
      end: 1000,
    };
    expect(splitFragmentBySentencePunctuation(frag)).toEqual([frag]);
  });
});

describe('refineAsrFragments punctuated (sample 2 style)', () => {
  it('produces one-sentence-ish cues from sticky multi-sentence ASR', () => {
    const input: SubtitleFragment[] = [
      { text: "It's currently 8:42 a.m. and I'm heading", start: 40960, end: 44320 },
      { text: "to the airport. I'm flying to Korea", start: 44320, end: 46560 },
      { text: "today. This time around, I'm going to", start: 46560, end: 48000 },
      { text: 'Korea for family and work related', start: 48000, end: 50320 },
      { text: "things. Every January, it's actually my", start: 50320, end: 52320 },
    ];

    const result = refineAsrFragments(input, 'en');

    // Should not keep "airport. I'm flying" glued in one cue
    const glued = result.some(r => /airport\.\s+I/i.test(r.text));
    expect(glued).toBe(false);

    // Should contain a clean airport sentence boundary somewhere
    const joined = result.map(r => r.text).join(' || ');
    expect(joined).toMatch(/airport\./i);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps complete sentences from being glued after split', () => {
    const input: SubtitleFragment[] = [
      { text: 'Hello guys. It is January first.', start: 0, end: 2000 },
      { text: 'Happy New Year. I cannot believe it.', start: 2000, end: 4000 },
    ];
    const result = refineAsrFragments(input, 'en');
    // After split we get 4 sentences; merge should not re-glue across strong ends
    expect(result.every(r => /[.!?]$/.test(r.text.trim()) || words(r.text) <= 18)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

describe('refineAsrFragments unpunctuated (sample 1 style)', () => {
  it('merges continuous mid-phrase splits more aggressively', () => {
    const input: SubtitleFragment[] = [
      { text: 'also my hair got so', start: 4800, end: 6380 },
      { text: 'long need to get my', start: 15640, end: 19279 },
      { text: 'hair thank you to Lucan for sponsoring', start: 26560, end: 28920 },
      { text: 'this video all items throughout this', start: 28920, end: 30679 },
      { text: 'video will be linked in my description', start: 30679, end: 32160 },
      { text: 'box down', start: 32160, end: 34490 },
      { text: 'below today I\'m meeting up with Julia', start: 38680, end: 41000 },
    ];

    const result = refineAsrFragments(input, 'en');

    expect(result[0].text).toBe('also my hair got so'); // large gap
    expect(result[1].text).toBe('long need to get my');

    // Continuous block should be fewer cues
    const continuous = result.filter(r => r.start >= 26560);
    expect(continuous.length).toBeLessThan(5);
    expect(continuous.some(r => r.text.includes('description') && r.text.includes('box'))).toBe(
      true
    );
  });

  it('merges incomplete tails across zero-gap cues', () => {
    const input: SubtitleFragment[] = [
      { text: "now I desperately need a haircut I'm", start: 49280, end: 50760 },
      { text: 'going to be getting one in the next few', start: 50760, end: 52039 },
      { text: "days but anyways let's head", start: 52039, end: 55399 },
    ];

    const result = refineAsrFragments(input, 'en');
    expect(result.length).toBeLessThan(input.length);
    expect(result.map(r => r.text).join(' ')).toContain("I'm going to be getting");
  });

  it('breaks on pause words when buffer has content', () => {
    const input: SubtitleFragment[] = [
      { text: 'this is my outfit for today', start: 0, end: 2000 },
      { text: 'also my hair got so long', start: 2000, end: 4000 },
    ];
    const result = refineAsrFragments(input, 'en');
    expect(result).toHaveLength(2);
  });
});

describe('CJK weak pause prefixes', () => {
  it('breaks before Chinese discourse markers when current cue is long enough', () => {
    const input: SubtitleFragment[] = [
      { text: '这件事其实并不复杂', start: 0, end: 1500 },
      { text: '所以我们先看背景', start: 1500, end: 3000 },
      { text: '然后讲具体做法', start: 3000, end: 4500 },
    ];
    const result = refineAsrFragments(input, 'zh-CN');
    expect(result.map(r => r.text)).toEqual([
      '这件事其实并不复杂',
      '所以我们先看背景',
      '然后讲具体做法',
    ]);
  });

  it('does not break on CJK pause prefix when current cue is still very short', () => {
    // "就是" is a pause prefix, but current length < 8 chars → keep merging
    const input: SubtitleFragment[] = [
      { text: '一个东西', start: 0, end: 800 },
      { text: '就是很重要', start: 800, end: 1600 },
    ];
    const result = refineAsrFragments(input, 'zh-CN');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('一个东西就是很重要');
  });

  it('matches longer CJK prefixes before shorter ones', () => {
    const input: SubtitleFragment[] = [
      { text: '前面讲了很多细节内容', start: 0, end: 1800 },
      { text: '也就是说核心只有一点', start: 1800, end: 3600 },
    ];
    const result = refineAsrFragments(input, 'zh-CN');
    expect(result).toHaveLength(2);
    expect(result[1].text.startsWith('也就是说')).toBe(true);
  });
});

describe('guards', () => {
  it('never merges across large gaps', () => {
    const input: SubtitleFragment[] = [
      { text: 'hello there friends today', start: 0, end: 1000 },
      { text: 'much later now here', start: 5000, end: 6000 },
    ];
    expect(refineAsrFragments(input, 'en')).toHaveLength(2);
  });

  it('keeps noise tags standalone', () => {
    const input: SubtitleFragment[] = [
      { text: 'hello world today friends', start: 0, end: 1000 },
      { text: '[Music]', start: 1000, end: 2000 },
      { text: 'next phrase here now', start: 2000, end: 3000 },
    ];
    const result = refineAsrFragments(input, 'en');
    expect(result.some(r => r.text === '[Music]')).toBe(true);
  });

  it('returns empty for empty input', () => {
    expect(refineAsrFragments([], 'en')).toEqual([]);
  });

  it('preserves start of first and end of last when merging', () => {
    const input: SubtitleFragment[] = [
      { text: 'hello my dear friend', start: 100, end: 500 },
      { text: 'how are you today', start: 500, end: 900 },
    ];
    const result = refineAsrFragments(input, 'en');
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(100);
    expect(result[0].end).toBe(900);
  });
});

describe('CJK', () => {
  it('merges short Chinese fragments without spaces', () => {
    const input: SubtitleFragment[] = [
      { text: '大家好欢迎', start: 0, end: 1000 },
      { text: '来到我的频道', start: 1000, end: 2000 },
    ];
    const result = refineAsrFragments(input, 'zh-CN');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('大家好欢迎来到我的频道');
  });
});

describe('mergeAsrFragments still works standalone', () => {
  it('respects max duration', () => {
    const input: SubtitleFragment[] = [
      { text: 'one two three four five', start: 0, end: 4000 },
      { text: 'six seven eight nine ten', start: 4000, end: 8000 },
    ];
    const result = mergeAsrFragments(input, 'en');
    expect(result).toHaveLength(2);
  });
});
