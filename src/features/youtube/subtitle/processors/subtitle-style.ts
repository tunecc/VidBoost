/**
 * Content-aware subtitle style detection.
 *
 * YouTube track.kind is not reliable: authors often upload raw ASR / rough
 * machine captions as "manual" tracks. Routing must look at the fragment
 * shape (punctuation, cue length, timing), not only the track label.
 */

import type { SubtitleFragment } from '../utils/types';
import { isPunctuationPoor } from './asr-merge';
import { getTextLength, isCJKLanguage } from './subtitle-utils';

export type SubtitleStyle = 'polished' | 'asr-like';

/** Adjacent cues closer than this look like continuous ASR speech */
const TIGHT_GAP_MS = 300;

/** CJK: cues at or below this length count as short fragments */
const SHORT_CUE_CJK = 12;
/** Non-CJK: short cue word-count threshold */
const SHORT_CUE_NON_CJK = 8;

/** Average length below this (with poor punctuation) → asr-like */
const AVG_LEN_CJK = 14;
const AVG_LEN_NON_CJK = 8;

/** Short-cue ratio above this (with poor punctuation) → asr-like */
const SHORT_CUE_RATIO = 0.6;

/** Tight-gap ratio above this (with poor punctuation) → asr-like */
const TIGHT_GAP_RATIO = 0.4;

/**
 * Detect whether fragments look like polished human captions or ASR-like
 * (auto-generated / carelessly uploaded raw phrases).
 */
export function detectSubtitleStyle(
  fragments: SubtitleFragment[],
  language: string
): SubtitleStyle {
  const usable = fragments.filter(f => f.text && f.text.trim().length > 0);
  if (usable.length === 0) {
    return 'polished';
  }

  const isCJK = isCJKLanguage(language);
  const punctuationPoor = isPunctuationPoor(usable);

  // Enough punctuation → treat as polished even if some cues are short
  if (!punctuationPoor) {
    return 'polished';
  }

  const shortThreshold = isCJK ? SHORT_CUE_CJK : SHORT_CUE_NON_CJK;
  const avgThreshold = isCJK ? AVG_LEN_CJK : AVG_LEN_NON_CJK;

  const lengths = usable.map(f => getTextLength(f.text, isCJK));
  const totalLen = lengths.reduce((sum, n) => sum + n, 0);
  const avgLen = totalLen / lengths.length;
  const shortCount = lengths.filter(n => n > 0 && n <= shortThreshold).length;
  const shortRatio = shortCount / lengths.length;

  let tightGaps = 0;
  let gapSamples = 0;
  for (let i = 1; i < usable.length; i++) {
    const gap = usable[i].start - usable[i - 1].end;
    gapSamples++;
    if (gap <= TIGHT_GAP_MS) {
      tightGaps++;
    }
  }
  const tightGapRatio = gapSamples > 0 ? tightGaps / gapSamples : 0;

  // Primary: short fragmented cues without punctuation
  if (shortRatio > SHORT_CUE_RATIO || avgLen < avgThreshold) {
    return 'asr-like';
  }

  // Secondary: continuous speech packing without sentence punctuation
  if (tightGapRatio > TIGHT_GAP_RATIO) {
    return 'asr-like';
  }

  return 'polished';
}

/**
 * Whether post-processing should use the ASR refine pipeline.
 * True ASR tracks always refine; pseudo-manual asr-like content also refines.
 */
export function shouldUseAsrRefine(
  fragments: SubtitleFragment[],
  language: string,
  trackKind?: string | null
): boolean {
  if (trackKind === 'asr') {
    return true;
  }
  return detectSubtitleStyle(fragments, language) === 'asr-like';
}
