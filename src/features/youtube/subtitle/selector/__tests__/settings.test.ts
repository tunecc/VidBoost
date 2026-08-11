import { describe, expect, it } from 'vitest';
import {
    cloneYTSubtitleConfig,
    DEFAULT_SETTINGS,
    type YTSubtitleConfig
} from '../../../../../lib/settings';

describe('YouTube subtitle preferred language setting', () => {
    it('defaults to no preferred language for old configs', () => {
        expect(DEFAULT_SETTINGS.yt_subtitle.preferredLanguageCode).toBe('');
        expect(cloneYTSubtitleConfig({ enabled: true }).preferredLanguageCode).toBe('');
    });

    it('trims a persisted target language code', () => {
        const config = cloneYTSubtitleConfig({
            ...DEFAULT_SETTINGS.yt_subtitle,
            preferredLanguageCode: '  zh-Hans  '
        });
        expect(config.preferredLanguageCode).toBe('zh-Hans');
    });

    it('rejects a non-string value from legacy or corrupted storage', () => {
        const invalid = {
            ...DEFAULT_SETTINGS.yt_subtitle,
            preferredLanguageCode: 42
        } as unknown as Partial<YTSubtitleConfig>;
        expect(cloneYTSubtitleConfig(invalid).preferredLanguageCode).toBe('');
    });
});
