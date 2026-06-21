import type { SubtitleFragment, TimedTextEvent } from '../utils/types';

const ZERO_WIDTH_SPACE_PATTERN = /​/g;
const WHITESPACE_PATTERN = /\s+/g;

function getEventText(event: TimedTextEvent): string {
  return (event.segs ?? [])
    .map(seg => seg.utf8 || '')
    .join('')
    .replace(ZERO_WIDTH_SPACE_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

/**
 * Parse animated subtitle format
 * - Each event is a complete subtitle fragment
 * - Consecutive events with identical text are merged
 * - Zero-width spaces and extra whitespace are normalized
 */
export function parseAnimatedSubtitles(events: TimedTextEvent[]): SubtitleFragment[] {
  const fragments: SubtitleFragment[] = [];

  for (const event of events) {
    const text = getEventText(event);
    if (!text) {
      continue;
    }

    const start = event.tStartMs;
    const end = start + (event.dDurationMs ?? 0);
    const last = fragments[fragments.length - 1];

    if (last && last.text === text) {
      // Merge with previous fragment by extending end time
      last.end = end;
    } else {
      // Fix overlapping end times
      if (last && last.end > start) {
        last.end = start;
      }
      fragments.push({ text, start, end });
    }
  }

  return fragments;
}
