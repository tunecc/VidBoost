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

      expect(fetchSpy).toHaveBeenCalledTimes(1);
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
