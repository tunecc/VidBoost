import type {
    YouTubeSubtitleCaptionTrack,
    YouTubeSubtitlePlayerData,
    YouTubeSubtitleSelectedTrack
} from '../../subtitleOverlay.shared';

type SubtitleOptionBase = {
    id: string;
    targetLanguageCode: string;
    label: string;
    searchText: string;
    sourceTrack: YouTubeSubtitleCaptionTrack;
};

export type ProvidedSubtitleOption = SubtitleOptionBase & {
    kind: 'provided';
    sourceKind: 'author' | 'asr';
};

export type TranslatedSubtitleOption = SubtitleOptionBase & {
    kind: 'translated';
    translationLanguageCode: string;
};

export type SubtitleOption = ProvidedSubtitleOption | TranslatedSubtitleOption;

export type SubtitleMenuGroups = {
    provided: ProvidedSubtitleOption[];
    translated: TranslatedSubtitleOption[];
};

export type SubtitleCatalog = {
    providedOptions: ProvidedSubtitleOption[];
    translatedOptions: TranslatedSubtitleOption[];
    menuGroups: SubtitleMenuGroups;
};

export type SubtitleLoadTrigger = 'sync' | 'user-selection';

export type { YouTubeSubtitlePlayerData, YouTubeSubtitleSelectedTrack };
