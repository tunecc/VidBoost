import type {
    YouTubeSubtitleCaptionTrack,
    YouTubeSubtitlePlayerData,
    YouTubeSubtitleSelectedTrack,
    YouTubeSubtitleTranslationLanguage,
    YouTubeTextValue
} from '../../subtitleOverlay.shared';
import { areTargetLanguagesCompatible, canonicalizeLanguageCode } from './language';
import type {
    ProvidedSubtitleOption,
    SubtitleCatalog,
    TranslatedSubtitleOption
} from './types';

export function getYouTubeText(value: YouTubeTextValue | undefined): string {
    return value?.simpleText?.trim()
        || value?.runs?.map((run) => run.text).join('').trim()
        || '';
}

function findSelectedCaptionTrack(
    tracks: YouTubeSubtitleCaptionTrack[],
    selectedTrack: YouTubeSubtitleSelectedTrack
): YouTubeSubtitleCaptionTrack | null {
    if (selectedTrack.vssId) {
        const byId = tracks.find((track) => track.vssId === selectedTrack.vssId);
        if (byId) return byId;
    }
    if (selectedTrack.languageCode && selectedTrack.kind) {
        const byLanguageAndKind = tracks.find((track) => (
            track.languageCode === selectedTrack.languageCode
            && (track.kind ?? null) === selectedTrack.kind
        ));
        if (byLanguageAndKind) return byLanguageAndKind;
    }
    if (selectedTrack.languageCode) {
        return tracks.find((track) => track.languageCode === selectedTrack.languageCode) || null;
    }
    return null;
}

export function selectTranslationSource(
    playerData: YouTubeSubtitlePlayerData
): YouTubeSubtitleCaptionTrack | null {
    const tracks = playerData.captionTracks.filter((track) => track.isTranslatable === true);
    return findSelectedCaptionTrack(tracks, playerData.selectedTrack)
        || tracks.find((track) => track.kind !== 'asr')
        || tracks.find((track) => track.kind === 'asr')
        || null;
}

function toProvidedOption(track: YouTubeSubtitleCaptionTrack): ProvidedSubtitleOption {
    const targetLanguageCode = canonicalizeLanguageCode(track.languageCode);
    const label = getYouTubeText(track.name) || track.trackName?.trim() || targetLanguageCode;
    const sourceKind = track.kind === 'asr' ? 'asr' : 'author';
    return {
        kind: 'provided',
        id: `provided:${track.vssId}:${targetLanguageCode}`,
        targetLanguageCode,
        label,
        searchText: `${label} ${targetLanguageCode}`.toLocaleLowerCase(),
        sourceTrack: track,
        sourceKind
    };
}

function deduplicateProvidedForMenu(
    options: ProvidedSubtitleOption[]
): ProvidedSubtitleOption[] {
    const deduplicated: ProvidedSubtitleOption[] = [];
    for (const option of options) {
        const existingIndex = deduplicated.findIndex((current) => (
            areTargetLanguagesCompatible(current.targetLanguageCode, option.targetLanguageCode)
        ));
        if (existingIndex < 0) {
            deduplicated.push(option);
            continue;
        }
        if (option.sourceKind === 'author' && deduplicated[existingIndex].sourceKind === 'asr') {
            deduplicated[existingIndex] = option;
        }
    }
    return deduplicated.sort((left, right) => left.label.localeCompare(right.label));
}

function toTranslatedOption(
    sourceTrack: YouTubeSubtitleCaptionTrack,
    language: YouTubeSubtitleTranslationLanguage
): TranslatedSubtitleOption {
    const targetLanguageCode = canonicalizeLanguageCode(language.languageCode);
    const label = getYouTubeText(language.languageName) || targetLanguageCode;
    return {
        kind: 'translated',
        id: `translated:${sourceTrack.vssId}:${targetLanguageCode}`,
        targetLanguageCode,
        label,
        searchText: `${label} ${targetLanguageCode}`.toLocaleLowerCase(),
        sourceTrack,
        translationLanguageCode: targetLanguageCode
    };
}

export function buildSubtitleCatalog(
    playerData: YouTubeSubtitlePlayerData
): SubtitleCatalog {
    const providedOptions = playerData.captionTracks.map(toProvidedOption);
    const preferredProvidedByLanguage = deduplicateProvidedForMenu(providedOptions);
    const sourceTrack = selectTranslationSource(playerData);
    const translatedOptions: TranslatedSubtitleOption[] = [];

    if (sourceTrack) {
        for (const language of playerData.translationLanguages) {
            if (preferredProvidedByLanguage.some((option) => (
                areTargetLanguagesCompatible(option.targetLanguageCode, language.languageCode)
            ))) {
                continue;
            }
            const translated = toTranslatedOption(sourceTrack, language);
            if (translatedOptions.some((option) => (
                areTargetLanguagesCompatible(option.targetLanguageCode, translated.targetLanguageCode)
            ))) {
                continue;
            }
            translatedOptions.push(translated);
        }
    }

    translatedOptions.sort((left, right) => left.label.localeCompare(right.label));
    return {
        providedOptions,
        translatedOptions,
        menuGroups: {
            provided: preferredProvidedByLanguage,
            translated: translatedOptions
        }
    };
}
