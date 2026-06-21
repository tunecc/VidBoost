import type { SubtitleFragment } from '../utils/types';

/**
 * Normalize fragments by merging adjacent fragments with identical text
 * This is commonly needed after parsing subtitles where the same text
 * appears in consecutive time windows.
 */
export function normalizeFragments(fragments: SubtitleFragment[]): SubtitleFragment[] {
  if (fragments.length === 0) {
    return [];
  }

  const result: SubtitleFragment[] = [];

  for (const fragment of fragments) {
    const last = result[result.length - 1];

    if (last && last.text === fragment.text) {
      // Merge with previous fragment by extending end time
      last.end = fragment.end;
    } else {
      // Add as new fragment
      result.push({ ...fragment });
    }
  }

  return result;
}
