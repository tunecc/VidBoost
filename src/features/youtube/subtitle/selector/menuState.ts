import { areTargetLanguagesCompatible } from './language';
import type { SubtitleMenuGroups, SubtitleOption } from './types';

export function filterSubtitleMenuGroups(
    groups: SubtitleMenuGroups,
    query: string
): SubtitleMenuGroups {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return groups;
    const matches = (option: SubtitleOption) => option.searchText.includes(normalized);
    return {
        provided: groups.provided.filter(matches),
        translated: groups.translated.filter(matches)
    };
}

export function flattenSubtitleMenuGroups(groups: SubtitleMenuGroups): SubtitleOption[] {
    return [...groups.provided, ...groups.translated];
}

export function getNextOptionIndex(
    length: number,
    currentIndex: number,
    delta: -1 | 1
): number {
    if (length <= 0) return -1;
    if (currentIndex < 0 || currentIndex >= length) return delta > 0 ? 0 : length - 1;
    return (currentIndex + delta + length) % length;
}

export function isSubtitleMenuOptionActive(
    option: SubtitleOption,
    activeOptionId: string,
    activeLanguageCode: string
): boolean {
    return option.id === activeOptionId
        || areTargetLanguagesCompatible(option.targetLanguageCode, activeLanguageCode);
}
