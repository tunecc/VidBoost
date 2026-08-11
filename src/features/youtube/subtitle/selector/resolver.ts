import { areTargetLanguagesCompatible, canonicalizeLanguageCode } from './language';
import type {
    ProvidedSubtitleOption,
    SubtitleCatalog,
    SubtitleOption,
    YouTubeSubtitleSelectedTrack
} from './types';

function findSelectedProvided(
    options: ProvidedSubtitleOption[],
    selectedTrack: YouTubeSubtitleSelectedTrack
): ProvidedSubtitleOption | null {
    if (selectedTrack.vssId) {
        const byId = options.find((option) => option.sourceTrack.vssId === selectedTrack.vssId);
        if (byId) return byId;
    }
    if (selectedTrack.languageCode && selectedTrack.kind) {
        const byLanguageAndKind = options.find((option) => (
            option.sourceTrack.languageCode === selectedTrack.languageCode
            && (option.sourceTrack.kind ?? null) === selectedTrack.kind
        ));
        if (byLanguageAndKind) return byLanguageAndKind;
    }
    if (selectedTrack.languageCode) {
        const byLanguage = options.find((option) => (
            option.sourceTrack.languageCode === selectedTrack.languageCode
        ));
        if (byLanguage) return byLanguage;
    }
    return null;
}

function legacyFallback(
    options: ProvidedSubtitleOption[],
    selectedTrack: YouTubeSubtitleSelectedTrack
): ProvidedSubtitleOption | null {
    return findSelectedProvided(options, selectedTrack)
        || options.find((option) => (
            option.sourceKind === 'author' && !option.sourceTrack.name?.simpleText
        ))
        || options.find((option) => option.sourceKind === 'author')
        || options.find((option) => option.sourceKind === 'asr')
        || options[0]
        || null;
}

export function resolveSubtitleOption(
    catalog: SubtitleCatalog,
    preferredLanguageCode: string,
    selectedTrack: YouTubeSubtitleSelectedTrack
): SubtitleOption | null {
    const preferred = canonicalizeLanguageCode(preferredLanguageCode);
    if (preferred) {
        return catalog.providedOptions.find((option) => (
            option.sourceKind === 'author'
            && areTargetLanguagesCompatible(option.targetLanguageCode, preferred)
        ))
            || catalog.providedOptions.find((option) => (
                option.sourceKind === 'asr'
                && areTargetLanguagesCompatible(option.targetLanguageCode, preferred)
            ))
            || catalog.translatedOptions.find((option) => (
                areTargetLanguagesCompatible(option.targetLanguageCode, preferred)
            ))
            || legacyFallback(catalog.providedOptions, selectedTrack);
    }

    return legacyFallback(catalog.providedOptions, selectedTrack);
}
