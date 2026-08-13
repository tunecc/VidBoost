import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SubtitleSelector } from '../SubtitleSelector';
import type { SubtitleSelectorCopy, SubtitleSelectorViewModel } from '../SubtitleSelector';

// Mock getRuntimeUrl before the module-import-time call runs.
// Path: test file is at src/features/youtube/subtitle/selector/__tests__/icon.test.ts
//       target is src/lib/webext.ts → 5 levels up to src/ then lib/webext
vi.mock('../../../../../lib/webext', () => ({
    getRuntimeUrl: (path: string) => `chrome-extension://test/${path}`,
}));

describe('SubtitleSelector icon', () => {
    let onSelectLanguage: ReturnType<typeof vi.fn>;
    let selector: SubtitleSelector;
    let player: HTMLElement;
    let controls: HTMLElement;

    const COPY: SubtitleSelectorCopy = {
        buttonLabel: '字幕',
        searchPlaceholder: '搜索语言',
        providedHeading: '作者字幕',
        translatedHeading: '自动翻译',
        authorBadge: '作者',
        asrBadge: 'ASR',
        translatedBadge: '翻译',
        preferredBadge: '偏好',
    };

    const viewModel: SubtitleSelectorViewModel = {
        groups: { provided: [], translated: [] },
        activeOptionId: '',
        activeLanguageCode: '',
        preferredLanguageCode: '',
        copy: COPY,
    };

    function activeViewModel(): SubtitleSelectorViewModel {
        return {
            ...fullViewModel(),
            activeOptionId: 'author-zh',
            activeLanguageCode: 'zh-CN',
        };
    }

    function noActiveViewModel(): SubtitleSelectorViewModel {
        return {
            ...fullViewModel(),
            activeOptionId: '',
            activeLanguageCode: '',
        };
    }

    function fullViewModel(): SubtitleSelectorViewModel {
        return {
            ...viewModel,
            groups: {
                provided: [
                    {
                        id: 'author-zh',
                        label: '中文',
                        kind: 'provided',
                        sourceKind: 'author',
                        targetLanguageCode: 'zh-CN',
                        sourceTrack: {
                            baseUrl: 'https://x/timedtext',
                            languageCode: 'zh',
                            vssId: '.zh',
                            isTranslatable: true,
                            name: { simpleText: '中文' },
                        },
                    },
                    {
                        id: 'author-en',
                        label: 'English',
                        kind: 'provided',
                        sourceKind: 'author',
                        targetLanguageCode: 'en',
                        sourceTrack: {
                            baseUrl: 'https://x/timedtext',
                            languageCode: 'en',
                            vssId: '.en',
                            isTranslatable: true,
                            name: { simpleText: 'English' },
                        },
                    },
                ],
                translated: [
                    {
                        id: 'trans-zh',
                        label: '中文（自动翻译）',
                        kind: 'translated',
                        sourceKind: 'asr',
                        targetLanguageCode: 'zh-CN',
                        sourceTrack: {
                            baseUrl: 'https://x/timedtext',
                            languageCode: 'en',
                            kind: 'asr',
                            vssId: 'a.en',
                            isTranslatable: true,
                            name: { simpleText: 'English' },
                        },
                    },
                ],
            },
        };
    }

    beforeEach(() => {
        onSelectLanguage = vi.fn();
        selector = new SubtitleSelector(onSelectLanguage);

        player = document.createElement('div');
        player.id = 'movie_player';
        controls = document.createElement('div');
        controls.className = 'ytp-right-controls';
        const settingsButton = document.createElement('button');
        settingsButton.className = 'ytp-settings-button';
        controls.append(settingsButton);
        player.append(controls);
        document.body.append(player);
    });

    afterEach(() => {
        selector.destroy();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    function mount(): boolean {
        selector.update(fullViewModel());
        return selector.ensureMounted();
    }

    function getIcon(): HTMLImageElement | null {
        return controls.querySelector<HTMLImageElement>(
            'button.vb-yt-subtitle-selector-button img'
        );
    }

    function getButton(): HTMLButtonElement | null {
        return controls.querySelector<HTMLButtonElement>(
            'button.vb-yt-subtitle-selector-button'
        );
    }

    it('A1: mounts a button with the VidBoost icon replacing the CC text', () => {
        expect(mount()).toBe(true);
        const button = getButton();
        expect(button).not.toBeNull();
        expect(button?.getAttribute('aria-haspopup')).toBe('dialog');

        const icon = getIcon();
        expect(icon).not.toBeNull();
        expect(icon?.alt).toBe('');
        expect(icon?.getAttribute('aria-hidden')).toBe('true');

        // The icon src should point to the plugin icon
        expect(icon?.src).toContain('icons/icon48.png');

        // No "CC" text should be present
        expect(button?.textContent?.trim()).toBe('');
    });

    it('A2: renders the icon at 24×24px', () => {
        expect(mount()).toBe(true);
        const icon = getIcon();
        const style = icon?.style.cssText ?? '';
        // jsdom serializes with spaces, e.g. "width: 24px"
        expect(style).toMatch(/width:\s*24px/);
        expect(style).toMatch(/height:\s*24px/);
    });

    it('A4: shows the icon in inactive (dimmed) state when no subtitle is active', () => {
        expect(mount()).toBe(true);

        const icon = getIcon();
        const style = icon?.style.cssText ?? '';
        expect(style).toMatch(/opacity:\s*0?\.45/);
        expect(style).toMatch(/filter:\s*grayscale\(\.6\)/);
    });

    it('A3: shows the icon in active (full-color) state when a subtitle is active', () => {
        expect(mount()).toBe(true);
        selector.update(activeViewModel());

        const icon = getIcon();
        const style = icon?.style.cssText ?? '';
        expect(style).toMatch(/opacity:\s*1\b/);
        expect(style).toMatch(/filter:\s*none/);
    });

    it('recomputes the icon state when the active option changes', () => {
        expect(mount()).toBe(true);
        let icon = getIcon();
        expect((icon?.style.cssText ?? '')).toMatch(/opacity:\s*0?\.45/);

        selector.update(activeViewModel());
        icon = getIcon();
        expect((icon?.style.cssText ?? '')).toMatch(/opacity:\s*1\b/);

        selector.update(noActiveViewModel());
        icon = getIcon();
        expect((icon?.style.cssText ?? '')).toMatch(/opacity:\s*0?\.45/);
    });

    it('A5: clicking the button opens the subtitle language menu', () => {
        expect(mount()).toBe(true);
        const button = getButton();
        const menu = document.getElementById('vb-yt-subtitle-selector-menu');
        expect(menu).not.toBeNull();
        expect(menu?.style.display).toBe('none');

        button?.click();
        expect(menu?.style.display).toBe('flex');
        expect(button?.getAttribute('aria-expanded')).toBe('true');
    });

    it('A6: selecting a language option invokes the callback and closes the menu', () => {
        expect(mount()).toBe(true);
        const button = getButton();
        button?.click();

        const optionButton = document.querySelector<HTMLButtonElement>(
            '[data-option-id="trans-zh"]'
        );
        expect(optionButton).not.toBeNull();
        optionButton?.click();

        expect(onSelectLanguage).toHaveBeenCalledWith('zh-CN');
        const menu = document.getElementById('vb-yt-subtitle-selector-menu');
        expect(menu?.style.display).toBe('none');
    });

    it('detaches and clears all references', () => {
        expect(mount()).toBe(true);
        selector.detach();
        expect(getButton()).toBeNull();
        expect(getIcon()).toBeNull();
        expect(document.getElementById('vb-yt-subtitle-selector-menu')).toBeNull();
    });
});