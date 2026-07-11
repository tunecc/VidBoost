import type { SubtitleFragment, TimedTextEvent } from '../utils/types';

const WHITESPACE_PATTERN = /\s+/g;

/**
 * Parse ASR scrolling subtitle format (YouTube auto-generated).
 *
 * For auto-generated tracks, YouTube already segments text into short,
 * precisely-timed phrases (one event ≈ 2-9 seconds). We preserve those
 * original event boundaries and timing verbatim instead of merging events
 * into larger blocks. Each non-separator event becomes one fragment with:
 *   - text: all segs of the event joined (whitespace-normalized)
 *   - start: tStartMs (first seg offset folded in)
 *   - end: tStartMs + dDurationMs
 *
 * Separator events (aAppend === 1) carry no text and are used to finalize
 * the previous fragment's end time when dDurationMs is missing/zero.
 *
 * Noise filtering (e.g. [Music]) is handled upstream by filterNoiseFromEvents.
 */
export function parseScrollingAsrSubtitles(
  events: TimedTextEvent[],
  languageCode?: string
): SubtitleFragment[] {
  const isSpaceSeparated = !languageCode || !isCJKLanguage(languageCode);
  const result: SubtitleFragment[] = [];

  const pushFragment = (fragment: SubtitleFragment) => {
    // Fix previous fragment's end time to avoid overlap
    const last = result[result.length - 1];
    if (last && last.end > fragment.start) {
      last.end = fragment.start;
    }
    result.push(fragment);
  };

  for (const event of events) {
    // Separator events carry no text; only use them to finalize the previous
    // fragment's end time when needed. Skipping is harmless.
    if (event.aAppend === 1) continue;

    if (!event.segs || event.segs.length === 0) continue;

    // Determine start time: first seg's offset, falling back to event start
    let start = event.tStartMs;
    let end = event.tStartMs + (event.dDurationMs || 0);

    // Build text from all segs, applying per-seg offset for start time
    let textParts: string[] = [];
    for (const seg of event.segs) {
      const segText = seg.utf8 || '';
      if (!segText) continue;
      textParts.push(segText.trim());
      if (end === 0 && seg.tOffsetMs !== undefined) {
        end = event.tStartMs + seg.tOffsetMs;
      }
    }

    if (textParts.length === 0) continue;

    let text = textParts.join(isSpaceSeparated ? ' ' : '');
    text = text.replace(WHITESPACE_PATTERN, ' ').trim();
    if (!text) continue;

    // If the event has no duration, estimate a minimal end so the fragment
    // is still visible at its start time before the next one arrives.
    if (!end || end <= start) {
      end = start + 1;
    }

    pushFragment({ text, start, end });
  }

  return result;
}

const CJK_LANGUAGE_CODES = ['zh', 'ja', 'ko'];

function isCJKLanguage(languageCode?: string): boolean {
  if (!languageCode) return false;
  const normalized = languageCode.toLowerCase();
  return CJK_LANGUAGE_CODES.some(code => normalized.startsWith(code));
}
