/**
 * SubtitleFetcher Usage Examples
 *
 * This file demonstrates how to use the SubtitleFetcher module.
 */

import { SubtitleFetcher, defaultFetcher, type SubtitleResult } from './fetcher';
import type { CaptionTrack } from '../utils/types';

// Example 1: Using the default singleton instance
async function fetchSubtitlesSimple(videoId: string, track: CaptionTrack) {
  try {
    const result = await defaultFetcher.fetchSubtitlesWithCache(videoId, track);
    console.log(`Fetched ${result.fragments.length} subtitle fragments`);
    return result;
  } catch (error) {
    console.error('Failed to fetch subtitles:', error);
    throw error;
  }
}

// Example 2: Optimistic fetch (non-throwing)
async function tryFetchOptimistically(
  videoId: string,
  track: CaptionTrack,
  playerData?: any
) {
  const result = await defaultFetcher.tryFastFetch(videoId, track, playerData);

  if (result) {
    console.log('Fast fetch succeeded!');
    return result;
  } else {
    console.log('Fast fetch failed (no POT token or network error)');
    return null;
  }
}

// Example 3: Fetch with fallback strategy
async function fetchWithRetry(
  videoId: string,
  track: CaptionTrack,
  playerData?: any
) {
  try {
    // Tries fast path first, then falls back
    const result = await defaultFetcher.fetchWithFallback(videoId, track, playerData);
    return result;
  } catch (error: any) {
    // Handle typed errors
    if (error.code === 'NETWORK_ERROR') {
      console.error('Network issue:', error.message);
    } else if (error.code === 'PARSE_ERROR') {
      console.error('Invalid response format:', error.message);
    }
    throw error;
  }
}

// Example 4: Custom fetcher instance with different TTL
async function createCustomFetcher() {
  // Cache for 10 minutes instead of default 5
  const fetcher = new SubtitleFetcher(10 * 60 * 1000);

  const track: CaptionTrack = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
    languageCode: 'en',
    kind: 'asr',
    vssId: 'a.en'
  };

  const result = await fetcher.fetchSubtitlesWithCache('abc123', track);

  // Check cache status
  console.log(`Cache size: ${fetcher.getCacheSize()}`);

  // Clear cache when needed
  fetcher.clearCache();

  return result;
}

// Example 5: Batch fetching multiple tracks
async function fetchMultipleTracks(
  videoId: string,
  tracks: CaptionTrack[],
  playerData?: any
) {
  const results = await Promise.allSettled(
    tracks.map(track =>
      defaultFetcher.fetchSubtitlesWithCache(videoId, track, playerData)
    )
  );

  const successful: SubtitleResult[] = [];
  const failed: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push(tracks[index].languageCode);
    }
  });

  console.log(`Fetched ${successful.length}/${tracks.length} tracks`);
  if (failed.length > 0) {
    console.log(`Failed tracks: ${failed.join(', ')}`);
  }

  return successful;
}

// Example 6: Processing fetched fragments
async function fetchAndProcess(videoId: string, track: CaptionTrack) {
  const result = await defaultFetcher.fetchSubtitlesWithCache(videoId, track);

  // Process fragments
  const totalDuration = result.fragments.reduce(
    (sum: number, frag) => sum + (frag.end - frag.start),
    0
  );

  const allText = result.fragments.map((f) => f.text).join(' ');

  console.log({
    videoId: result.videoId,
    language: result.track.languageCode,
    fragmentCount: result.fragments.length,
    totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
    wordCount: allText.split(/\s+/).length
  });

  return result;
}

export {
  fetchSubtitlesSimple,
  tryFetchOptimistically,
  fetchWithRetry,
  createCustomFetcher,
  fetchMultipleTracks,
  fetchAndProcess
};
