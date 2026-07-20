/**
 * Subtitle optimizer - merges word-level subtitle fragments into sentence-level segments
 * Ported from read-frog's optimizer.ts
 */

import type { SubtitleFragment } from '../utils/types';
import { isPunctuationPoor, refineAsrFragments } from './asr-merge';
import {
  CHEVRON_PATTERN,
  LEADING_CHEVRON_PATTERN,
  PAUSE_TIMEOUT_MS,
  PAUSE_WORDS,
  QUALITY_LENGTH_THRESHOLD,
  QUALITY_PERCENTAGE_THRESHOLD,
  SENTENCE_END_PATTERN,
  STARTS_WITH_SIGN_PATTERN,
  WHITESPACE_PATTERN,
} from './subtitle-constants';
import {
  getMaxLength,
  getTargetBounds,
  getTextLength,
  isCJKLanguage,
} from './subtitle-utils';

/**
 * Internal segment representation during processing
 */
interface BufferSegment {
  text: string;
  start: number;
  end: number;
}

/**
 * Clean text by removing YouTube ASR markers and normalizing whitespace
 */
function cleanText(text: string): string {
  return text
    .replace(LEADING_CHEVRON_PATTERN, '')
    .replace(CHEVRON_PATTERN, ' ')
    .trim();
}

/**
 * Get the first word of a text string (lowercased)
 */
function getFirstWord(text: string): string {
  return text.toLowerCase().split(WHITESPACE_PATTERN)[0] || '';
}

/**
 * Check if subtitle quality is poor (too many long lines)
 * Poor quality triggers reprocessing with pause word detection
 */
function isQualityPoor(fragments: SubtitleFragment[]): boolean {
  if (fragments.length === 0) {
    return false;
  }

  const longCount = fragments.filter(
    f => f.text.length > QUALITY_LENGTH_THRESHOLD
  ).length;

  return longCount / fragments.length > QUALITY_PERCENTAGE_THRESHOLD;
}

/**
 * Punctuation pattern for ASR detection
 */
const ASR_PUNCTUATION_PATTERN = /[.!?,;。！？，；]$/;

/**
 * Detect if input fragments lack punctuation (typical of YouTube ASR auto-captions)
 * If fewer than 5% of fragments end with punctuation, treat as "no punctuation" ASR input
 * and enable aggressive pause word segmentation from the start.
 */
function isNoPunctuationASR(fragments: SubtitleFragment[]): boolean {
  if (fragments.length < 5) {
    return false;
  }

  const punctuatedCount = fragments.filter(f =>
    ASR_PUNCTUATION_PATTERN.test(f.text.trim())
  ).length;

  return punctuatedCount / fragments.length < 0.05;
}

/**
 * Process subtitles: merge word-level fragments into sentence-level segments
 *
 * @param fragments - Input subtitle fragments (word-level or phrase-level)
 * @param language - Language code for CJK detection
 * @param usePause - Enable pause word detection for better segmentation
 */
function processSubtitles(
  fragments: SubtitleFragment[],
  language: string,
  usePause: boolean = false
): SubtitleFragment[] {
  const result: SubtitleFragment[] = [];
  const buffer: BufferSegment[] = [];
  let bufferLength = 0;

  const isCJK = isCJKLanguage(language);
  const separator = isCJK ? '' : ' ';
  const maxLength = getMaxLength(isCJK);

  const flushBuffer = () => {
    if (buffer.length === 0) {
      return;
    }

    result.push({
      text: buffer.map(s => s.text).join(separator).trim(),
      start: buffer[0].start,
      end: buffer[buffer.length - 1].end,
    });

    buffer.length = 0;
    bufferLength = 0;
  };

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    if (!frag.text) {
      continue;
    }

    const text = cleanText(frag.text);
    if (!text) {
      continue;
    }

    const fragLength = getTextLength(text, isCJK);
    const lastSegment = buffer[buffer.length - 1];

    if (lastSegment) {
      // Check various break conditions
      const isEndOfSentence = SENTENCE_END_PATTERN.test(lastSegment.text);
      const isTimeout = frag.start - lastSegment.end > PAUSE_TIMEOUT_MS;
      const wouldExceedLimit = bufferLength + fragLength > maxLength;
      const startsWithSign = STARTS_WITH_SIGN_PATTERN.test(frag.text);
      const startsWithPauseWord =
        usePause && PAUSE_WORDS.has(getFirstWord(frag.text)) && buffer.length > 1;

      if (
        isEndOfSentence ||
        isTimeout ||
        wouldExceedLimit ||
        startsWithSign ||
        startsWithPauseWord
      ) {
        flushBuffer();
      }
    }

    buffer.push({ text, start: frag.start, end: frag.end });
    bufferLength += fragLength;

    // Sign fragments (e.g., [Music], (Applause)) should stand alone
    if (STARTS_WITH_SIGN_PATTERN.test(frag.text)) {
      flushBuffer();
    }
  }

  flushBuffer();
  return result;
}

/**
 * Merge two segment pairs into one
 */
function mergeSegmentPair(
  left: SubtitleFragment,
  right: SubtitleFragment,
  separator: string
): SubtitleFragment {
  return {
    text: `${left.text}${separator}${right.text}`.trim(),
    start: left.start,
    end: right.end,
  };
}

/**
 * Check if a boundary should be kept (not merged)
 * Boundaries marked by long pauses or special signs are preserved
 */
function shouldKeepBoundary(
  left: SubtitleFragment,
  right: SubtitleFragment
): boolean {
  const isTimeout = right.start - left.end > PAUSE_TIMEOUT_MS;
  const rightStartsWithSign = STARTS_WITH_SIGN_PATTERN.test(right.text);
  const leftIsSign = STARTS_WITH_SIGN_PATTERN.test(left.text);
  return isTimeout || rightStartsWithSign || leftIsSign;
}

/**
 * Rebalance subtitle fragments to target length range
 * Short lines are merged forward and backward to reach optimal length
 *
 * @param fragments - Input fragments to rebalance
 * @param language - Language code for CJK detection
 */
function rebalanceToTargetRange(
  fragments: SubtitleFragment[],
  language: string
): SubtitleFragment[] {
  if (fragments.length <= 1) {
    return fragments;
  }

  const isCJK = isCJKLanguage(language);
  const separator = isCJK ? '' : ' ';
  const { min, max } = getTargetBounds(isCJK);

  const result: SubtitleFragment[] = [];

  // Forward pass: merge short lines with following lines
  for (let i = 0; i < fragments.length; i++) {
    let current = { ...fragments[i] };
    let currentLength = getTextLength(current.text, isCJK);

    while (currentLength < min && i + 1 < fragments.length) {
      const next = fragments[i + 1];
      const nextLength = getTextLength(next.text, isCJK);
      const combinedLength = currentLength + nextLength;

      if (combinedLength > max || shouldKeepBoundary(current, next)) {
        break;
      }

      current = mergeSegmentPair(current, next, separator);
      currentLength = combinedLength;
      i++;
    }

    result.push(current);
  }

  // Backward pass: merge remaining short lines with previous lines
  for (let i = result.length - 1; i > 0; i--) {
    const current = result[i];
    const currentLength = getTextLength(current.text, isCJK);

    if (currentLength >= min) {
      continue;
    }

    const previous = result[i - 1];
    const previousLength = getTextLength(previous.text, isCJK);
    const combinedLength = previousLength + currentLength;

    if (combinedLength > max || shouldKeepBoundary(previous, current)) {
      continue;
    }

    result[i - 1] = mergeSegmentPair(previous, current, separator);
    result.splice(i, 1);
  }

  return result;
}

/**
 * Optimize subtitles: merge word-level fragments into sentence-level segments
 * This is the main entry point for subtitle optimization
 *
 * NOTE (2026-07-20): Production overlay/controller no longer route polished
 * tracks here. Use postProcessSubtitles() for display paths. This function
 * remains for direct callers / future mid-tier experiments.
 *
 * @param fragments - Input subtitle fragments (typically word-level from YouTube API)
 * @param language - Language code (e.g., "en", "zh-CN", "ja")
 * @returns Optimized subtitle fragments with better sentence segmentation
 *
 * @example
 * // Before optimization (word-level):
 * [
 *   { text: "Hello", start: 1000, end: 1200 },
 *   { text: "world", start: 1200, end: 1500 }
 * ]
 *
 * // After optimization (sentence-level):
 * [
 *   { text: "Hello world", start: 1000, end: 1500 }
 * ]
 */
export function optimizeSubtitles(
  fragments: SubtitleFragment[],
  language: string
): SubtitleFragment[] {
  if (fragments.length === 0) {
    return [];
  }

  try {
    // Phase 2 safety net: even if caller routes CJK unpunctuated content here
    // (e.g. mislabeled manual track, or direct API use), degrade to ASR refine.
    // Aggressive English-style merging turns Chinese short cues into walls of text.
    if (isCJKLanguage(language) && isPunctuationPoor(fragments)) {
      return refineAsrFragments(fragments, language);
    }

    // Detect if input lacks punctuation (YouTube ASR auto-captions)
    const noPunctuation = isNoPunctuationASR(fragments);

    // First pass: if no punctuation detected, enable pause word segmentation immediately
    let result = processSubtitles(fragments, language, noPunctuation);

    // Quality check: if first pass didn't use pause words and quality is poor, reprocess
    if (!noPunctuation && isQualityPoor(result)) {
      result = processSubtitles(fragments, language, true);
    }

    // Rebalance to target length range
    result = rebalanceToTargetRange(result, language);

    return result;
  } catch (error) {
    // If optimization fails, return original fragments
    console.error('[SubtitleOptimizer] Optimization failed, using original fragments:', error);
    return fragments;
  }
}
