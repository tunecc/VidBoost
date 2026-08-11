import { describe, expect, it } from 'vitest';
import { buildSubtitleCatalog, selectTranslationSource } from '../catalog';
import type { YouTubeSubtitlePlayerData } from '../../../subtitleOverlay.shared';

function playerData(
    patch: Partial<YouTubeSubtitlePlayerData> = {}
): YouTubeSubtitlePlayerData {
    return {
        videoId: 'video-1',
        channelKey: 'channel-1',
        captionTracks: [],
        translationLanguages: [],
        audioCaptionTracks: [],
        device: null,
        cver: null,
        playerState: 1,
        selectedTrack: { languageCode: null, vssId: null, kind: null },
        cachedTimedtextUrl: null,
        ...patch
    };
}

describe('buildSubtitleCatalog', () => {
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

    it('keeps physical tracks for resolution but deduplicates the menu by target language', () => {
        const catalog = buildSubtitleCatalog(playerData({ captionTracks: [asrEn, authorEn] }));
        expect(catalog.providedOptions).toHaveLength(2);
        expect(catalog.menuGroups.provided).toHaveLength(1);
        expect(catalog.menuGroups.provided[0]).toMatchObject({
            kind: 'provided',
            sourceKind: 'author',
            targetLanguageCode: 'en'
        });
    });

    it('excludes auto-translation targets already provided by the video', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [authorEn],
            translationLanguages: [
                { languageCode: 'en', languageName: { simpleText: 'English' } },
                { languageCode: 'zh-Hans', languageName: { simpleText: 'Chinese (Simplified)' } }
            ]
        }));
        expect(catalog.menuGroups.translated.map((option) => option.targetLanguageCode))
            .toEqual(['zh-Hans']);
    });

    it('uses the selected translatable track before author and ASR fallbacks', () => {
        const selectedAsr = playerData({
            captionTracks: [authorEn, asrEn],
            selectedTrack: { languageCode: 'en', vssId: 'a.en', kind: 'asr' }
        });
        expect(selectTranslationSource(selectedAsr)?.vssId).toBe('a.en');
    });

    it('keeps Simplified and Traditional Chinese targets separate', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [authorEn],
            translationLanguages: [
                { languageCode: 'zh-Hans', languageName: { simpleText: 'Chinese (Simplified)' } },
                { languageCode: 'zh-Hant', languageName: { simpleText: 'Chinese (Traditional)' } }
            ]
        }));
        expect(catalog.menuGroups.translated).toHaveLength(2);
    });
});
