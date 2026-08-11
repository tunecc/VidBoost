import { describe, expect, it } from 'vitest';
import { normalizeYouTubeSubtitleTracklistRenderer } from '../playerData';

describe('normalizeYouTubeSubtitleTracklistRenderer', () => {
    it('normalizes caption URLs, text runs, and translation languages', () => {
        const result = normalizeYouTubeSubtitleTracklistRenderer({
            captionTracks: [{
                baseUrl: '/api/timedtext?v=video-1&lang=en',
                languageCode: 'en',
                vssId: 'a.en',
                kind: 'asr',
                isTranslatable: true,
                name: { runs: [{ text: 'English' }, { text: ' (auto-generated)' }] }
            }],
            translationLanguages: [{
                languageCode: 'zh-Hans',
                languageName: { runs: [{ text: 'Chinese' }, { text: ' (Simplified)' }] }
            }]
        }, 'https://www.youtube.com');

        expect(result.captionTracks).toEqual([expect.objectContaining({
            baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
            languageCode: 'en',
            vssId: 'a.en',
            kind: 'asr',
            isTranslatable: true,
            name: { simpleText: 'English (auto-generated)' }
        })]);
        expect(result.translationLanguages).toEqual([{
            languageCode: 'zh-Hans',
            languageName: { simpleText: 'Chinese (Simplified)' }
        }]);
    });

    it('drops malformed tracks and malformed translation entries', () => {
        const result = normalizeYouTubeSubtitleTracklistRenderer({
            captionTracks: [{ languageCode: 'en' }, null, { baseUrl: 4 }],
            translationLanguages: [{ languageName: { simpleText: 'Missing code' } }, null]
        }, 'https://www.youtube.com');
        expect(result).toEqual({ captionTracks: [], translationLanguages: [] });
    });
});
