import { filterNoiseFromEvents } from '../utils/noise-filter';
import { detectFormat } from '../core/format-detector';
import { parseStandardSubtitles } from './standard';
import { parseKaraokeSubtitles } from './karaoke';
import { parseStylizedKaraokeSubtitles } from './stylized-karaoke';
import { parseScrollingAsrSubtitles } from './scrolling-asr';
import { parseAnimatedSubtitles } from './animated';
import type { TimedTextEvent, SubtitleFragment } from '../utils/types';

export function parseYouTubeSubtitleEvents(
  events: TimedTextEvent[],
  languageCode?: string
): SubtitleFragment[] {
  const filtered = filterNoiseFromEvents(events);
  const format = detectFormat(filtered);

  switch (format) {
    case 'animated':
      return parseAnimatedSubtitles(filtered);
    case 'stylized-karaoke':
      return parseStylizedKaraokeSubtitles(filtered);
    case 'karaoke':
      return parseKaraokeSubtitles(filtered);
    case 'scrolling-asr':
      return parseScrollingAsrSubtitles(filtered, languageCode);
    default:
      return parseStandardSubtitles(filtered);
  }
}
