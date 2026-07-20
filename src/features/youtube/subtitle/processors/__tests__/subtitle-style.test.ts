/**
 * Content-shape resegment gate + postProcess routing
 */
import { describe, it, expect } from 'vitest';
import type { SubtitleFragment } from '../../utils/types';
import {
  detectSubtitleStyle,
  lightCleanFragments,
  needsResegment,
  postProcessSubtitles,
  shouldUseAsrRefine,
} from '../subtitle-style';

/** Phrase-level unpunctuated Chinese (author-style), like the user SRT sample. */
const POLISHED_UNPUNCT_ZH: SubtitleFragment[] = [
  { text: '他是中共历史上唯一的三朝帝师', start: 3700, end: 6800 },
  { text: '是三任总书记的幕后智囊', start: 6966, end: 9500 },
  { text: '充当党的理论的操盘手', start: 9733, end: 12433 },
  { text: '他也是中共历史上唯一的没有主政过一方', start: 12866, end: 16300 },
  { text: '仅仅是依靠智囊身份', start: 16400, end: 18000 },
  { text: '进入最高权力圈', start: 18000, end: 19733 },
  { text: '当上政治局常委的知识分子', start: 19733, end: 22600 },
  { text: '他结了三次婚', start: 22800, end: 24066 },
  { text: '写过多本政治学著作', start: 24133, end: 26400 },
  { text: '也曾经是无数学子仰望的学术才俊', start: 26600, end: 30100 },
  { text: '但是为什么', start: 31000, end: 31966 },
  { text: '如今的中国人对他评价并不高', start: 31966, end: 34900 },
];

/** Word-level Chinese ASR crumbs. */
const WORD_LEVEL_ZH: SubtitleFragment[] = Array.from({ length: 12 }, (_, i) => ({
  text: '字',
  start: i * 200,
  end: i * 200 + 150,
}));

/** Word-level English ASR crumbs. */
const WORD_LEVEL_EN: SubtitleFragment[] = Array.from({ length: 12 }, (_, i) => ({
  text: `w${i}`,
  start: i * 180,
  end: i * 180 + 120,
}));

const PUNCT_ZH: SubtitleFragment[] = [
  { text: '大家好，今天我们来聊一个话题。', start: 0, end: 2500 },
  { text: '这件事其实并不复杂。', start: 2600, end: 4500 },
  { text: '关键在于我们如何理解它。', start: 4600, end: 7000 },
  { text: '接下来分三点说明。', start: 7100, end: 9000 },
  { text: '第一点是背景情况。', start: 9100, end: 11000 },
];

describe('needsResegment', () => {
  it('passes through polished unpunctuated Chinese phrases', () => {
    expect(needsResegment(POLISHED_UNPUNCT_ZH, 'zh-CN')).toBe(false);
  });

  it('passes through punctuated Chinese sentences', () => {
    expect(needsResegment(PUNCT_ZH, 'zh-CN')).toBe(false);
  });

  it('resegments word-level Chinese crumbs', () => {
    expect(needsResegment(WORD_LEVEL_ZH, 'zh-CN')).toBe(true);
  });

  it('resegments word-level English crumbs', () => {
    expect(needsResegment(WORD_LEVEL_EN, 'en')).toBe(true);
  });

  it('passes through when sample size is tiny (prefer no harm)', () => {
    const few: SubtitleFragment[] = [
      { text: '字', start: 0, end: 100 },
      { text: '词', start: 100, end: 200 },
    ];
    expect(needsResegment(few, 'zh-CN')).toBe(false);
  });
});

describe('shouldUseAsrRefine / detectSubtitleStyle', () => {
  it('does not force refine for kind=asr when cues are polished phrases', () => {
    expect(shouldUseAsrRefine(POLISHED_UNPUNCT_ZH, 'zh-CN', 'asr')).toBe(false);
    expect(detectSubtitleStyle(POLISHED_UNPUNCT_ZH, 'zh-CN')).toBe('polished');
  });

  it('refines word-level crumbs regardless of kind', () => {
    expect(shouldUseAsrRefine(WORD_LEVEL_ZH, 'zh-CN', undefined)).toBe(true);
    expect(shouldUseAsrRefine(WORD_LEVEL_EN, 'en', 'asr')).toBe(true);
    expect(detectSubtitleStyle(WORD_LEVEL_EN, 'en')).toBe('asr-like');
  });
});

describe('lightCleanFragments', () => {
  it('strips chevrons and drops empty cues without merging', () => {
    const input: SubtitleFragment[] = [
      { text: '>> Hello', start: 0, end: 1000 },
      { text: '   ', start: 1000, end: 2000 },
      { text: 'world >> there', start: 2000, end: 3000 },
    ];
    const out = lightCleanFragments(input);
    expect(out).toEqual([
      { text: 'Hello', start: 0, end: 1000 },
      { text: 'world there', start: 2000, end: 3000 },
    ]);
  });
});

describe('postProcessSubtitles', () => {
  it('does not cross-merge polished unpunctuated Chinese', () => {
    const out = postProcessSubtitles(POLISHED_UNPUNCT_ZH, 'zh-CN');
    expect(out.length).toBe(POLISHED_UNPUNCT_ZH.length);
    expect(out.map(f => f.text)).toEqual(POLISHED_UNPUNCT_ZH.map(f => f.text));
    expect(out.map(f => f.start)).toEqual(POLISHED_UNPUNCT_ZH.map(f => f.start));
  });

  it('merges word-level English crumbs', () => {
    const out = postProcessSubtitles(WORD_LEVEL_EN, 'en');
    expect(out.length).toBeLessThan(WORD_LEVEL_EN.length);
    expect(out.length).toBeGreaterThan(0);
  });
});
