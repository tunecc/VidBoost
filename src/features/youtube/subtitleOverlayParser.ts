import type { YouTubeTimedText } from './subtitleOverlay.shared';

export type SubtitleFragment = {
    text: string;
    start: number;
    end: number;
};

const ZERO_WIDTH_SPACE_PATTERN = /\u200B/g;
const WHITESPACE_PATTERN = /\s+/g;
const SLASH_PATTERN = /\//g;
const SENTENCE_END_PATTERN = /[,.。?？！!；;…؟۔]$/;
const ESTIMATED_WORD_DURATION_MS = 200;

function cleanWhitespace(text: string) {
    return text.replace(WHITESPACE_PATTERN, ' ').trim();
}

function cleanKaraokeText(text: string) {
    return cleanWhitespace(
        text
            .replace(ZERO_WIDTH_SPACE_PATTERN, '')
            .replace(SLASH_PATTERN, '')
    );
}

function normalizeFragments(fragments: SubtitleFragment[]) {
    const result: SubtitleFragment[] = [];

    for (const fragment of fragments) {
        const text = cleanWhitespace(fragment.text);
        if (!text) continue;
        if (!(fragment.end > fragment.start)) continue;

        const last = result[result.length - 1];
        if (last) {
            if (last.end > fragment.start) {
                last.end = fragment.start;
            }
            if (last.text === text && Math.abs(last.end - fragment.start) <= 250) {
                last.end = Math.max(last.end, fragment.end);
                continue;
            }
        }

        result.push({
            text,
            start: fragment.start,
            end: fragment.end
        });
    }

    return result;
}

function isKaraokeFormat(events: YouTubeTimedText[]) {
    const groupsByTime = new Map<number, Set<number>>();

    for (const event of events) {
        if (event.wpWinPosId === undefined) continue;
        const group = groupsByTime.get(event.tStartMs) ?? new Set<number>();
        group.add(event.wpWinPosId);
        if (group.size > 1) {
            return true;
        }
        groupsByTime.set(event.tStartMs, group);
    }

    return false;
}

function isStylizedKaraokeFormat(events: YouTubeTimedText[]) {
    let matches = 0;
    let previousText = '';
    let previousTime = 0;

    for (const event of events) {
        const rawText = (event.segs ?? []).map((seg) => seg.utf8 || '').join('');
        const cleaned = cleanKaraokeText(rawText).toLowerCase();
        if (!cleaned) continue;

        const hasMarkers = rawText.includes('/') || rawText.includes('\u200B');
        const isClose = event.tStartMs - previousTime <= 400;
        const sameFamily = previousText
            && (cleaned === previousText
                || cleaned.startsWith(previousText)
                || previousText.startsWith(cleaned));

        if (hasMarkers && isClose && sameFamily) {
            matches += 1;
            if (matches >= 3) return true;
        }

        previousText = cleaned;
        previousTime = event.tStartMs;
    }

    return false;
}

function isScrollingAsrFormat(events: YouTubeTimedText[]) {
    return events.some((event) => event.wWinId !== undefined && event.aAppend === 1);
}

function parseStandardSubtitles(events: YouTubeTimedText[]) {
    const fragments: SubtitleFragment[] = [];
    let buffer: SubtitleFragment | null = null;

    for (const event of events) {
        const segs = event.segs ?? [];
        for (let index = 0; index < segs.length; index += 1) {
            const seg = segs[index];
            const text = cleanWhitespace(seg.utf8 || '');
            const start = event.tStartMs + (seg.tOffsetMs || 0);

            if (buffer) {
                if (buffer.end <= buffer.start || buffer.end > start) {
                    buffer.end = start;
                }
                fragments.push(buffer);
                buffer = null;
            }

            if (!text) continue;

            buffer = {
                text,
                start,
                end: index === segs.length - 1 ? event.tStartMs + (event.dDurationMs || 0) : start
            };
        }
    }

    if (buffer) {
        fragments.push(buffer);
    }

    return normalizeFragments(fragments);
}

function parseKaraokeSubtitles(events: YouTubeTimedText[]) {
    const trackIds = new Set<number>();
    for (const event of events) {
        if (event.wpWinPosId !== undefined) {
            trackIds.add(event.wpWinPosId);
        }
    }
    if (trackIds.size === 0) return [];

    const mainTrackId = trackIds.has(3) ? 3 : Math.max(...trackIds);
    const fragments: SubtitleFragment[] = [];

    for (const event of events) {
        if (event.wpWinPosId !== mainTrackId) continue;
        const text = cleanKaraokeText((event.segs ?? []).map((seg) => seg.utf8 || '').join(''));
        if (!text) continue;

        const last = fragments[fragments.length - 1];
        if (last && last.end > event.tStartMs) {
            last.end = event.tStartMs;
        }

        fragments.push({
            text,
            start: event.tStartMs,
            end: event.tStartMs + (event.dDurationMs || 0)
        });
    }

    return normalizeFragments(fragments);
}

function parseStylizedKaraokeSubtitles(events: YouTubeTimedText[]) {
    const fragments: SubtitleFragment[] = [];
    let current: SubtitleFragment | null = null;

    for (const event of events) {
        const text = cleanKaraokeText((event.segs ?? []).map((seg) => seg.utf8 || '').join(''));
        if (!text) continue;

        const next: SubtitleFragment = {
            text,
            start: event.tStartMs,
            end: event.tStartMs + (event.dDurationMs || 0)
        };

        if (
            current
            && next.start - current.start <= 1200
            && (
                next.text === current.text
                || next.text.startsWith(current.text)
                || current.text.startsWith(next.text)
            )
        ) {
            current.end = next.end;
            if (next.text.length >= current.text.length) {
                current.text = next.text;
            }
            continue;
        }

        if (current) {
            fragments.push(current);
        }
        current = next;
    }

    if (current) {
        fragments.push(current);
    }

    return normalizeFragments(fragments);
}

function parseScrollingAsrSubtitles(events: YouTubeTimedText[], languageCode?: string) {
    const fragments: SubtitleFragment[] = [];
    const isSpaceSeparated = languageCode?.startsWith('en') ?? false;

    let currentText = '';
    let currentStart = 0;
    let currentEnd = 0;
    let pendingSplit = false;
    let firstToken = true;

    for (const event of events) {
        if (event.aAppend === 1) {
            currentEnd = event.tStartMs + (event.dDurationMs || 0);
            if (pendingSplit && currentText.trim()) {
                fragments.push({
                    text: currentText.trim(),
                    start: currentStart,
                    end: currentEnd
                });
                currentText = '';
                pendingSplit = false;
                firstToken = true;
            }
            continue;
        }

        const segs = event.segs ?? [];
        if (segs.length === 0) continue;

        for (let index = 0; index < segs.length; index += 1) {
            const seg = segs[index];
            const rawText = seg.utf8 || '';
            const cleaned = rawText.trim();
            if (!cleaned) continue;

            const segStart = event.tStartMs + (seg.tOffsetMs || 0);
            if (firstToken) {
                currentStart = segStart;
                firstToken = false;
            }

            if (isSpaceSeparated && currentText && index === 0 && !currentText.endsWith(' ')) {
                currentText += ' ';
            }

            currentText += rawText;
            currentEnd = segStart + ESTIMATED_WORD_DURATION_MS;

            if (SENTENCE_END_PATTERN.test(cleaned)) {
                pendingSplit = true;
            }
        }
    }

    if (currentText.trim()) {
        fragments.push({
            text: currentText.trim(),
            start: currentStart,
            end: currentEnd
        });
    }

    return normalizeFragments(fragments);
}

export function parseYouTubeSubtitleEvents(events: YouTubeTimedText[], languageCode?: string) {
    if (!Array.isArray(events) || events.length === 0) return [];

    if (isStylizedKaraokeFormat(events)) {
        return parseStylizedKaraokeSubtitles(events);
    }

    if (isKaraokeFormat(events)) {
        return parseKaraokeSubtitles(events);
    }

    if (isScrollingAsrFormat(events)) {
        return parseScrollingAsrSubtitles(events, languageCode);
    }

    return parseStandardSubtitles(events);
}
