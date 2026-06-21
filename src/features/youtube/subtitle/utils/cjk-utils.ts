const CJK_LANGUAGE_CODES = ['zh', 'ja', 'ko'];

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
  return isCJK ? 40 : 80;
}
