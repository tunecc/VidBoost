import { SubtitleCache } from './cache';
import { extractPotToken, buildTrackHash } from '../utils/pot-token';
import { parseYouTubeSubtitleEvents } from '../parsers';
import type { CaptionTrack, SubtitleFragment, TimedTextEvent } from '../utils/types';

export type SubtitleResult = {
  fragments: SubtitleFragment[];
  track: CaptionTrack;
  videoId: string;
};

export type FetchError = {
  code: 'NETWORK_ERROR' | 'PARSE_ERROR' | 'NO_TRACKS' | 'INVALID_RESPONSE';
  message: string;
  originalError?: unknown;
};

type TimedTextResponse = {
  events?: TimedTextEvent[];
};

/**
 * YouTube subtitle fetcher with caching and dual-path strategy
 */
export class SubtitleFetcher {
  private cache: SubtitleCache<SubtitleResult>;

  constructor(cacheTtlMs: number = 5 * 60 * 1000) {
    this.cache = new SubtitleCache<SubtitleResult>(cacheTtlMs);
  }

  /**
   * Try fast fetch path - assumes POT token is available
   */
  async tryFastFetch(videoId: string, track: CaptionTrack, playerData?: any): Promise<SubtitleResult | null> {
    const cacheKey = buildTrackHash(videoId, track);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const potToken = extractPotToken(track, playerData);
    if (!potToken.pot || !potToken.potc) {
      return null;
    }

    try {
      const result = await this.fetchSubtitles(track, playerData);
      this.cache.set(cacheKey, result);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Fetch with fallback strategy
   */
  async fetchWithFallback(videoId: string, track: CaptionTrack, playerData?: any): Promise<SubtitleResult> {
    // Try fast path first
    const fastResult = await this.tryFastFetch(videoId, track, playerData);
    if (fastResult) {
      return fastResult;
    }

    // Fallback: fetch without POT validation
    const cacheKey = buildTrackHash(videoId, track);
    try {
      const result = await this.fetchSubtitles(track, playerData);
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw this.createFetchError('NETWORK_ERROR', 'Failed to fetch subtitles', error);
    }
  }

  /**
   * Fetch subtitles with cache check
   */
  async fetchSubtitlesWithCache(videoId: string, track: CaptionTrack, playerData?: any): Promise<SubtitleResult> {
    const cacheKey = buildTrackHash(videoId, track);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.fetchSubtitles(track, playerData);
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw this.createFetchError('NETWORK_ERROR', 'Failed to fetch subtitles with cache', error);
    }
  }

  /**
   * Core fetch implementation - fetches and parses subtitles
   */
  private async fetchSubtitles(track: CaptionTrack, playerData?: any): Promise<SubtitleResult> {
    const potToken = extractPotToken(track, playerData);
    const url = this.buildTimedTextUrl(track.baseUrl, potToken.pot, potToken.potc);

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw this.createFetchError('NETWORK_ERROR', `Failed to fetch from ${url}`, error);
    }

    if (!response.ok) {
      throw this.createFetchError(
        'NETWORK_ERROR',
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    let data: TimedTextResponse;
    try {
      data = await response.json();
    } catch (error) {
      throw this.createFetchError('PARSE_ERROR', 'Failed to parse JSON response', error);
    }

    if (!data.events || !Array.isArray(data.events)) {
      throw this.createFetchError('INVALID_RESPONSE', 'Response missing events array');
    }

    const fragments = parseYouTubeSubtitleEvents(data.events, track.languageCode);

    // Extract videoId from baseUrl
    const videoId = this.extractVideoId(track.baseUrl);

    return {
      fragments,
      track,
      videoId
    };
  }

  /**
   * Build timedtext API URL with POT tokens
   */
  private buildTimedTextUrl(baseUrl: string, pot: string | null, potc: string | null): string {
    const url = new URL(baseUrl);

    // Ensure json3 format
    if (!url.searchParams.has('fmt')) {
      url.searchParams.set('fmt', 'json3');
    }

    // Add POT tokens if available
    if (pot) {
      url.searchParams.set('pot', pot);
    }
    if (potc) {
      url.searchParams.set('potc', potc);
    }

    return url.toString();
  }

  /**
   * Extract videoId from timedtext URL
   */
  private extractVideoId(baseUrl: string): string {
    try {
      const url = new URL(baseUrl);
      return url.searchParams.get('v') || '';
    } catch {
      return '';
    }
  }

  /**
   * Create typed fetch error
   */
  private createFetchError(code: FetchError['code'], message: string, originalError?: unknown): FetchError {
    return {
      code,
      message,
      originalError
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size();
  }
}

/**
 * Singleton instance for convenience
 */
export const defaultFetcher = new SubtitleFetcher();
