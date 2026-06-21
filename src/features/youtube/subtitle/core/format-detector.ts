import type { TimedTextEvent, SubtitleFormat } from '../utils/types';

const ZERO_WIDTH_SPACE_PATTERN = /​/g;
const WHITESPACE_PATTERN = /\s+/g;
const SLASH_PATTERN = /\//g;
const STYLIZED_GAP_MS = 400;
const MIN_STYLIZED_MATCHES = 3;
const ANIMATED_DURATION_THRESHOLD_MS = 100;
const ANIMATED_MIN_EVENTS = 50;
const ANIMATED_SHORT_DURATION_RATIO = 0.5;

/**
 * Extract text from event segments.
 */
function getEventText(event: TimedTextEvent): string {
  return (event.segs ?? [])
    .map(seg => seg.utf8 || '')
    .join('');
}

/**
 * Clean event text by removing zero-width spaces and normalizing whitespace.
 */
function cleanEventText(text: string): string {
  return text
    .replace(ZERO_WIDTH_SPACE_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}

/**
 * Normalize stylized text for comparison:
 * - Remove zero-width spaces
 * - Remove slashes
 * - Normalize whitespace
 * - Convert to lowercase
 */
function normalizeStylizedText(text: string): string {
  return cleanEventText(text)
    .replace(SLASH_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Detect animated/kinetic typography subtitles.
 * Feature: most events are ultra-short animation frames (<= 100ms) with wpWinPosId.
 * Used in music videos where text bounces/scrolls across the screen.
 */
function isAnimatedFormat(events: TimedTextEvent[]): boolean {
  if (events.length < ANIMATED_MIN_EVENTS) {
    return false;
  }

  let shortWithPos = 0;
  for (const event of events) {
    if (
      event.wpWinPosId !== undefined
      && (event.dDurationMs ?? 0) <= ANIMATED_DURATION_THRESHOLD_MS
    ) {
      shortWithPos += 1;
    }
  }

  return shortWithPos / events.length >= ANIMATED_SHORT_DURATION_RATIO;
}

/**
 * Detect stylized karaoke subtitles where the same line is redrawn frequently on a
 * single track with slash-based syllable markers and zero-width spacing.
 */
function isStylizedKaraokeFormat(events: TimedTextEvent[]): boolean {
  if (events.length < 4) {
    return false;
  }

  const tracks = new Map<number, TimedTextEvent[]>();
  for (const event of events) {
    if (event.wpWinPosId === undefined) {
      continue;
    }

    const trackEvents = tracks.get(event.wpWinPosId);
    if (trackEvents) {
      trackEvents.push(event);
    } else {
      tracks.set(event.wpWinPosId, [event]);
    }
  }

  for (const trackEvents of Array.from(tracks.values())) {
    if (trackEvents.length < 4) {
      continue;
    }

    let stylizedMatches = 0;
    let previousNormalized = '';
    let previousTime = 0;

    for (const event of trackEvents) {
      const rawText = getEventText(event);
      const cleanedText = cleanEventText(rawText);
      const normalizedText = normalizeStylizedText(rawText);

      if (!cleanedText || !normalizedText) {
        continue;
      }

      const hasStylizedMarkers = rawText.includes('/')
        || rawText.includes('​');

      const isCloseInTime = previousNormalized.length > 0
        && event.tStartMs - previousTime <= STYLIZED_GAP_MS;

      const isDuplicateOrExpansion = isCloseInTime && (
        normalizedText === previousNormalized
        || normalizedText.startsWith(previousNormalized)
        || previousNormalized.startsWith(normalizedText)
      );

      if (hasStylizedMarkers && isDuplicateOrExpansion) {
        stylizedMatches += 1;
        if (stylizedMatches >= MIN_STYLIZED_MATCHES) {
          return true;
        }
      }

      previousNormalized = normalizedText;
      previousTime = event.tStartMs;
    }
  }

  return false;
}

/**
 * Detect classic karaoke format subtitles.
 * Feature: multiple events at the same timestamp with different wpWinPosId values.
 */
function isKaraokeFormat(events: TimedTextEvent[]): boolean {
  if (events.length < 2) {
    return false;
  }

  const groupsByTime = new Map<number, Set<number>>();
  for (const event of events) {
    if (event.wpWinPosId === undefined) {
      continue;
    }

    const group = groupsByTime.get(event.tStartMs) ?? new Set<number>();
    group.add(event.wpWinPosId);
    if (group.size > 1) {
      return true;
    }
    groupsByTime.set(event.tStartMs, group);
  }

  return false;
}

/**
 * Detect ASR scrolling subtitle format.
 * Feature: events with wWinId and aAppend: 1.
 */
function isScrollingAsrFormat(events: TimedTextEvent[]): boolean {
  return events.some(event => event.wWinId !== undefined && event.aAppend === 1);
}

/**
 * Detect subtitle format type.
 * Priority: Animated → Stylized Karaoke → Karaoke → Scrolling ASR → Standard
 */
export function detectFormat(events: TimedTextEvent[]): SubtitleFormat {
  if (!events || events.length === 0) {
    return 'standard';
  }

  if (isAnimatedFormat(events)) {
    return 'animated';
  }

  if (isStylizedKaraokeFormat(events)) {
    return 'stylized-karaoke';
  }

  if (isKaraokeFormat(events)) {
    return 'karaoke';
  }

  if (isScrollingAsrFormat(events)) {
    return 'scrolling-asr';
  }

  return 'standard';
}
