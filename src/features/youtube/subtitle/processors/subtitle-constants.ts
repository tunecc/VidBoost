/**
 * Subtitle optimizer constants
 * Ported from read-frog's subtitle processing logic
 */

/**
 * Time gap threshold (milliseconds)
 * Fragments separated by more than this are considered separate sentences
 */
export const PAUSE_TIMEOUT_MS = 1500;

/**
 * Sentence-ending punctuation pattern
 */
export const SENTENCE_END_PATTERN = /[.!?。！？]$/;

/**
 * Quality detection thresholds
 * If more than QUALITY_PERCENTAGE_THRESHOLD of fragments exceed QUALITY_LENGTH_THRESHOLD,
 * the quality is considered poor and triggers reprocessing with pause word detection
 */
export const QUALITY_LENGTH_THRESHOLD = 250; // characters
export const QUALITY_PERCENTAGE_THRESHOLD = 0.2; // 20%

/**
 * Target length range for rebalancing (best-effort)
 * CJK languages are measured by character count
 * Non-CJK languages are measured by word count
 */
export const TARGET_MIN_CJK = 15;
export const TARGET_MAX_CJK = 25;
export const TARGET_MIN_NON_CJK = 11;
export const TARGET_MAX_NON_CJK = 20;

/**
 * Maximum line length limits
 * Used to prevent excessively long single lines
 */
export const MAX_LENGTH_CJK = 50;
export const MAX_LENGTH_NON_CJK = 42;

/**
 * Pause words - common transition words that can serve as natural break points
 * Used in the second pass when quality is poor
 */
export const PAUSE_WORDS = new Set([
  'actually',
  'also',
  'although',
  'and',
  'anyway',
  'as',
  'basically',
  'because',
  'but',
  'eventually',
  'frankly',
  'honestly',
  'hopefully',
  'however',
  'if',
  'instead',
  'just',
  'like',
  'literally',
  'maybe',
  'meanwhile',
  'nevertheless',
  'nonetheless',
  'now',
  'okay',
  'or',
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
]);

/**
 * Special markers that should start a new segment
 */
export const STARTS_WITH_SIGN_PATTERN = /^[[(♪]/;

/**
 * Leading chevron pattern (YouTube ASR markers)
 */
export const LEADING_CHEVRON_PATTERN = /^>>\s*/;

/**
 * Chevron pattern (YouTube ASR markers within text)
 */
export const CHEVRON_PATTERN = />>/g;

/**
 * Whitespace pattern for text normalization
 */
export const WHITESPACE_PATTERN = /\s+/;
