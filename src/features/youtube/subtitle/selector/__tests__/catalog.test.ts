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

function translation(code: string, label: string) {
    return { languageCode: code, languageName: { simpleText: label } };
}

describe('buildSubtitleCatalog auto-translate ordering', () => {
    const enTrack = {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=en',
        languageCode: 'en',
        vssId: '.en',
        isTranslatable: true,
        name: { simpleText: 'English' }
    };
    const zhHansTrack = {
        ...enTrack,
        baseUrl: 'https://www.youtube.com/api/timedtext?v=video-1&lang=zh-Hans',
        languageCode: 'zh-Hans',
        vssId: '.zh-Hans',
        name: { simpleText: '简体中文' }
    };
    const rest = [
        translation('de', '德语'),
        translation('ja', '日语'),
        translation('ko', '韩语'),
        translation('en', '英语')
    ];

    it('A1: pins Simplified then Traditional Chinese above the alphabetical tail', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [enTrack],
            translationLanguages: [
                ...rest,
                translation('zh-Hant', '繁体中文'),
                translation('zh-Hans', '简体中文')
            ]
        }));
        expect(catalog.menuGroups.translated.map((option) => option.label)).toEqual([
            '简体中文',
            '繁体中文',
            '德语',
            '韩语',
            '日语'
        ]);
    });

    it('A2: pins by language code, not by label text', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [enTrack],
            translationLanguages: [
                translation('es', 'Spanish'),
                translation('zh-Hant', 'Chinese (Traditional)'),
                translation('zh-Hans', 'Chinese (Simplified)')
            ]
        }));
        expect(catalog.menuGroups.translated.map((option) => option.targetLanguageCode))
            .toEqual(['zh-Hans', 'zh-Hant', 'es']);
    });

    it('A3: lets Traditional Chinese move first when Simplified is already provided', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [enTrack, zhHansTrack],
            translationLanguages: [
                ...rest,
                translation('zh-Hans', '简体中文'),
                translation('zh-Hant', '繁体中文')
            ]
        }));
        const codes = catalog.menuGroups.translated.map((option) => option.targetLanguageCode);
        expect(codes).toEqual(['zh-Hant', 'de', 'ko', 'ja']);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('A4: keeps a plain alphabetical tail and leaves provided ordering alone without Chinese', () => {
        const translated = buildSubtitleCatalog(playerData({
            captionTracks: [enTrack],
            translationLanguages: rest
        }));
        expect(translated.menuGroups.translated.map((option) => option.label))
            .toEqual(['德语', '韩语', '日语']);

        const provided = buildSubtitleCatalog(playerData({
            captionTracks: [
                { ...enTrack, languageCode: 'ko', vssId: '.ko', name: { simpleText: '韩语' } },
                { ...enTrack, languageCode: 'de', vssId: '.de', name: { simpleText: '德语' } },
                { ...enTrack, languageCode: 'ja', vssId: '.ja', name: { simpleText: '日语' } }
            ]
        }));
        expect(provided.menuGroups.provided.map((option) => option.label))
            .toEqual(['德语', '韩语', '日语']);
    });

    it('A5: orders Simplified before Traditional across region and script spellings', () => {
        const catalog = buildSubtitleCatalog(playerData({
            captionTracks: [enTrack],
            translationLanguages: [
                translation('zh-TW', '中文（台湾）'),
                translation('zh-HK', '中文（香港）'),
                translation('zh-CN', '中文（中国）'),
                translation('zh', '中文')
            ]
        }));
        expect(catalog.menuGroups.translated.map((option) => option.targetLanguageCode))
            .toEqual(['zh-CN', 'zh-TW', 'zh']);
    });
});
