/**
 * Content-shape resegment gate + postProcess routing.
 *
 * Decide whether to resegment by cue shape (tiny/flash ratios, avg length),
 * not punctuation as the Chinese primary switch, and not track.kind as a force.
 * Polished phrase-level captions pass through lightClean; fragmented crumbs
 * go through refineAsrFragments.
 */

import type { SubtitleFragment } from '../utils/types';
import { refineAsrFragments } from './asr-merge';
import {
  CHEVRON_PATTERN,
  LEADING_CHEVRON_PATTERN,
} from './subtitle-constants';
import { getTextLength, isCJKLanguage } from './subtitle-utils';

export type SubtitleStyle = 'polished' | 'asr-like';

// CJK：字符数；非 CJK：词数（经 getTextLength）
const TINY_CUE_CJK = 4; // ≤4 字视为「词级碎」
const TINY_CUE_NON_CJK = 3; // ≤3 词
const TINY_RATIO = 0.5; // ≥50% 为 tiny → resegment
const LOW_AVG_CJK = 5; // 均长很低
const LOW_AVG_NON_CJK = 3;
const LOW_AVG_TINY_RATIO = 0.35; // 均长很低时，tiny 占比门槛略降
const FLASH_MS = 500; // 单条时长 <500ms
const FLASH_RATIO = 0.5;
const FLASH_AVG_CJK = 6; // 闪现多且均长仍偏低 → resegment
const FLASH_AVG_NON_CJK = 4;
const MIN_SAMPLES = 5; // 样本太少 → 透传（拿不准不合并）

/**
 * Whether fragments look word-level / fragmented enough to resegment.
 * Small samples pass through (prefer no harm).
 */
export function needsResegment(
  fragments: SubtitleFragment[],
  language: string
): boolean {
  const usable = fragments.filter(f => f.text && f.text.trim().length > 0);
  if (usable.length < MIN_SAMPLES) {
    return false;
  }

  const isCJK = isCJKLanguage(language);
  const tinyThreshold = isCJK ? TINY_CUE_CJK : TINY_CUE_NON_CJK;
  const lengths = usable.map(f => getTextLength(f.text, isCJK));
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const tinyRatio =
    lengths.filter(n => n > 0 && n <= tinyThreshold).length / lengths.length;

  let flashCount = 0;
  for (const f of usable) {
    if (f.end - f.start < FLASH_MS) flashCount += 1;
  }
  const flashRatio = flashCount / usable.length;

  // 1) 大量词级碎 cue
  if (tinyRatio >= TINY_RATIO) {
    return true;
  }

  // 2) 均长极低 + 仍有不少 tiny
  const lowAvg = isCJK ? LOW_AVG_CJK : LOW_AVG_NON_CJK;
  if (avgLen <= lowAvg && tinyRatio >= LOW_AVG_TINY_RATIO) {
    return true;
  }

  // 3) 大量闪现 + 均长仍偏低（词级 ASR 时间特征）
  const flashAvg = isCJK ? FLASH_AVG_CJK : FLASH_AVG_NON_CJK;
  if (flashRatio >= FLASH_RATIO && avgLen <= flashAvg) {
    return true;
  }

  return false;
}

/**
 * Strip chevrons / collapse whitespace; drop empty cues. No merging.
 */
export function lightCleanFragments(
  fragments: SubtitleFragment[]
): SubtitleFragment[] {
  const out: SubtitleFragment[] = [];
  for (const f of fragments) {
    const text = (f.text ?? '')
      .replace(LEADING_CHEVRON_PATTERN, '')
      .replace(CHEVRON_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    out.push({ text, start: f.start, end: f.end });
  }
  return out;
}

/**
 * Single post path: resegment fragmented cues; light-clean polished phrases.
 */
export function postProcessSubtitles(
  fragments: SubtitleFragment[],
  language: string
): SubtitleFragment[] {
  if (fragments.length === 0) return [];
  if (needsResegment(fragments, language)) {
    return refineAsrFragments(fragments, language);
  }
  return lightCleanFragments(fragments);
}

/**
 * Compat: polished vs asr-like from shape only.
 */
export function detectSubtitleStyle(
  fragments: SubtitleFragment[],
  language: string
): SubtitleStyle {
  return needsResegment(fragments, language) ? 'asr-like' : 'polished';
}

/**
 * Compat: ignore trackKind; shape-only gate (same as needsResegment).
 */
export function shouldUseAsrRefine(
  fragments: SubtitleFragment[],
  language: string,
  _trackKind?: string | null
): boolean {
  return needsResegment(fragments, language);
}
