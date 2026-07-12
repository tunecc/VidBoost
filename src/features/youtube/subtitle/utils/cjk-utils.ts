const CJK_LANGUAGE_CODES = ['zh', 'ja', 'ko'];

/**
 * Max line length for parsers (word count for non-CJK, char count for CJK)
 * Aligned with subtitle-constants.ts to avoid over-merging in parser stage
 */
const MAX_LENGTH_CJK = 32;
const MAX_LENGTH_NON_CJK = 15;

export function isCJKLanguage(languageCode?: string): boolean {
  if (!languageCode) return false;
  const normalized = languageCode.toLowerCase();
  return CJK_LANGUAGE_CODES.some(code => normalized.startsWith(code));
}

export function getTextLength(text: string, isCJK: boolean): number {
  if (isCJK) {
    return text.length;
  } else {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

export function getMaxLength(isCJK: boolean): number {
  return isCJK ? MAX_LENGTH_CJK : MAX_LENGTH_NON_CJK;
}
