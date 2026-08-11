import { canonicalizeLanguageCode } from './language';
import type { SubtitleLoadTrigger, SubtitleOption } from './types';

export function getSubtitleOptionLanguage(option: SubtitleOption): string {
    return option.targetLanguageCode;
}

export function buildSubtitleOptionKey(videoId: string, option: SubtitleOption): string {
    return [
        videoId,
        option.kind,
        option.sourceTrack.vssId,
        option.sourceTrack.kind || '',
        canonicalizeLanguageCode(option.targetLanguageCode)
    ].join(':');
}

export function applySubtitleOptionTarget(url: URL, option: SubtitleOption): URL {
    if (option.kind === 'translated') {
        url.searchParams.set('tlang', option.translationLanguageCode);
    } else {
        url.searchParams.delete('tlang');
    }
    return url;
}

export function shouldKeepCurrentSubtitleOnFailure(
    trigger: SubtitleLoadTrigger,
    currentVideoId: string,
    expectedVideoId: string,
    hasFragments: boolean
): boolean {
    return trigger === 'user-selection'
        && currentVideoId === expectedVideoId
        && hasFragments;
}
