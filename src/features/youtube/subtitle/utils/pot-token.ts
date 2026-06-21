import type { CaptionTrack, PotToken } from './types';

/**
 * Extract POT token from YouTube player data or caption track
 * Priority: audioCaptionTracks > cachedTimedtextUrl
 */
export function extractPotToken(
  track: CaptionTrack,
  playerData?: any
): PotToken {
  // Try to extract from audioCaptionTracks in player data
  if (playerData?.captions?.playerCaptionsTracklistRenderer?.audioCaptionTracks) {
    const audioCaptionTracks = playerData.captions.playerCaptionsTracklistRenderer.audioCaptionTracks;

    for (const audioTrack of audioCaptionTracks) {
      if (audioTrack.vssId === track.vssId) {
        const url = new URL(audioTrack.baseUrl);
        return {
          pot: url.searchParams.get('pot'),
          potc: url.searchParams.get('potc')
        };
      }
    }
  }

  // Fallback: extract from track baseUrl
  try {
    const url = new URL(track.baseUrl);
    return {
      pot: url.searchParams.get('pot'),
      potc: url.searchParams.get('potc')
    };
  } catch {
    return { pot: null, potc: null };
  }
}

/**
 * Build cache hash key for a subtitle track
 */
export function buildTrackHash(
  videoId: string,
  track: CaptionTrack
): string {
  return `${videoId}:${track.languageCode}:${track.kind || 'asr'}:${track.vssId}`;
}
