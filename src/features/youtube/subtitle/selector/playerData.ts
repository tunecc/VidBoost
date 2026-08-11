import type {
    YouTubeSubtitleCaptionTrack,
    YouTubeSubtitleTranslationLanguage,
    YouTubeTextValue
} from '../../subtitleOverlay.shared';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

export function normalizeYouTubeTextValue(value: unknown): YouTubeTextValue | undefined {
    if (!isRecord(value)) return undefined;

    const simpleText = typeof value.simpleText === 'string' ? value.simpleText.trim() : '';
    const runs = Array.isArray(value.runs)
        ? value.runs.flatMap((run) => (
            isRecord(run) && typeof run.text === 'string' ? [run.text] : []
        ))
        : [];
    const flattened = simpleText || runs.join('').trim();
    return flattened ? { simpleText: flattened } : undefined;
}

function normalizeTrack(value: unknown, origin: string): YouTubeSubtitleCaptionTrack | null {
    if (!isRecord(value)) return null;
    if (typeof value.baseUrl !== 'string' || !value.baseUrl.trim()) return null;
    if (typeof value.languageCode !== 'string' || !value.languageCode.trim()) return null;
    if (typeof value.vssId !== 'string' || !value.vssId.trim()) return null;

    let baseUrl: string;
    try {
        baseUrl = new URL(value.baseUrl, origin).toString();
    } catch {
        return null;
    }

    const track: YouTubeSubtitleCaptionTrack = {
        baseUrl,
        languageCode: value.languageCode.trim(),
        vssId: value.vssId.trim()
    };

    if (typeof value.kind === 'string' && value.kind.trim()) track.kind = value.kind.trim();
    if (typeof value.trackName === 'string' && value.trackName.trim()) {
        track.trackName = value.trackName.trim();
    }
    if (typeof value.isTranslatable === 'boolean') track.isTranslatable = value.isTranslatable;

    const name = normalizeYouTubeTextValue(value.name);
    if (name) track.name = name;
    return track;
}

function normalizeTranslationLanguage(value: unknown): YouTubeSubtitleTranslationLanguage | null {
    if (!isRecord(value)) return null;
    if (typeof value.languageCode !== 'string' || !value.languageCode.trim()) return null;
    const languageName = normalizeYouTubeTextValue(value.languageName);
    if (!languageName) return null;
    return {
        languageCode: value.languageCode.trim(),
        languageName
    };
}

export function normalizeYouTubeSubtitleTracklistRenderer(
    value: unknown,
    origin: string
): {
    captionTracks: YouTubeSubtitleCaptionTrack[];
    translationLanguages: YouTubeSubtitleTranslationLanguage[];
} {
    if (!isRecord(value)) {
        return { captionTracks: [], translationLanguages: [] };
    }

    const captionTracks = Array.isArray(value.captionTracks)
        ? value.captionTracks.flatMap((track) => {
            const normalized = normalizeTrack(track, origin);
            return normalized ? [normalized] : [];
        })
        : [];
    const translationLanguages = Array.isArray(value.translationLanguages)
        ? value.translationLanguages.flatMap((language) => {
            const normalized = normalizeTranslationLanguage(language);
            return normalized ? [normalized] : [];
        })
        : [];

    return { captionTracks, translationLanguages };
}
