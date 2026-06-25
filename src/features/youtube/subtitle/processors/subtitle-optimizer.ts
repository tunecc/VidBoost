/**
 * Subtitle optimizer - merges word-level subtitle fragments into sentence-level segments
 * Ported from read-frog's optimizer.ts
 */

import type { SubtitleFragment } from '../utils/types';
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
  const startsWithSign = STARTS_WITH_SIGN_PATTERN.test(right.text);
  return isTimeout || startsWithSign;
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
    // First pass: merge fragments without aggressive pause detection
    let result = processSubtitles(fragments, language, false);

    // Quality check: if too many long lines, reprocess with pause detection
    if (isQualityPoor(result)) {
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
