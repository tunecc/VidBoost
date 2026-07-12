/**
 * Content-aware subtitle style detection tests
 */

import { describe, it, expect } from 'vitest';
import type { SubtitleFragment } from '../../utils/types';
import {
  detectSubtitleStyle,
  shouldUseAsrRefine,
} from '../subtitle-style';
import { refineAsrFragments } from '../asr-merge';

/** Opening cues from a Chinese pseudo-manual upload (ASR-like fragments). */
const PSEUDO_MANUAL_ZH: SubtitleFragment[] = [
  { text: '大家好今天', start: 32033, end: 33166 },
  { text: '我们来聊一个小技巧', start: 33166, end: 35533 },
  { text: '当然', start: 35833, end: 36466 },
  { text: '这个方法看起来有点麻烦', start: 36466, end: 39633 },
  { text: '咱们还是一步步来', start: 39833, end: 40833 },
  { text: '首先打开设置页面', start: 42000, end: 44033 },
  { text: '找到字幕相关选项', start: 44033, end: 45933 },
  { text: '然后把它打开', start: 46033, end: 48300 },
  { text: '啊如果没有看到', start: 49133, end: 51533 },
  { text: '可以先刷新一下页面', start: 51533, end: 54800 },
  { text: '就是这个位置', start: 54800, end: 56333 },
  { text: '啊左边也好', start: 56500, end: 57833 },
  { text: '右边也好', start: 57833, end: 59266 },
  { text: '那就先选默认字体', start: 59266, end: 60966 },
  { text: '啊大小也好', start: 61100, end: 62566 },
  { text: '啊甚至于包括颜色设置', start: 62766, end: 64866 },
  { text: '可能都要调一下', start: 64866, end: 66466 },
  { text: '最好的效果就是背景半透明', start: 66866, end: 69966 },
  { text: '字号适中', start: 69966, end: 71233 },
  { text: '这样看起来会舒服很多', start: 71433, end: 73666 },
];

describe('detectSubtitleStyle', () => {
  it('classifies Chinese pseudo-manual short cues as asr-like', () => {
    expect(detectSubtitleStyle(PSEUDO_MANUAL_ZH, 'zh-CN')).toBe('asr-like');
  });

  it('classifies polished Chinese captions with punctuation as polished', () => {
    const input: SubtitleFragment[] = [
      { text: '大家好，今天我们来聊一个话题。', start: 0, end: 2500 },
      { text: '这件事其实并不复杂。', start: 2600, end: 4500 },
      { text: '关键在于我们如何理解它。', start: 4600, end: 7000 },
      { text: '接下来分三点说明。', start: 7100, end: 9000 },
      { text: '第一点是背景情况。', start: 9100, end: 11000 },
    ];
    expect(detectSubtitleStyle(input, 'zh-CN')).toBe('polished');
  });

  it('classifies unpunctuated English short cues as asr-like', () => {
    const input: SubtitleFragment[] = Array.from({ length: 12 }, (_, i) => ({
      text: `word${i} more text`,
      start: i * 900,
      end: i * 900 + 700,
    }));
    expect(detectSubtitleStyle(input, 'en')).toBe('asr-like');
  });

  it('classifies punctuated English sentences as polished', () => {
    const input: SubtitleFragment[] = [
      { text: 'Hello, guys.', start: 0, end: 1000 },
      { text: 'It is January 1st today.', start: 1000, end: 2000 },
      { text: 'Happy New Year!', start: 2000, end: 3000 },
      { text: "I'm heading to the airport.", start: 3000, end: 4000 },
      { text: 'This is great.', start: 4000, end: 5000 },
    ];
    expect(detectSubtitleStyle(input, 'en')).toBe('polished');
  });
});

describe('shouldUseAsrRefine', () => {
  it('always refines when track.kind is asr', () => {
    const polished: SubtitleFragment[] = [
      { text: '大家好，今天我们来聊一个话题。', start: 0, end: 2500 },
      { text: '这件事其实并不复杂。', start: 2600, end: 4500 },
      { text: '关键在于我们如何理解它。', start: 4600, end: 7000 },
      { text: '接下来分三点说明。', start: 7100, end: 9000 },
      { text: '第一点是背景情况。', start: 9100, end: 11000 },
    ];
    expect(shouldUseAsrRefine(polished, 'zh-CN', 'asr')).toBe(true);
  });

  it('refines Chinese pseudo-manual uploads without kind=asr', () => {
    expect(shouldUseAsrRefine(PSEUDO_MANUAL_ZH, 'zh-CN', undefined)).toBe(true);
    expect(shouldUseAsrRefine(PSEUDO_MANUAL_ZH, 'zh-CN', null)).toBe(true);
  });

  it('does not force refine on polished human Chinese captions', () => {
    const input: SubtitleFragment[] = [
      { text: '大家好，今天我们来聊一个话题。', start: 0, end: 2500 },
      { text: '这件事其实并不复杂。', start: 2600, end: 4500 },
      { text: '关键在于我们如何理解它。', start: 4600, end: 7000 },
      { text: '接下来分三点说明。', start: 7100, end: 9000 },
      { text: '第一点是背景情况。', start: 9100, end: 11000 },
    ];
    expect(shouldUseAsrRefine(input, 'zh-CN', undefined)).toBe(false);
  });
});

describe('pseudo-manual Chinese routing regression', () => {
  it('routes pseudo-manual Chinese to refine and avoids the old mega-line', () => {
    // Historical bug: optimizeSubtitles glued the opening into a 45-char wall.
    // After CJK max was also lowered, optimize is less catastrophic, but routing
    // still must choose refine for asr-like uploads (timing + soft merge rules).
    const refined = refineAsrFragments(PSEUDO_MANUAL_ZH, 'zh-CN');

    const maxRefined = Math.max(
      ...refined.map(f => f.text.replace(/\s+/g, '').length)
    );

    expect(shouldUseAsrRefine(PSEUDO_MANUAL_ZH, 'zh-CN')).toBe(true);
    // ASR refine soft cap is ~32 (+ small orphan overflow)
    expect(maxRefined).toBeLessThanOrEqual(40);
    // Must merge some short cues, but not collapse everything
    expect(refined.length).toBeGreaterThan(1);
    expect(refined.length).toBeLessThan(PSEUDO_MANUAL_ZH.length);

    // Opening phrase must not become one over-merged mega-line
    const mega =
      '大家好今天我们来聊一个小技巧当然这个方法看起来有点麻烦咱们还是一步步来';
    expect(refined.some(f => f.text.replace(/\s+/g, '') === mega)).toBe(false);
  });
});
