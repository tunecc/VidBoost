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
    { text: 'First', start: 0, end: 1000 },
    { text: 'Second', start: 1000, end: 2000 },
    { text: 'Third', start: 2000, end: 3000 },
    { text: 'Fourth', start: 3000, end: 4000 }
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
      controller.updateTime(1000);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toBe('Second');
    });

    it('should find fragment in middle of range', () => {
      controller.updateTime(1500);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toBe('Second');
    });

    it('should find fragment at edge before end', () => {
      controller.updateTime(1999);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toBe('Second');
    });

    it('should return null before first fragment', () => {
      controller.updateTime(-100);
      const fragment = controller.getCurrentFragment();
      expect(fragment).toBeNull();
    });

    it('should return last fragment after all fragments', () => {
      controller.updateTime(5000);
      const fragment = controller.getCurrentFragment();
      expect(fragment?.text).toBe('Fourth');
    });

    it('should emit fragmentChange when fragment changes', () => {
      const listener = vi.fn();
      controller.on('fragmentChange', listener);

      // Move to second fragment
      controller.updateTime(1500);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(mockFragments[1]);

      // Move to third fragment
      controller.updateTime(2500);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(2, mockFragments[2]);
    });

    it('should not emit fragmentChange when staying in same fragment', () => {
      const listener = vi.fn();
      controller.updateTime(1000);
      controller.on('fragmentChange', listener);

      controller.updateTime(1500);
      controller.updateTime(1600);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle getFragmentAt', () => {
      expect(controller.getFragmentAt(0)?.text).toBe('First');
      expect(controller.getFragmentAt(2500)?.text).toBe('Third');
      expect(controller.getFragmentAt(5000)?.text).toBe('Fourth');
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
        { text: 'First', start: 0, end: 1000 },
        { text: 'Second', start: 2000, end: 3000 }
      ];
      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: gappedFragments,
        track: mockTrack,
        videoId: 'test123'
      });

      await controller.setTrack(mockTrack);
      controller.updateTime(1500); // In gap

      expect(controller.getCurrentFragment()?.text).toBe('First');
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
