import { describe, expect, it } from 'vitest';
import type { YouTubeSubtitlePlayerData, YouTubeSubtitleSelectedTrack } from '../../../subtitleOverlay.shared';
import { buildSubtitleCatalog } from '../catalog';
import { resolveSubtitleOption } from '../resolver';

const noSelection: YouTubeSubtitleSelectedTrack = {
    languageCode: null,
    vssId: null,
    kind: null
};

function playerData(
    patch: Partial<YouTubeSubtitlePlayerData> = {}
): YouTubeSubtitlePlayerData {
    return {
        videoId: 'video-1',
        channelKey: null,
        captionTracks: [],
        translationLanguages: [],
        audioCaptionTracks: [],
        device: null,
        cver: null,
        playerState: 1,
        selectedTrack: noSelection,
        cachedTimedtextUrl: null,
        ...patch
    };
}

const authorEn = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
    languageCode: 'en',
    vssId: '.en',
    isTranslatable: true,
    name: { simpleText: 'English' }
};
const asrEn = {
    ...authorEn,
    baseUrl: `${authorEn.baseUrl}&kind=asr`,
    vssId: 'a.en',
    kind: 'asr',
    name: { simpleText: 'English (auto-generated)' }
};
const authorChinese = {
    baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=zh-CN',
    languageCode: 'zh-CN',
    vssId: '.zh-CN',
    name: { simpleText: 'Chinese' }
};

describe('resolveSubtitleOption', () => {
    it('prefers a provided author target over ASR and translation', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [asrEn, authorChinese],
            translationLanguages: [
                { languageCode: 'zh-Hans', languageName: { simpleText: 'Chinese (Simplified)' } }
            ]
        }));
        const option = resolveSubtitleOption(catalog, 'zh-CN', noSelection);
        expect(option).toMatchObject({ kind: 'provided', sourceKind: 'author' });
    });

    it('uses translation when the target language is not provided', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [authorEn],
            translationLanguages: [
                { languageCode: 'ja', languageName: { simpleText: 'Japanese' } }
            ]
        }));
        const option = resolveSubtitleOption(catalog, 'ja', noSelection);
        expect(option).toMatchObject({ kind: 'translated', targetLanguageCode: 'ja' });
    });

    it('preserves the exact YouTube selected physical track without a preference', () => {
        const catalog = buildSubtitleCatalog(playerData({ captionTracks: [authorEn, asrEn] }));
        const option = resolveSubtitleOption(catalog, '', {
            languageCode: 'en',
            vssId: 'a.en',
            kind: 'asr'
        });
        expect(option?.sourceTrack.vssId).toBe('a.en');
    });

    it('falls back to author, ASR, then the first physical option', () => {
        const catalog = buildSubtitleCatalog(playerData({ captionTracks: [asrEn, authorEn] }));
        const option = resolveSubtitleOption(catalog, 'de', noSelection);
        expect(option).toMatchObject({ kind: 'provided', sourceKind: 'author' });
    });
});
