import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubtitleController } from '../../core/controller';
import { SubtitleFetcher } from '../../core/fetcher';
import type { CaptionTrack, SubtitleFragment } from '../../utils/types';

describe('SubtitleController', () => {
  let controller: SubtitleController;
  let mockFetcher: SubtitleFetcher;

  const mockTrack: CaptionTrack = {
    baseUrl: 'https://example.com/timedtext?v=test123',
    languageCode: 'en',
    vssId: 'en.test',
    trackName: 'English'
  };

  const mockFragments: SubtitleFragment[] = [
    { text: 'First sentence of the subtitle that is long enough to stand alone here today', start: 0, end: 1000 },
    { text: 'Second sentence of the subtitle that is also long enough for testing now', start: 2500, end: 4000 },
    { text: 'Third sentence continues here with enough words to be a proper segment', start: 5500, end: 7000 },
    { text: 'Fourth sentence wraps up the test data with plenty of content here', start: 8500, end: 10000 }
  ];

  beforeEach(() => {
    mockFetcher = new SubtitleFetcher();
    vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
      fragments: mockFragments,
      track: mockTrack,
      videoId: 'test123'
    });
    controller = new SubtitleController(mockFetcher);
  });

  describe('initialization', () => {
    it('should initialize with idle state', async () => {
      await controller.initialize('test123');
      expect(controller.getState()).toBe('idle');
    });

    it('should store video context', async () => {
      const playerData = { foo: 'bar' };
      await controller.initialize('test123', playerData);
      expect(controller.getState()).toBe('idle');
    });
  });

  describe('track management', () => {
    beforeEach(async () => {
      await controller.initialize('test123');
    });

    it('should load track and fragments', async () => {
      await controller.setTrack(mockTrack);

      expect(controller.getState()).toBe('ready');
      expect(controller.getCurrentTrack()).toEqual(mockTrack);
      expect(controller.getFragments()).toEqual(mockFragments);
    });

    it('should emit trackChange event', async () => {
      const listener = vi.fn();
      controller.on('trackChange', listener);

      await controller.setTrack(mockTrack);

      expect(listener).toHaveBeenCalledWith(mockTrack);
    });

    it('should transition through loading state', async () => {
      const states: string[] = [];
      controller.on('stateChange', (state) => states.push(state));

      await controller.setTrack(mockTrack);

      expect(states).toEqual(['loading', 'ready']);
    });

    it('should skip loading same track', async () => {
      await controller.setTrack(mockTrack);
      const fetchSpy = vi.spyOn(mockFetcher, 'fetchWithFallback');

      await controller.setTrack(mockTrack);

      // Same vssId short-circuits before fetch
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    it('should clear track when null', async () => {
      await controller.setTrack(mockTrack);
      await controller.setTrack(null);

      expect(controller.getCurrentTrack()).toBeNull();
      expect(controller.getFragments()).toEqual([]);
      expect(controller.getState()).toBe('idle');
    });

    it('should handle fetch error', async () => {
      const error = new Error('Fetch failed');
      vi.spyOn(mockFetcher, 'fetchWithFallback').mockRejectedValue(error);

      const errorListener = vi.fn();
      controller.on('error', errorListener);

      await controller.setTrack(mockTrack);

      expect(controller.getState()).toBe('error');
      expect(errorListener).toHaveBeenCalledWith(error);
    });
  });

  describe('time tracking', () => {
    beforeEach(async () => {
      await controller.initialize('test123');
      await controller.setTrack(mockTrack);
    });

    it('should find fragment at exact start time', () => {
      controller.updateTime(2500);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toContain('Second');
    });

    it('should find fragment in middle of range', () => {
      controller.updateTime(3000);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toContain('Second');
    });

    it('should find fragment at edge before end', () => {
      controller.updateTime(3999);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toContain('Second');
    });

    it('should return null before first fragment', () => {
      controller.updateTime(-100);
      const fragment = controller.getCurrentFragment();
      expect(fragment).toBeNull();
    });

    it('should return last fragment after all fragments', () => {
      controller.updateTime(15000);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toContain('Fourth');
    });

    it('should emit fragmentChange when fragment changes', () => {
      const listener = vi.fn();
      controller.on('fragmentChange', listener);

      // Move to second fragment
      controller.updateTime(3000);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]?.text).toContain('Second');

      // Move to third fragment
      controller.updateTime(6000);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[1][0]?.text).toContain('Third');
    });

    it('should not emit fragmentChange when staying in same fragment', () => {
      const listener = vi.fn();
      controller.updateTime(2500);
      controller.on('fragmentChange', listener);

      controller.updateTime(3000);
      controller.updateTime(3500);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle getFragmentAt', () => {
      expect(controller.getFragmentAt(0)?.text).toContain('First');
      expect(controller.getFragmentAt(6000)?.text).toContain('Third');
      expect(controller.getFragmentAt(15000)?.text).toContain('Fourth');
    });
  });

  describe('binary search edge cases', () => {
    beforeEach(async () => {
      await controller.initialize('test123');
    });

    it('should handle empty fragments', async () => {
      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: [],
        track: mockTrack,
        videoId: 'test123'
      });

      await controller.setTrack(mockTrack);
      controller.updateTime(1000);

      expect(controller.getCurrentFragment()).toBeNull();
    });

    it('should handle single fragment', async () => {
      const singleFragment = [{ text: 'Only', start: 0, end: 1000 }];
      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: singleFragment,
        track: mockTrack,
        videoId: 'test123'
      });

      await controller.setTrack(mockTrack);
      controller.updateTime(500);

      expect(controller.getCurrentFragment()?.text).toBe('Only');
    });

    it('should handle gaps between fragments', async () => {
      const gappedFragments = [
        { text: 'First sentence that is long enough to be a real subtitle segment here', start: 0, end: 1000 },
        { text: 'Second sentence that is also long enough to stand on its own today', start: 3000, end: 4000 }
      ];
      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: gappedFragments,
        track: mockTrack,
        videoId: 'test123'
      });

      await controller.setTrack(mockTrack);
      controller.updateTime(1500); // In gap

      expect(controller.getCurrentFragment()?.text).toContain('First');
    });
  });

  describe('content-aware routing', () => {
    beforeEach(async () => {
      await controller.initialize('test123');
    });

    it('passes through Chinese pseudo-manual phrase cues without forced merge', async () => {
      const zhTrack: CaptionTrack = {
        baseUrl: 'https://example.com/timedtext?v=test123&lang=zh-CN',
        languageCode: 'zh-CN',
        vssId: '.zh-CN',
        trackName: 'Chinese (Simplified)',
      };

      const pseudoManual: SubtitleFragment[] = [
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

      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: pseudoManual,
        track: zhTrack,
        videoId: 'test123',
      });

      await controller.setTrack(zhTrack);

      const fragments = controller.getFragments();
      // Phrase-level unpunctuated Chinese: passthrough (no cross-cue merge)
      expect(fragments.length).toBe(pseudoManual.length);
      expect(fragments.map(f => f.text)).toEqual(pseudoManual.map(f => f.text));
    });

    it('refines word-level crumbs even when kind is missing', async () => {
      const crumbTrack: CaptionTrack = {
        baseUrl: 'https://example.com/timedtext?v=test123&lang=en',
        languageCode: 'en',
        vssId: 'en.crumbs',
        trackName: 'English',
      };

      const crumbs: SubtitleFragment[] = Array.from({ length: 12 }, (_, i) => ({
        text: `w${i}`,
        start: i * 180,
        end: i * 180 + 120,
      }));

      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: crumbs,
        track: crumbTrack,
        videoId: 'test123',
      });

      await controller.setTrack(crumbTrack);

      const fragments = controller.getFragments();
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments.length).toBeLessThan(crumbs.length);
    });

    it('passes through phrase-level kind=asr without forced merge', async () => {
      const asrTrack: CaptionTrack = {
        baseUrl: 'https://example.com/timedtext?v=test123&lang=zh&kind=asr',
        languageCode: 'zh-CN',
        vssId: 'a.zh',
        trackName: 'Chinese (auto-generated)',
        kind: 'asr',
      };

      const phrases: SubtitleFragment[] = [
        { text: '他是中共历史上唯一的三朝帝师', start: 3700, end: 6800 },
        { text: '是三任总书记的幕后智囊', start: 6966, end: 9500 },
        { text: '充当党的理论的操盘手', start: 9733, end: 12433 },
        { text: '他也是中共历史上唯一的没有主政过一方', start: 12866, end: 16300 },
        { text: '仅仅是依靠智囊身份', start: 16400, end: 18000 },
        { text: '进入最高权力圈', start: 18000, end: 19733 },
      ];

      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: phrases,
        track: asrTrack,
        videoId: 'test123',
      });

      await controller.setTrack(asrTrack);

      const fragments = controller.getFragments();
      expect(fragments.length).toBe(phrases.length);
      expect(fragments.map(f => f.text)).toEqual(phrases.map(f => f.text));
    });
  });

  describe('event management', () => {
    it('should add and remove listeners', () => {
      const listener = vi.fn();

      controller.on('stateChange', listener);
      controller.off('stateChange', listener);
    });

    it('should handle multiple listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      controller.on('stateChange', listener1);
      controller.on('stateChange', listener2);

      await controller.setTrack(mockTrack);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should not throw if listener throws', async () => {
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const goodListener = vi.fn();

      controller.on('stateChange', badListener);
      controller.on('stateChange', goodListener);

      await controller.setTrack(mockTrack);

      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('should clear everything on destroy', async () => {
      await controller.initialize('test123');
      await controller.setTrack(mockTrack);

      controller.destroy();

      expect(controller.getCurrentTrack()).toBeNull();
      expect(controller.getFragments()).toEqual([]);
      expect(controller.getState()).toBe('idle');
    });

    it('should clear cache on destroy', async () => {
      const clearSpy = vi.spyOn(mockFetcher, 'clearCache');

      controller.destroy();

      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('state queries', () => {
    beforeEach(async () => {
      await controller.initialize('test123');
      await controller.setTrack(mockTrack);
    });

    it('should return current time', () => {
      controller.updateTime(1234);
      expect(controller.getCurrentTime()).toBe(1234);
    });

    it('should return all fragments', () => {
      expect(controller.getFragments()).toEqual(mockFragments);
    });

    it('should return current track', () => {
      expect(controller.getCurrentTrack()).toEqual(mockTrack);
    });

    it('should return current state', () => {
      expect(controller.getState()).toBe('ready');
    });
  });
});
