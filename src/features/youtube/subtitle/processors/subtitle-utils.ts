/**
 * Subtitle utility functions
 * Language detection and text processing
 */

import {
  MAX_LENGTH_CJK,
  MAX_LENGTH_NON_CJK,
  TARGET_MAX_CJK,
  TARGET_MAX_NON_CJK,
  TARGET_MIN_CJK,
  TARGET_MIN_NON_CJK,
} from './subtitle-constants';

/**
 * CJK language codes
 */
const CJK_LANGUAGES = new Set([
  'zh',
  'zh-cn',
  'zh-tw',
  'zh-hk',
  'zh-sg',
  'ja',
  'ja-jp',
  'ko',
  'ko-kr',
]);

/**
 * Check if a language is CJK (Chinese, Japanese, Korean)
 */
export function isCJKLanguage(languageCode: string): boolean {
  if (!languageCode) {
    return false;
  }

  const normalized = languageCode.toLowerCase();

  // Check full code first
  if (CJK_LANGUAGES.has(normalized)) {
    return true;
  }

  // Check language prefix (e.g., "zh" from "zh-CN")
  const prefix = normalized.split('-')[0];
  return CJK_LANGUAGES.has(prefix);
}

/**
 * Get text length for line limit calculation
 * CJK languages: character count
 * Non-CJK languages: word count
 */
export function getTextLength(text: string, isCJK: boolean): number {
  if (!text) {
    return 0;
  }

  if (isCJK) {
    // For CJK, count characters (excluding spaces)
    return text.replace(/\s+/g, '').length;
  } else {
    // For non-CJK, count words
    const words = text.trim().split(/\s+/);
    return words.filter(w => w.length > 0).length;
  }
}

/**
 * Get maximum line length limit
 */
export function getMaxLength(isCJK: boolean): number {
  return isCJK ? MAX_LENGTH_CJK : MAX_LENGTH_NON_CJK;
}

/**
 * Get target length bounds for rebalancing
 */
export function getTargetBounds(isCJK: boolean): { min: number; max: number } {
  return isCJK
    ? { min: TARGET_MIN_CJK, max: TARGET_MAX_CJK }
    : { min: TARGET_MIN_NON_CJK, max: TARGET_MAX_NON_CJK };
}
