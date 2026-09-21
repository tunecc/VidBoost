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
    emptyMessage: '该视频暂无字幕',
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

const EMPTY_GROUPS: SubtitleMenuGroups = { provided: [], translated: [] };

describe('SubtitleSelector render stability', () => {
    let onSelectLanguage: ReturnType<typeof vi.fn>;
    let selector: SubtitleSelector;
    let player: HTMLElement;
    let controls: HTMLElement;

    // 宿主每个轮询周期都会重建目录对象，因此这里每次都构造新的数组与对象。
    function viewModelWith(overrides: Partial<SubtitleSelectorViewModel> = {}): SubtitleSelectorViewModel {
        return {
            groups: { provided: [...GROUPS.provided], translated: [...GROUPS.translated] },
            activeOptionId: 'p-zh',
            activeLanguageCode: 'zh-CN',
            preferredLanguageCode: 'zh-CN',
            copy: { ...COPY },
            ...overrides,
        };
    }

    function emptyViewModelWith(overrides: Partial<SubtitleSelectorViewModel> = {}): SubtitleSelectorViewModel {
        return viewModelWith({
            groups: { provided: [], translated: [] },
            activeOptionId: '',
            activeLanguageCode: '',
            ...overrides,
        });
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

        selector.update(viewModelWith());
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

    function optionButtons(): HTMLButtonElement[] {
        return Array.from(
            getMenu().querySelectorAll<HTMLButtonElement>('button[data-option-id]')
        );
    }

    function emptyNotices(): HTMLElement[] {
        return Array.from(getMenu().querySelectorAll<HTMLElement>(
            '.vb-yt-subtitle-selector-empty'
        ));
    }

    function openMenu(): void {
        getToolbarButton().click();
    }

    it('keeps the same option nodes and the focus across identical updates', () => {
        openMenu();
        const before = optionButtons();
        expect(before.length).toBeGreaterThan(0);
        before[2].focus();

        for (let round = 0; round < 5; round += 1) selector.update(viewModelWith());

        const after = optionButtons();
        expect(after.length).toBe(before.length);
        after.forEach((button, index) => expect(button).toBe(before[index]));
        expect(document.activeElement).toBe(before[2]);
    });

    it('keeps one empty-state node across identical updates with an empty catalog', () => {
        selector.detach();
        selector.update(emptyViewModelWith());
        expect(selector.ensureMounted()).toBe(true);
        openMenu();

        const [notice] = emptyNotices();
        expect(notice).toBeDefined();

        for (let round = 0; round < 5; round += 1) selector.update(emptyViewModelWith());

        const notices = emptyNotices();
        expect(notices.length).toBe(1);
        expect(notices[0]).toBe(notice);
    });

    it('rebuilds the list when the active option moves', () => {
        openMenu();
        const before = optionButtons();

        selector.update(viewModelWith({ activeOptionId: 'p-en', activeLanguageCode: 'en' }));

        const after = optionButtons();
        expect(after[0]).not.toBe(before[0]);
        expect(after.find((b) => b.dataset.optionId === 'p-en')?.getAttribute('aria-selected'))
            .toBe('true');
        expect(after.find((b) => b.dataset.optionId === 'p-zh')?.getAttribute('aria-selected'))
            .toBe('false');
    });

    it('rebuilds the list when the preferred language or the copy changes', () => {
        openMenu();
        const beforePreferred = optionButtons();

        selector.update(viewModelWith({ preferredLanguageCode: 'ja' }));

        const afterPreferred = optionButtons();
        expect(afterPreferred[0]).not.toBe(beforePreferred[0]);
        expect(afterPreferred.find((b) => b.dataset.optionId === 't-ja')?.textContent)
            .toContain(COPY.preferredBadge);

        selector.update(viewModelWith());
        const beforeCopy = optionButtons();

        selector.update(viewModelWith({ copy: { ...COPY, providedHeading: 'Provided' } }));

        const afterCopy = optionButtons();
        expect(afterCopy[0]).not.toBe(beforeCopy[0]);
        expect(getMenu().textContent).toContain('Provided');
    });

    it('rebuilds the list when the catalog gains a language', () => {
        openMenu();
        const before = optionButtons();

        selector.update(viewModelWith({
            groups: {
                provided: [...GROUPS.provided, providedOption('p-de', 'Deutsch', 'de')],
                translated: [...GROUPS.translated]
            }
        }));

        const after = optionButtons();
        expect(after[0]).not.toBe(before[0]);
        expect(after.map((b) => b.dataset.optionId)).toContain('p-de');
    });

    it('keeps the filtered list and the search state across identical updates', () => {
        openMenu();
        getMenu().querySelector<HTMLButtonElement>(
            '.vb-yt-subtitle-selector-search-toggle'
        )?.click();
        const input = getMenu().querySelector<HTMLInputElement>('input[type="search"]');
        expect(input).not.toBeNull();
        input!.value = 'zh';
        input!.dispatchEvent(new Event('input', { bubbles: true }));

        const before = optionButtons();
        expect(before.map((b) => b.dataset.optionId)).toEqual(['p-zh']);

        for (let round = 0; round < 3; round += 1) selector.update(viewModelWith());

        const after = optionButtons();
        expect(after.length).toBe(before.length);
        after.forEach((button, index) => expect(button).toBe(before[index]));
        expect(input!.value).toBe('zh');
    });

    it('re-renders the list when the search row is expanded and again when it collapses', () => {
        openMenu();
        const collapsed = optionButtons();
        const toggle = getMenu().querySelector<HTMLButtonElement>(
            '.vb-yt-subtitle-selector-search-toggle'
        );
        expect(toggle).not.toBeNull();

        toggle!.click();
        const expanded = optionButtons();
        expect(expanded[0]).not.toBe(collapsed[0]);
        expect(expanded.map((button) => button.dataset.optionId)).toEqual(ALL_OPTION_IDS);

        toggle!.click();
        const reCollapsed = optionButtons();
        expect(reCollapsed[0]).not.toBe(expanded[0]);
        expect(reCollapsed.map((button) => button.dataset.optionId)).toEqual(ALL_OPTION_IDS);
    });

    it('re-renders the list when only an option source kind changes', () => {
        openMenu();
        const before = optionButtons();

        selector.update(viewModelWith({
            groups: {
                provided: [{
                    ...GROUPS.provided[0],
                    sourceKind: 'asr' as const
                }, ...GROUPS.provided.slice(1)],
                translated: [...GROUPS.translated]
            }
        }));

        const after = optionButtons();
        expect(after[0]).not.toBe(before[0]);
        expect(after.find((button) => button.dataset.optionId === 'p-zh')?.textContent)
            .toContain(COPY.asrBadge);
    });

    it('re-renders the list when only the searchable text changes', () => {
        openMenu();
        const before = optionButtons();

        selector.update(viewModelWith({
            groups: {
                provided: [{
                    ...GROUPS.provided[0],
                    searchText: `${GROUPS.provided[0].label} zh-cn 别名`
                }, ...GROUPS.provided.slice(1)],
                translated: [...GROUPS.translated]
            }
        }));

        expect(optionButtons()[0]).not.toBe(before[0]);
    });

    it('repositions the menu even when the list rebuild is skipped', () => {
        openMenu();
        const before = optionButtons();
        const menu = getMenu();
        const playerRect = { right: 1000, bottom: 800 } as DOMRect;
        const buttonRect = { right: 940, top: 700 } as DOMRect;
        vi.spyOn(player, 'getBoundingClientRect').mockReturnValue(playerRect);
        vi.spyOn(getToolbarButton(), 'getBoundingClientRect').mockReturnValue(buttonRect);

        selector.update(viewModelWith());

        // 列表被跳过重建，弹层坐标仍按新的播放器与按钮位置更新。
        expect(optionButtons()[0]).toBe(before[0]);
        expect(menu.style.right).toBe('60px');
        expect(menu.style.bottom).toBe('108px');
    });

    it('re-renders the list after a remount with an unchanged catalog', () => {
        openMenu();
        expect(optionButtons().length).toBe(ALL_OPTION_IDS.length);

        selector.detach();
        selector.update(viewModelWith());
        expect(selector.ensureMounted()).toBe(true);
        openMenu();

        // YouTube 摘走按钮后以相同内容重新挂载：签名必须失效，否则面板永久空白。
        const after = optionButtons();
        expect(after.map((button) => button.dataset.optionId)).toEqual(ALL_OPTION_IDS);
        expect(emptyNotices().length).toBe(0);
    });
});

describe('SubtitleSelector empty catalog', () => {
    let onSelectLanguage: ReturnType<typeof vi.fn>;
    let selector: SubtitleSelector;
    let player: HTMLElement;
    let controls: HTMLElement;

    function emptyViewModel(): SubtitleSelectorViewModel {
        return {
            groups: EMPTY_GROUPS,
            activeOptionId: '',
            activeLanguageCode: '',
            preferredLanguageCode: '',
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

        selector.update(emptyViewModel());
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

    function getSearchButton(): HTMLButtonElement | null {
        return getMenu().querySelector<HTMLButtonElement>(
            '.vb-yt-subtitle-selector-search-toggle'
        );
    }

    function getEmptyNotice(): HTMLElement | null {
        return getMenu().querySelector<HTMLElement>('.vb-yt-subtitle-selector-empty');
    }

    function getVisibleOptionIds(): string[] {
        return Array.from(getMenu().querySelectorAll<HTMLElement>('[data-option-id]'))
            .map((element) => element.dataset.optionId as string);
    }

    it('keeps the toolbar button mounted and opens a menu with the empty notice', () => {
        getToolbarButton().click();
        expect(getMenu().style.display).toBe('flex');
        expect(getToolbarButton().getAttribute('aria-expanded')).toBe('true');
        expect(getEmptyNotice()?.textContent).toBe(COPY.emptyMessage);
        expect(getVisibleOptionIds()).toEqual([]);
    });

    it('hides the search entry and never focuses it while the catalog is empty', () => {
        getToolbarButton().click();
        expect(getSearchButton()?.style.display).toBe('none');
        expect(document.activeElement).not.toBe(getSearchButton());
    });

    it('renders the language list in place once the catalog arrives', () => {
        getToolbarButton().click();
        expect(getEmptyNotice()).not.toBeNull();

        selector.update({
            groups: GROUPS,
            activeOptionId: '',
            activeLanguageCode: '',
            preferredLanguageCode: '',
            copy: COPY,
        });

        expect(getEmptyNotice()).toBeNull();
        expect(getVisibleOptionIds()).toEqual(ALL_OPTION_IDS);
        expect(getSearchButton()?.style.display).not.toBe('none');
    });

    it('keeps the empty notice out of arrow-key navigation', () => {
        getToolbarButton().click();
        getMenu().dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
        );
        expect(document.activeElement).not.toHaveProperty('dataset.optionId');
    });
});
