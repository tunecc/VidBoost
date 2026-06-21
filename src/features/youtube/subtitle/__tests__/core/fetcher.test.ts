import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubtitleFetcher } from '../../core/fetcher';
import type { CaptionTrack, TimedTextEvent } from '../../utils/types';

describe('SubtitleFetcher', () => {
  let fetcher: SubtitleFetcher;
  let fetchMock: ReturnType<typeof vi.fn>;

  const mockTrack: CaptionTrack = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=test123&lang=en',
    languageCode: 'en',
    kind: 'asr',
    vssId: 'a.en'
  };

  const mockPlayerData = {
    captions: {
      playerCaptionsTracklistRenderer: {
        audioCaptionTracks: [
          {
            vssId: 'a.en',
            baseUrl: 'https://www.youtube.com/api/timedtext?v=test123&lang=en&pot=test_pot&potc=test_potc'
          }
        ]
      }
    }
  };

  const mockTimedTextResponse = {
    events: [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: 'Hello' }]
      },
      {
        tStartMs: 1000,
        dDurationMs: 1000,
        segs: [{ utf8: 'World' }]
      }
    ] as TimedTextEvent[]
  };

  beforeEach(() => {
    fetcher = new SubtitleFetcher();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tryFastFetch', () => {
    it('should return cached result if available', async () => {
      const cachedResult = {
        fragments: [{ text: 'Cached', start: 0, end: 1 }],
        track: mockTrack,
        videoId: 'test123'
      };

      await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const result = await fetcher.tryFastFetch('test123', mockTrack, mockPlayerData);
      expect(result).toBeDefined();
    });

    it('should return null if POT token is missing', async () => {
      const trackWithoutPot: CaptionTrack = {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=test123&lang=en',
        languageCode: 'en',
        vssId: 'a.en'
      };

      const result = await fetcher.tryFastFetch('test123', trackWithoutPot);
      expect(result).toBeNull();
    });

    it('should return null on fetch failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetcher.tryFastFetch('test123', mockTrack, mockPlayerData);
      expect(result).toBeNull();
    });

    it('should fetch and cache on success', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const result = await fetcher.tryFastFetch('test123', mockTrack, mockPlayerData);
      expect(result).toBeDefined();
      expect(result?.fragments).toHaveLength(2);
      expect(result?.videoId).toBe('test123');

      // Verify caching
      const cachedResult = await fetcher.tryFastFetch('test123', mockTrack, mockPlayerData);
      expect(cachedResult).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1); // Should not fetch again
    });
  });

  describe('fetchWithFallback', () => {
    it('should use fast path if available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const result = await fetcher.fetchWithFallback('test123', mockTrack, mockPlayerData);
      expect(result).toBeDefined();
      expect(result.fragments).toHaveLength(2);
    });

    it('should fallback when fast path fails', async () => {
      const trackWithoutPot: CaptionTrack = {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=test123&lang=en',
        languageCode: 'en',
        vssId: 'a.en'
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const result = await fetcher.fetchWithFallback('test123', trackWithoutPot);
      expect(result).toBeDefined();
      expect(result.fragments).toHaveLength(2);
    });

    it('should throw error when all paths fail', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        fetcher.fetchWithFallback('test123', mockTrack, mockPlayerData)
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('Failed to fetch subtitles')
      });
    });
  });

  describe('fetchSubtitlesWithCache', () => {
    it('should return cached result if available', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const firstResult = await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);
      const secondResult = await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);

      expect(firstResult).toEqual(secondResult);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should fetch and parse subtitles', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const result = await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);

      expect(result.fragments).toHaveLength(2);
      expect(result.fragments[0].text).toBe('Hello');
      expect(result.fragments[1].text).toBe('World');
      expect(result.track).toEqual(mockTrack);
      expect(result.videoId).toBe('test123');
    });

    it('should add POT tokens to URL', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('pot=test_pot');
      expect(calledUrl).toContain('potc=test_potc');
      expect(calledUrl).toContain('fmt=json3');
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData)
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('Failed to fetch subtitles with cache')
      });
    });

    it('should handle HTTP errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(
        fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData)
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: 'HTTP 404: Not Found'
      });
    });

    it('should handle JSON parse errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      await expect(
        fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData)
      ).rejects.toMatchObject({
        code: 'PARSE_ERROR',
        message: 'Failed to parse JSON response'
      });
    });

    it('should handle invalid response structure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'data' })
      });

      await expect(
        fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData)
      ).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
        message: 'Response missing events array'
      });
    });

    it('should handle empty events array', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [] })
      });

      const result = await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);
      expect(result.fragments).toEqual([]);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);
      expect(fetcher.getCacheSize()).toBe(1);

      fetcher.clearCache();
      expect(fetcher.getCacheSize()).toBe(0);

      // Should fetch again after clearing
      await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should report cache size', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      expect(fetcher.getCacheSize()).toBe(0);

      await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);
      expect(fetcher.getCacheSize()).toBe(1);

      const anotherTrack: CaptionTrack = {
        ...mockTrack,
        languageCode: 'zh',
        vssId: 'a.zh'
      };

      await fetcher.fetchSubtitlesWithCache('test123', anotherTrack, mockPlayerData);
      expect(fetcher.getCacheSize()).toBe(2);
    });
  });

  describe('URL building', () => {
    it('should add json3 format if missing', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('fmt=json3');
    });

    it('should preserve existing format parameter', async () => {
      const trackWithFormat: CaptionTrack = {
        ...mockTrack,
        baseUrl: 'https://www.youtube.com/api/timedtext?v=test123&lang=en&fmt=json3'
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      await fetcher.fetchSubtitlesWithCache('test123', trackWithFormat, mockPlayerData);

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('fmt=json3');
      expect((calledUrl.match(/fmt=/g) || []).length).toBe(1); // Only one fmt param
    });

    it('should extract videoId from baseUrl', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const result = await fetcher.fetchSubtitlesWithCache('test123', mockTrack, mockPlayerData);
      expect(result.videoId).toBe('test123');
    });

    it('should handle baseUrl without videoId', async () => {
      const trackWithoutVideoId: CaptionTrack = {
        ...mockTrack,
        baseUrl: 'https://www.youtube.com/api/timedtext?lang=en'
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTimedTextResponse
      });

      const result = await fetcher.fetchSubtitlesWithCache('unknown', trackWithoutVideoId, mockPlayerData);
      expect(result.videoId).toBe('');
    });
  });

  describe('defaultFetcher', () => {
    it('should provide singleton instance', async () => {
      const { defaultFetcher } = await import('../../core/fetcher');
      expect(defaultFetcher).toBeInstanceOf(SubtitleFetcher);
    });
  });
});
