import { describe, it, expect } from 'vitest';
import { extractPotToken } from '../../utils/pot-token';
import type { CaptionTrack, PotToken } from '../../utils/types';

describe('extractPotToken', () => {
  const mockTrack: CaptionTrack = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=test123',
    languageCode: 'en',
    vssId: '.en',
  };

  describe('priority: audioCaptionTracks', () => {
    it('should extract POT token from audioCaptionTracks when available', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            audioCaptionTracks: [
              {
                captionTrackIndices: [0],
                visibility: 'UNKNOWN',
                pot: 'test_pot_token_audio',
                potc: 'test_potc_token_audio',
              },
            ],
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: 'test_pot_token_audio',
        potc: 'test_potc_token_audio',
      });
    });

    it('should handle missing potc in audioCaptionTracks', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            audioCaptionTracks: [
              {
                captionTrackIndices: [0],
                visibility: 'UNKNOWN',
                pot: 'test_pot_token_only',
              },
            ],
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: 'test_pot_token_only',
        potc: null,
      });
    });

    it('should use first audioCaptionTrack when multiple exist', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            audioCaptionTracks: [
              {
                captionTrackIndices: [0],
                pot: 'first_pot',
                potc: 'first_potc',
              },
              {
                captionTrackIndices: [1],
                pot: 'second_pot',
                potc: 'second_potc',
              },
            ],
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: 'first_pot',
        potc: 'first_potc',
      });
    });
  });

  describe('fallback: cachedTimedtextUrl', () => {
    it('should extract POT token from cachedTimedtextUrl when audioCaptionTracks unavailable', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            cachedTimedtextUrl: 'https://www.youtube.com/api/timedtext?pot=cached_pot&potc=cached_potc',
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: 'cached_pot',
        potc: 'cached_potc',
      });
    });

    it('should extract only pot when potc missing in cachedTimedtextUrl', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            cachedTimedtextUrl: 'https://www.youtube.com/api/timedtext?pot=cached_pot_only',
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: 'cached_pot_only',
        potc: null,
      });
    });

    it('should handle cachedTimedtextUrl with multiple params', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            cachedTimedtextUrl: 'https://www.youtube.com/api/timedtext?v=test&lang=en&pot=url_pot&potc=url_potc&fmt=json3',
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: 'url_pot',
        potc: 'url_potc',
      });
    });
  });

  describe('edge cases', () => {
    it('should return null tokens when no source available', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {},
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should return null tokens when captions missing', () => {
      const playerData = {};

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should return null tokens when playerCaptionsTracklistRenderer missing', () => {
      const playerData = {
        captions: {},
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should return null tokens when audioCaptionTracks is empty array', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            audioCaptionTracks: [],
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should return null tokens when cachedTimedtextUrl has no pot params', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            cachedTimedtextUrl: 'https://www.youtube.com/api/timedtext?v=test&lang=en',
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should prefer audioCaptionTracks over cachedTimedtextUrl', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            audioCaptionTracks: [
              {
                captionTrackIndices: [0],
                pot: 'audio_pot',
                potc: 'audio_potc',
              },
            ],
            cachedTimedtextUrl: 'https://www.youtube.com/api/timedtext?pot=cached_pot&potc=cached_potc',
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: 'audio_pot',
        potc: 'audio_potc',
      });
    });
  });

  describe('malformed input handling', () => {
    it('should handle null playerData', () => {
      const result = extractPotToken(mockTrack, null);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should handle undefined playerData', () => {
      const result = extractPotToken(mockTrack, undefined);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should handle audioCaptionTrack without pot field', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            audioCaptionTracks: [
              {
                captionTrackIndices: [0],
                visibility: 'UNKNOWN',
              },
            ],
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });

    it('should handle invalid URL in cachedTimedtextUrl', () => {
      const playerData = {
        captions: {
          playerCaptionsTracklistRenderer: {
            cachedTimedtextUrl: 'not-a-valid-url',
          },
        },
      };

      const result = extractPotToken(mockTrack, playerData);

      expect(result).toEqual({
        pot: null,
        potc: null,
      });
    });
  });
});
