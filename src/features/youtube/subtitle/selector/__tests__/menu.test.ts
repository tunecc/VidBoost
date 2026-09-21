import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SubtitleSelector } from '../SubtitleSelector';
import type { SubtitleSelectorCopy, SubtitleSelectorViewModel } from '../SubtitleSelector';
import type { SubtitleMenuGroups } from '../types';

vi.mock('../../../../../lib/webext', () => ({
    getRuntimeUrl: (path: string) => `chrome-extension://test/${path}`,
}));

const COPY: SubtitleSelectorCopy = {
    buttonLabel: 'VidBoost 字幕',
    searchPlaceholder: '搜索语言',
    providedHeading: '视频提供',
    translatedHeading: '自动翻译',
    authorBadge: '作者',
    asrBadge: '自动生成',
    translatedBadge: '翻译',
    preferredBadge: '默认',
};

function providedOption(id: string, label: string, languageCode: string) {
    return {
        kind: 'provided' as const,
        sourceKind: 'author' as const,
        id,
        label,
        targetLanguageCode: languageCode,
        searchText: `${label} ${languageCode}`.toLocaleLowerCase(),
        sourceTrack: {
            baseUrl: 'https://x/timedtext',
            languageCode,
            vssId: `.${languageCode}`,
            isTranslatable: true,
            name: { simpleText: label },
        },
    };
}

function translatedOption(id: string, label: string, languageCode: string) {
    return {
        kind: 'translated' as const,
        id,
        label,
        targetLanguageCode: languageCode,
        translationLanguageCode: languageCode,
        searchText: `${label} ${languageCode}`.toLocaleLowerCase(),
        sourceTrack: {
            baseUrl: 'https://x/timedtext',
            languageCode: 'en',
            vssId: '.en',
            isTranslatable: true,
            name: { simpleText: 'English' },
        },
    };
}

const GROUPS: SubtitleMenuGroups = {
    provided: [
        providedOption('p-zh', '简体中文', 'zh-CN'),
        providedOption('p-en', 'English', 'en'),
    ],
    translated: [
        translatedOption('t-ja', '日语', 'ja'),
        translatedOption('t-ko', '韩语', 'ko'),
    ],
};

const ALL_OPTION_IDS = ['p-zh', 'p-en', 't-ja', 't-ko'];

describe('SubtitleSelector menu search row', () => {
    let onSelectLanguage: ReturnType<typeof vi.fn>;
    let selector: SubtitleSelector;
    let player: HTMLElement;
    let controls: HTMLElement;

    function viewModel(): SubtitleSelectorViewModel {
        return {
            groups: GROUPS,
            activeOptionId: 'p-zh',
            activeLanguageCode: 'zh-CN',
            preferredLanguageCode: 'zh-CN',
            copy: COPY,
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

        selector.update(viewModel());
        expect(selector.ensureMounted()).toBe(true);
    });

    afterEach(() => {
        selector.destroy();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    function getMenu(): HTMLElement {
        const menu = document.getElementById('vb-yt-subtitle-selector-menu');
        expect(menu).not.toBeNull();
        return menu as HTMLElement;
    }

    function getToolbarButton(): HTMLButtonElement {
        const button = controls.querySelector<HTMLButtonElement>(
            'button.vb-yt-subtitle-selector-button'
        );
        expect(button).not.toBeNull();
        return button as HTMLButtonElement;
    }

    function getSearchButton(): HTMLButtonElement {
        const button = getMenu().querySelector<HTMLButtonElement>(
            '.vb-yt-subtitle-selector-search-toggle'
        );
        expect(button).not.toBeNull();
        return button as HTMLButtonElement;
    }

    function getSearchRow(): HTMLElement {
        const row = getMenu().querySelector<HTMLElement>(
            '.vb-yt-subtitle-selector-search-row'
        );
        expect(row).not.toBeNull();
        return row as HTMLElement;
    }

    function getSearchInput(): HTMLInputElement {
        const input = getSearchRow().querySelector<HTMLInputElement>('input[type="search"]');
        expect(input).not.toBeNull();
        return input as HTMLInputElement;
    }

    function getVisibleOptionIds(): string[] {
        return Array.from(getMenu().querySelectorAll<HTMLElement>('[data-option-id]'))
            .map((element) => element.dataset.optionId as string);
    }

    function openMenu(): void {
        getToolbarButton().click();
    }

    function type(query: string): void {
        const input = getSearchInput();
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function pressKey(key: string): void {
        const target = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : getMenu();
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    it('A6: opens with a title row and a collapsed search row', () => {
        openMenu();
        const menu = getMenu();
        expect(menu.style.display).toBe('flex');
        expect(menu.querySelector('.vb-yt-subtitle-selector-title')?.textContent)
            .toBe(COPY.buttonLabel);
        expect(getSearchRow().style.display).toBe('none');
        expect(getVisibleOptionIds()).toEqual(ALL_OPTION_IDS);
    });

    it('A16: the search button carries an accessible name and its own expanded state', () => {
        openMenu();
        const searchButton = getSearchButton();
        expect(searchButton.getAttribute('aria-label')).toBe(COPY.searchPlaceholder);
        expect(searchButton.title).toBe(COPY.searchPlaceholder);
        expect(searchButton.getAttribute('aria-expanded')).toBe('false');

        searchButton.click();
        expect(getSearchButton().getAttribute('aria-expanded')).toBe('true');
    });

    it('A7: expanding reveals the search row and focuses it without stealing arrow navigation', () => {
        openMenu();
        expect(document.activeElement).not.toBe(getSearchInput());

        getSearchButton().click();
        const input = getSearchInput();
        expect(getSearchRow().style.display).not.toBe('none');
        expect(document.activeElement).toBe(input);
        expect(input.placeholder).toBe(COPY.searchPlaceholder);
    });

    it('A7: typing filters both groups while the search row stays open', () => {
        openMenu();
        getSearchButton().click();
        type('zh');
        expect(getVisibleOptionIds()).toEqual(['p-zh']);

        type('语');
        expect(getVisibleOptionIds()).toEqual(['t-ja', 't-ko']);
    });

    it('A8: collapsing clears the query and restores the full list', () => {
        openMenu();
        getSearchButton().click();
        type('zh');
        expect(getVisibleOptionIds()).toEqual(['p-zh']);

        getSearchButton().click();
        expect(getSearchRow().style.display).toBe('none');
        expect(getSearchInput().value).toBe('');
        expect(getVisibleOptionIds()).toEqual(ALL_OPTION_IDS);
    });

    it('A9: Escape collapses the search row first and only then closes the menu', () => {
        openMenu();
        getSearchButton().click();
        type('zh');
        expect(getToolbarButton().getAttribute('aria-expanded')).toBe('true');

        pressKey('Escape');
        expect(getMenu().style.display).toBe('flex');
        expect(getSearchRow().style.display).toBe('none');
        expect(getSearchInput().value).toBe('');
        expect(getVisibleOptionIds()).toEqual(ALL_OPTION_IDS);
        expect(document.activeElement).toBe(getSearchButton());

        pressKey('Escape');
        expect(getMenu().style.display).toBe('none');
        expect(getToolbarButton().getAttribute('aria-expanded')).toBe('false');
    });

    it('A10: closing the menu with search open resets it for the next open', () => {
        openMenu();
        getSearchButton().click();
        type('zh');

        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(getMenu().style.display).toBe('none');

        openMenu();
        expect(getSearchRow().style.display).toBe('none');
        expect(getSearchInput().value).toBe('');
        expect(getSearchButton().getAttribute('aria-expanded')).toBe('false');
        expect(getVisibleOptionIds()).toEqual(ALL_OPTION_IDS);
    });

    it('A10: reopening through the toolbar button also resets the search row', () => {
        openMenu();
        getSearchButton().click();
        type('ko');
        getToolbarButton().click();
        expect(getMenu().style.display).toBe('none');

        getToolbarButton().click();
        expect(getSearchRow().style.display).toBe('none');
        expect(getSearchInput().value).toBe('');
        expect(getVisibleOptionIds()).toEqual(ALL_OPTION_IDS);
    });

    it('marks the search button only with its blue active state, never with a focus ring', () => {
        openMenu();
        const toggle = getSearchButton();
        // Opening focuses the button, but focus must not draw an outline around it.
        expect(document.activeElement).toBe(toggle);
        expect(toggle.style.outline).not.toContain('solid');
        expect(toggle.style.outlineOffset).toBe('');
        expect(toggle.style.background).toBe('transparent');

        toggle.click();
        expect(getSearchButton().style.background).toBe('rgba(62, 166, 255, 0.16)');

        pressKey('Escape');
        expect(document.activeElement).toBe(getSearchButton());
        expect(getSearchButton().style.outline).not.toContain('solid');
        expect(getSearchButton().style.background).toBe('transparent');
    });

    it('A14: arrow keys walk only the visible options in both search states', () => {
        openMenu();
        const optionButtons = () => Array.from(
            getMenu().querySelectorAll<HTMLButtonElement>('button[data-option-id]')
        );

        pressKey('ArrowDown');
        expect(document.activeElement).toBe(optionButtons()[0]);
        pressKey('ArrowDown');
        expect(document.activeElement).toBe(optionButtons()[1]);
        pressKey('ArrowUp');
        expect(document.activeElement).toBe(optionButtons()[0]);

        getSearchButton().click();
        type('ko');
        optionButtons()[0].focus();
        pressKey('ArrowDown');
        expect(document.activeElement).toBe(optionButtons()[0]);
    });

    it('keeps an already rendered menu open when the view model updates', () => {
        openMenu();
        getSearchButton().click();
        type('zh');

        selector.update({
            ...viewModel(),
            activeOptionId: 'p-en',
            activeLanguageCode: 'en',
        });

        expect(getMenu().style.display).toBe('flex');
        expect(getSearchRow().style.display).not.toBe('none');
        expect(getSearchInput().value).toBe('zh');
        expect(getVisibleOptionIds()).toEqual(['p-zh']);
    });
});
