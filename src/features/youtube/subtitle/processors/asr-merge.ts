/**
 * ASR fragment refiner (Scheme B+)
 *
 * Goal: make auto-generated captions read as complete short sentences/phrases
 * while keeping timing roughly aligned to YouTube timedtext.
 *
 * Pipeline:
 *   1) Detect punctuated vs unpunctuated ASR
 *   2) If punctuated: split cues that contain mid-text sentence endings
 *   3) Merge adjacent fragments more aggressively (never re-cut arbitrarily
 *      except the explicit sentence split above)
 */

import type { SubtitleFragment } from '../utils/types';
import { isCJKLanguage, getTextLength } from './subtitle-utils';

/** Max gap between adjacent cues to consider them continuous (ms) */
const MAX_MERGE_GAP_MS = 300;

/** Max combined duration after merge (ms) — B+ raised from 5500 */
const MAX_MERGED_DURATION_MS = 7000;

/** Soft max length after merge (words for non-CJK, chars for CJK) — B+ raised from 14 */
const MAX_MERGED_LENGTH_NON_CJK = 18;
const MAX_MERGED_LENGTH_CJK = 32;

/** Extra words/chars allowed when previous cue has an incomplete tail */
const INCOMPLETE_TAIL_OVERFLOW = 4;

/** Strong sentence endings */
const STRONG_END_PATTERN = /[.!?。！？…]$/;

/** Weak endings — secondary break when already reasonably long */
const WEAK_END_PATTERN = /[,;，；]$/;

/** Trailing punctuation (cue ends a clause/sentence) */
const TRAILING_PUNCTUATION_PATTERN = /[.!?,;。！？，；]$/;

/** Any strong sentence punctuation present in the text (including mid-cue) */
const ANY_STRONG_PUNCTUATION_PATTERN = /[.!?。！？]/;

/** Noise / special markers that must stay alone */
const SIGN_PATTERN = /^[[(♪]/;

/**
 * Mask common abbreviations so their periods are not treated as sentence ends.
 */
const ABBREVIATION_MASK_PATTERN = /\b(?:[ap]\.m\.|mr\.|mrs\.|ms\.|dr\.|prof\.|sr\.|jr\.|vs\.|etc\.|e\.g\.|i\.e\.)/gi;

/**
 * Strong sentence boundary for splitting multi-sentence cues.
 * Decimals like 3.14 are protected by digit lookaround.
 */
const INTERNAL_SENTENCE_BOUNDARY = /(?<!\d)([.!?。！？])(?!\d)(?!\s*$)/g;

const PAUSE_WORDS = new Set([
  'actually',
  'also',
  'although',
  'anyway',
  'basically',
  'because',
  'but',
  'eventually',
  'frankly',
  'honestly',
  'hopefully',
  'however',
  'instead',
  'meanwhile',
  'nevertheless',
  'nonetheless',
  'now',
  'okay',
  'otherwise',
  'perhaps',
  'personally',
  'probably',
  'right',
  'since',
  'so',
  'suddenly',
  'then',
  'therefore',
  'though',
  'thus',
  'unless',
  'until',
  'well',
  'while',
  'today',
  'tomorrow',
  'yesterday',
]);

/**
 * CJK discourse markers / weak break prefixes.
 * Checked with startsWith (longest first) because Chinese cues have no spaces.
 * Prefer clause-level connectors over ultra-common particles to avoid over-splitting.
 */
const CJK_PAUSE_PREFIXES = [
  '也就是说',
  '换句话说',
  '比如说',
  '总而言之',
  '另一方面',
  '首先',
  '其次',
  '最后',
  '然后',
  '所以',
  '但是',
  '可是',
  '不过',
  '因为',
  '因此',
  '如果',
  '虽然',
  '其实',
  '那么',
  '而且',
  '另外',
  '后来',
  '比如',
  '就是',
  '还有',
  '总之',
].sort((a, b) => b.length - a.length);

/** Min current length before allowing a CJK weak break (chars) */
const CJK_PAUSE_MIN_CURRENT = 8;

const INCOMPLETE_TAIL_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'and',
  'or',
  'but',
  'my',
  'your',
  'our',
  'their',
  'his',
  'her',
  'its',
  "i'm",
  "i've",
  "i'll",
  "we're",
  "we've",
  "we'll",
  "you're",
  "you've",
  "they're",
  'this',
  'that',
  'these',
  'those',
  'so',
  'very',
  'really',
  'just',
  'like',
  'got',
  'get',
  'need',
  'want',
  'going',
  'gonna',
  'down',
  'up',
  'out',
  'into',
  'from',
  'by',
  'as',
  'if',
  'when',
  'while',
  'about',
  'over',
  'after',
  'before',
  'than',
  'then',
]);

function isSign(text: string): boolean {
  return SIGN_PATTERN.test(text.trim());
}

function isNoiseTag(text: string): boolean {
  const t = text.trim();
  return (t.startsWith('[') && t.endsWith(']')) || (t.startsWith('(') && t.endsWith(')'));
}

function getFirstWord(text: string): string {
  return text.toLowerCase().trim().split(/\s+/)[0] || '';
}

function getLastWord(text: string): string {
  const parts = text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function stripTrailingPunct(word: string): string {
  return word.replace(/[,.!?;:]+$/g, '');
}

function hasIncompleteTail(text: string): boolean {
  const last = stripTrailingPunct(getLastWord(text));
  return INCOMPLETE_TAIL_WORDS.has(last);
}

/**
 * True if <5% of fragments end with punctuation (typical raw English ASR).
 */
export function isPunctuationPoor(fragments: SubtitleFragment[]): boolean {
  const candidates = fragments.filter(f => f.text && !isNoiseTag(f.text) && !isSign(f.text));
  if (candidates.length === 0) {
    return true;
  }

  // Count cues that contain strong sentence punctuation anywhere (not only at end).
  // YouTube ASR often places "." mid-cue: "to the airport. I'm flying..."
  const withStrong = candidates.filter(f =>
    ANY_STRONG_PUNCTUATION_PATTERN.test(f.text)
  ).length;

  // Also count trailing clause punctuation as a secondary signal
  const withTrailing = candidates.filter(f =>
    TRAILING_PUNCTUATION_PATTERN.test(f.text.trim())
  ).length;

  const ratio = Math.max(withStrong, withTrailing) / candidates.length;

  // If at least 15% of cues show sentence punctuation, treat as punctuated ASR
  if (candidates.length < 5) {
    return withStrong === 0 && withTrailing === 0;
  }
  return ratio < 0.15;
}

function joinText(left: string, right: string, isCJK: boolean): string {
  if (isCJK) {
    return `${left}${right}`.replace(/\s+/g, '').trim();
  }
  const needsSpace = !left.endsWith(' ') && !right.startsWith(' ');
  return (needsSpace ? `${left} ${right}` : `${left}${right}`).replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Split a single fragment on internal strong sentence boundaries.
 * Timestamps are distributed by word-count ratio.
 */
export function splitFragmentBySentencePunctuation(
  fragment: SubtitleFragment
): SubtitleFragment[] {
  const text = fragment.text.trim();
  if (!text || isNoiseTag(text) || isSign(text)) {
    return [{ ...fragment, text }];
  }

  // Mask abbreviations so their periods never count as boundaries
  const masked = text.replace(ABBREVIATION_MASK_PATTERN, (m) => m.replace(/\./g, '\u0000'));

  // Find split indices (position AFTER the punctuation char) on masked text
  const splitEnds: number[] = [];
  const re = new RegExp(INTERNAL_SENTENCE_BOUNDARY.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(masked)) !== null) {
    const endIdx = match.index + match[0].length;
    // Need remaining non-space content after boundary
    if (masked.slice(endIdx).replace(/\u0000/g, '.').trim().length === 0) {
      continue;
    }
    splitEnds.push(endIdx);
  }

  if (splitEnds.length === 0) {
    return [{ text, start: fragment.start, end: fragment.end }];
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const endIdx of splitEnds) {
    const part = text.slice(cursor, endIdx).trim();
    if (part) parts.push(part);
    cursor = endIdx;
  }
  const tail = text.slice(cursor).trim();
  if (tail) parts.push(tail);

  if (parts.length <= 1) {
    return [{ text, start: fragment.start, end: fragment.end }];
  }

  const totalWords = parts.reduce((sum, p) => sum + Math.max(wordCount(p), 1), 0);
  const duration = Math.max(fragment.end - fragment.start, parts.length);
  let t = fragment.start;
  const result: SubtitleFragment[] = [];

  for (let i = 0; i < parts.length; i++) {
    const w = Math.max(wordCount(parts[i]), 1);
    const isLast = i === parts.length - 1;
    const slice = isLast
      ? fragment.end - t
      : Math.max(1, Math.round((duration * w) / totalWords));
    const end = isLast ? fragment.end : Math.min(fragment.end, t + slice);
    result.push({ text: parts[i], start: t, end: Math.max(end, t + 1) });
    t = end;
  }

  return result;
}

/**
 * Split all fragments that contain multiple sentences (punctuated ASR only).
 */
export function splitBySentencePunctuation(
  fragments: SubtitleFragment[]
): SubtitleFragment[] {
  const out: SubtitleFragment[] = [];
  for (const frag of fragments) {
    out.push(...splitFragmentBySentencePunctuation(frag));
  }
  // Fix accidental overlaps from rounding
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1].end > out[i].start) {
      out[i - 1] = { ...out[i - 1], end: out[i].start };
    }
  }
  return out;
}

function maxMergedLength(isCJK: boolean, allowIncompleteOverflow: boolean): number {
  const base = isCJK ? MAX_MERGED_LENGTH_CJK : MAX_MERGED_LENGTH_NON_CJK;
  return allowIncompleteOverflow ? base + INCOMPLETE_TAIL_OVERFLOW : base;
}

function canMergeByLimits(
  current: SubtitleFragment,
  next: SubtitleFragment,
  isCJK: boolean
): boolean {
  const gap = next.start - current.end;
  if (gap > MAX_MERGE_GAP_MS) {
    return false;
  }

  // Prefer attaching short orphans / incomplete tails even near the soft cap
  const nextLen = getTextLength(next.text, isCJK);
  const shortOrphan = nextLen > 0 && nextLen <= (isCJK ? 4 : 3);
  const allowOverflow = hasIncompleteTail(current.text) || shortOrphan;

  const duration = next.end - current.start;
  // Short orphans may slightly exceed duration budget to avoid lonely 1-3 word cues
  const maxDuration = MAX_MERGED_DURATION_MS + (shortOrphan ? 2500 : 0);
  if (duration > maxDuration) {
    return false;
  }

  const maxLen = maxMergedLength(isCJK, allowOverflow);
  // Extra room specifically for short orphans (e.g. "box down")
  const hardCap = maxLen + (shortOrphan ? 4 : 0);
  const combinedLen = getTextLength(joinText(current.text, next.text, isCJK), isCJK);
  if (combinedLen > hardCap) {
    return false;
  }

  return true;
}

/**
 * After split, a cue ending with strong punctuation is a complete sentence —
 * never glue the next sentence onto it.
 */
function shouldStopAfterPunctuated(current: SubtitleFragment, isCJK: boolean): boolean {
  const text = current.text.trim();
  if (STRONG_END_PATTERN.test(text)) {
    return true;
  }
  if (WEAK_END_PATTERN.test(text)) {
    const maxLen = isCJK ? MAX_MERGED_LENGTH_CJK : MAX_MERGED_LENGTH_NON_CJK;
    const len = getTextLength(text, isCJK);
    return len >= Math.ceil(maxLen * 0.55);
  }
  return false;
}

function startsWithCjkPause(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  return CJK_PAUSE_PREFIXES.some(prefix => t.startsWith(prefix));
}

/**
 * Break before discourse markers on unpunctuated ASR.
 * English: first-word pause list. CJK: prefix list (no spaces).
 */
function shouldBreakBeforeUnpunctuated(
  current: SubtitleFragment,
  next: SubtitleFragment,
  isCJK: boolean
): boolean {
  if (isSign(next.text) || isNoiseTag(next.text)) {
    return true;
  }

  if (isCJK) {
    if (!startsWithCjkPause(next.text)) {
      return false;
    }
    // Only break once the current cue is already a readable phrase
    return getTextLength(current.text, true) >= CJK_PAUSE_MIN_CURRENT;
  }

  const first = getFirstWord(next.text);
  if (!PAUSE_WORDS.has(first)) {
    return false;
  }

  if (hasIncompleteTail(current.text)) {
    return false;
  }

  return getTextLength(current.text, false) >= 4;
}

function mergePair(
  left: SubtitleFragment,
  right: SubtitleFragment,
  isCJK: boolean
): SubtitleFragment {
  return {
    text: joinText(left.text, right.text, isCJK),
    start: left.start,
    end: right.end,
  };
}

/**
 * Merge adjacent ASR fragments into more readable cues.
 */
export function mergeAsrFragments(
  fragments: SubtitleFragment[],
  language: string,
  options?: { punctuationPoor?: boolean }
): SubtitleFragment[] {
  if (fragments.length <= 1) {
    return fragments.map(f => ({ ...f }));
  }

  const isCJK = isCJKLanguage(language);
  const punctuationPoor =
    options?.punctuationPoor ?? isPunctuationPoor(fragments);
  const result: SubtitleFragment[] = [];

  let current: SubtitleFragment | null = null;

  const flush = () => {
    if (current) {
      result.push(current);
      current = null;
    }
  };

  for (const frag of fragments) {
    const text = frag.text?.trim() ?? '';
    if (!text) {
      continue;
    }

    if (isNoiseTag(text) || isSign(text)) {
      flush();
      result.push({ text, start: frag.start, end: frag.end });
      continue;
    }

    const nextFrag: SubtitleFragment = { text, start: frag.start, end: frag.end };

    if (!current) {
      current = nextFrag;
      continue;
    }

    if (!canMergeByLimits(current, nextFrag, isCJK)) {
      flush();
      current = nextFrag;
      continue;
    }

    if (!punctuationPoor) {
      if (shouldStopAfterPunctuated(current, isCJK)) {
        flush();
        current = nextFrag;
        continue;
      }
      current = mergePair(current, nextFrag, isCJK);
      continue;
    }

    if (shouldBreakBeforeUnpunctuated(current, nextFrag, isCJK)) {
      flush();
      current = nextFrag;
      continue;
    }

    current = mergePair(current, nextFrag, isCJK);
  }

  flush();
  return result;
}

/**
 * Main entry for ASR post-processing (Scheme B+).
 * - Punctuated: split multi-sentence cues, then merge incomplete tails
 * - Unpunctuated: merge continuous speech only
 */
export function refineAsrFragments(
  fragments: SubtitleFragment[],
  language: string
): SubtitleFragment[] {
  if (fragments.length === 0) {
    return [];
  }

  const punctuationPoor = isPunctuationPoor(fragments);
  const prepared = punctuationPoor
    ? fragments
    : splitBySentencePunctuation(fragments);

  return mergeAsrFragments(prepared, language, { punctuationPoor });
}
