import { describe, it, expect } from 'vitest';
import { normalizeFragments } from '../../parsers/utils';
import type { SubtitleFragment } from '../../utils/types';

describe('normalizeFragments', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty input', () => {
      const result = normalizeFragments([]);

      expect(result).toEqual([]);
    });

    it('should return single fragment unchanged', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Hello', start: 0, end: 1000 }
      ]);
    });

    it('should keep different text fragments separate', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'World', start: 1000, end: 2000 },
        { text: 'There', start: 2000, end: 3000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'World', start: 1000, end: 2000 },
        { text: 'There', start: 2000, end: 3000 }
      ]);
    });
  });

  describe('merging adjacent identical text', () => {
    it('should merge two adjacent fragments with identical text', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'Hello', start: 1000, end: 2000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Hello', start: 0, end: 2000 }
      ]);
    });

    it('should merge multiple consecutive fragments with identical text', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'Hello', start: 1000, end: 2000 },
        { text: 'Hello', start: 2000, end: 3000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Hello', start: 0, end: 3000 }
      ]);
    });

    it('should handle multiple groups of identical text', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'Hello', start: 1000, end: 2000 },
        { text: 'World', start: 2000, end: 3000 },
        { text: 'World', start: 3000, end: 4000 },
        { text: 'Goodbye', start: 4000, end: 5000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Hello', start: 0, end: 2000 },
        { text: 'World', start: 2000, end: 4000 },
        { text: 'Goodbye', start: 4000, end: 5000 }
      ]);
    });

    it('should handle alternating text correctly', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'A', start: 0, end: 1000 },
        { text: 'B', start: 1000, end: 2000 },
        { text: 'A', start: 2000, end: 3000 },
        { text: 'B', start: 3000, end: 4000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'A', start: 0, end: 1000 },
        { text: 'B', start: 1000, end: 2000 },
        { text: 'A', start: 2000, end: 3000 },
        { text: 'B', start: 3000, end: 4000 }
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle fragments with empty text', () => {
      const fragments: SubtitleFragment[] = [
        { text: '', start: 0, end: 1000 },
        { text: '', start: 1000, end: 2000 },
        { text: 'Hello', start: 2000, end: 3000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: '', start: 0, end: 2000 },
        { text: 'Hello', start: 2000, end: 3000 }
      ]);
    });

    it('should treat whitespace variations as different', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'Hello ', start: 1000, end: 2000 },
        { text: ' Hello', start: 2000, end: 3000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'Hello ', start: 1000, end: 2000 },
        { text: ' Hello', start: 2000, end: 3000 }
      ]);
    });

    it('should be case-sensitive', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'hello', start: 1000, end: 2000 },
        { text: 'HELLO', start: 2000, end: 3000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'hello', start: 1000, end: 2000 },
        { text: 'HELLO', start: 2000, end: 3000 }
      ]);
    });

    it('should not mutate original array', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'Hello', start: 1000, end: 2000 }
      ];

      const original = JSON.parse(JSON.stringify(fragments));
      normalizeFragments(fragments);

      expect(fragments).toEqual(original);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle karaoke-style repeated phrases', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'La la la', start: 0, end: 1000 },
        { text: 'La la la', start: 1000, end: 2000 },
        { text: 'La la la', start: 2000, end: 3000 },
        { text: 'Oh yeah', start: 3000, end: 4000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'La la la', start: 0, end: 3000 },
        { text: 'Oh yeah', start: 3000, end: 4000 }
      ]);
    });

    it('should handle animated subtitles with repeated frames', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Loading...', start: 0, end: 500 },
        { text: 'Loading...', start: 500, end: 1000 },
        { text: 'Loading...', start: 1000, end: 1500 },
        { text: 'Loading...', start: 1500, end: 2000 },
        { text: 'Done!', start: 2000, end: 3000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Loading...', start: 0, end: 2000 },
        { text: 'Done!', start: 2000, end: 3000 }
      ]);
    });

    it('should handle subtitle corrections where same text appears twice', () => {
      const fragments: SubtitleFragment[] = [
        { text: 'Welcome back', start: 0, end: 2000 },
        { text: 'to the show', start: 2000, end: 4000 },
        { text: 'to the show', start: 4000, end: 5000 },
        { text: 'everyone', start: 5000, end: 6000 }
      ];

      const result = normalizeFragments(fragments);

      expect(result).toEqual([
        { text: 'Welcome back', start: 0, end: 2000 },
        { text: 'to the show', start: 2000, end: 5000 },
        { text: 'everyone', start: 5000, end: 6000 }
      ]);
    });
  });
});
