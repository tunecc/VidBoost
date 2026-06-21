import { describe, it, expect } from 'vitest';
import { parseAnimatedSubtitles } from '../../parsers/animated';
import type { TimedTextEvent } from '../../utils/types';

describe('parseAnimatedSubtitles', () => {
  it('should parse basic animated subtitle events', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 2000,
        segs: [{ utf8: 'Hello' }]
      },
      {
        tStartMs: 2000,
        dDurationMs: 2000,
        segs: [{ utf8: 'World' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'Hello', start: 0, end: 2000 },
      { text: 'World', start: 2000, end: 4000 }
    ]);
  });

  it('should merge consecutive events with identical text', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: 'Same text' }]
      },
      {
        tStartMs: 1000,
        dDurationMs: 1000,
        segs: [{ utf8: 'Same text' }]
      },
      {
        tStartMs: 2000,
        dDurationMs: 1000,
        segs: [{ utf8: 'Same text' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'Same text', start: 0, end: 3000 }
    ]);
  });

  it('should concatenate multiple segments within an event', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 2000,
        segs: [
          { utf8: 'Hello' },
          { utf8: ' ' },
          { utf8: 'World' }
        ]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'Hello World', start: 0, end: 2000 }
    ]);
  });

  it('should remove zero-width spaces', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: 'Hello​World' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'HelloWorld', start: 0, end: 1000 }
    ]);
  });

  it('should normalize whitespace', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: 'Hello   \n\t  World' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'Hello World', start: 0, end: 1000 }
    ]);
  });

  it('should skip empty events', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: 'Text' }]
      },
      {
        tStartMs: 1000,
        dDurationMs: 1000,
        segs: [{ utf8: '' }]
      },
      {
        tStartMs: 2000,
        dDurationMs: 1000,
        segs: [{ utf8: '   ' }]
      },
      {
        tStartMs: 3000,
        dDurationMs: 1000,
        segs: [{ utf8: 'More text' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'Text', start: 0, end: 1000 },
      { text: 'More text', start: 3000, end: 4000 }
    ]);
  });

  it('should handle events without segments', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: 'Text' }]
      },
      {
        tStartMs: 1000,
        dDurationMs: 1000
      },
      {
        tStartMs: 2000,
        dDurationMs: 1000,
        segs: []
      },
      {
        tStartMs: 3000,
        dDurationMs: 1000,
        segs: [{ utf8: 'More' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'Text', start: 0, end: 1000 },
      { text: 'More', start: 3000, end: 4000 }
    ]);
  });

  it('should fix overlapping end times', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        dDurationMs: 2000,
        segs: [{ utf8: 'First' }]
      },
      {
        tStartMs: 1500,
        dDurationMs: 2000,
        segs: [{ utf8: 'Second' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'First', start: 0, end: 1500 },
      { text: 'Second', start: 1500, end: 3500 }
    ]);
  });

  it('should handle events without duration', () => {
    const events: TimedTextEvent[] = [
      {
        tStartMs: 0,
        segs: [{ utf8: 'No duration' }]
      }
    ];

    const result = parseAnimatedSubtitles(events);

    expect(result).toEqual([
      { text: 'No duration', start: 0, end: 0 }
    ]);
  });

  it('should return empty array for empty input', () => {
    const result = parseAnimatedSubtitles([]);

    expect(result).toEqual([]);
  });
});
