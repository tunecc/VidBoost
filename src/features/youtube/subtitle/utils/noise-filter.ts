import type { TimedTextEvent } from './types';

const NOISE_PATTERNS = [
  /^\[.*?\]$/,        // [Music], [Applause], [Laughter]
  /^\(.*?\)$/,        // (音乐), (掌声)
  /^♪.*♪$|^♪$/,      // ♪ ... ♪ or single ♪
  /^🎵$/,            // 🎵
  /^🎶.*🎶$/,        // 🎶 ... 🎶
];

export function filterNoiseFromEvents(events: TimedTextEvent[]): TimedTextEvent[] {
  return events.map(event => ({
    ...event,
    segs: event.segs?.filter(seg => {
      const text = seg.utf8?.trim() || '';
      if (!text) return false;
      return !NOISE_PATTERNS.some(pattern => pattern.test(text));
    })
  }));
}
