import { markInteractionRoot } from '../../../../lib/pointerTargets';
import { getRuntimeUrl } from '../../../../lib/webext';
import { areTargetLanguagesCompatible } from './language';
import { resolveSubtitleButtonMountTarget } from './mountTarget';
import {
    filterSubtitleMenuGroups,
    flattenSubtitleMenuGroups,
    getNextOptionIndex,
    isSubtitleMenuOptionActive
} from './menuState';
import type { SubtitleMenuGroups, SubtitleOption } from './types';

export type SubtitleSelectorCopy = {
    buttonLabel: string;
    searchPlaceholder: string;
    providedHeading: string;
    translatedHeading: string;
    authorBadge: string;
    asrBadge: string;
    translatedBadge: string;
    preferredBadge: string;
    emptyMessage: string;
};

export type SubtitleSelectorViewModel = {
    groups: SubtitleMenuGroups;
    activeOptionId: string;
    activeLanguageCode: string;
    preferredLanguageCode: string;
    copy: SubtitleSelectorCopy;
};

const EMPTY_VIEW_MODEL: SubtitleSelectorViewModel = {
    groups: { provided: [], translated: [] },
    activeOptionId: '',
    activeLanguageCode: '',
    preferredLanguageCode: '',
    copy: {
        buttonLabel: '',
        searchPlaceholder: '',
        providedHeading: '',
        translatedHeading: '',
        authorBadge: '',
        asrBadge: '',
        translatedBadge: '',
        preferredBadge: '',
        emptyMessage: ''
    }
};

const BUTTON_ICON_URL = getRuntimeUrl('icons/icon48.png');
const ICON_STYLE_ACTIVE = 'opacity:1;filter:none;transition:opacity .15s ease';
const ICON_STYLE_INACTIVE = 'opacity:.45;filter:grayscale(.6);transition:opacity .15s ease';
const ICON_SIZE_PX = 24;

const SVG_NS = 'http://www.w3.org/2000/svg';
const HOVER_BG = 'rgba(255,255,255,.1)';
const ACTIVE_BG = 'rgba(62,166,255,.16)';
const ACTIVE_HOVER_BG = 'rgba(62,166,255,.24)';
const FOCUS_OUTLINE = '2px solid rgba(255,255,255,.9)';
const MENU_SURFACE_STYLE = [
    'position:absolute',
    'display:none',
    'flex-direction:column',
    'width:min(360px, calc(100% - 24px))',
    'max-height:min(420px, calc(100% - 80px))',
    'box-sizing:border-box',
    'padding:6px 0',
    'gap:0',
    'overflow:hidden',
    'z-index:70',
    'color:#fff',
    'background:rgba(40,40,40,.98)',
    'border:0',
    'border-radius:12px',
    'box-shadow:0 4px 16px rgba(0,0,0,.5)',
    'font:400 13px/1.35 Roboto,Arial,sans-serif',
    'letter-spacing:0'
].join(';');

const SEARCH_TOGGLE_BASE_STYLE = [
    'flex:0 0 auto',
    'width:32px',
    'height:32px',
    'padding:0',
    'border:0',
    'border-radius:50%',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'cursor:pointer',
    'outline:none',
    'transition:background .12s ease,color .12s ease'
].join(';');
const SEARCH_TOGGLE_IDLE_COLOR = 'rgba(255,255,255,.85)';
const SEARCH_TOGGLE_ACTIVE_COLOR = '#3ea6ff';
const SEARCH_TOGGLE_ACTIVE_BG = 'rgba(62,166,255,.16)';

const SEARCH_INPUT_BASE_STYLE = [
    'width:100%',
    'height:32px',
    'box-sizing:border-box',
    'padding:0 12px',
    'border-radius:8px',
    'outline:none',
    'color:#fff',
    'font:inherit',
    'letter-spacing:0'
].join(';');

function createSearchIcon(): SVGSVGElement {
    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('width', '18');
    icon.setAttribute('height', '18');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '10.5');
    circle.setAttribute('cy', '10.5');
    circle.setAttribute('r', '6.5');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', 'currentColor');
    circle.setAttribute('stroke-width', '1.8');

    const handle = document.createElementNS(SVG_NS, 'path');
    handle.setAttribute('d', 'M15.4 15.4 20 20');
    handle.setAttribute('stroke', 'currentColor');
    handle.setAttribute('stroke-width', '1.8');
    handle.setAttribute('stroke-linecap', 'round');

    icon.append(circle, handle);
    return icon;
}

export class SubtitleSelector {
    private viewModel = EMPTY_VIEW_MODEL;
    private button: HTMLButtonElement | null = null;
    private buttonIcon: HTMLImageElement | null = null;
    private menu: HTMLDivElement | null = null;
    private title: HTMLDivElement | null = null;
    private searchToggle: HTMLButtonElement | null = null;
    private searchRow: HTMLDivElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private optionList: HTMLDivElement | null = null;
    private query = '';
    private searchOpen = false;
    private renderedSignature: string | null = null;

    private readonly handleDocumentPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (this.button?.contains(target) || this.menu?.contains(target)) return;
        this.close();
    };

    private readonly handleWindowResize = () => {
        if (this.menu?.style.display !== 'none') this.positionMenu();
    };

    constructor(private readonly onSelectLanguage: (languageCode: string) => void) {
        document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
        window.addEventListener('resize', this.handleWindowResize);
    }

    update(viewModel: SubtitleSelectorViewModel): void {
        this.viewModel = viewModel;
        if (this.button) {
            this.button.setAttribute('aria-label', viewModel.copy.buttonLabel);
            this.button.title = viewModel.copy.buttonLabel;
        }
        this.updateIconState();
        if (this.title) this.title.textContent = viewModel.copy.buttonLabel;
        if (this.menu) this.menu.setAttribute('aria-label', viewModel.copy.buttonLabel);
        this.syncSearchAvailability();
        if (this.searchToggle) {
            this.searchToggle.setAttribute('aria-label', viewModel.copy.searchPlaceholder);
            this.searchToggle.title = viewModel.copy.searchPlaceholder;
        }
        if (this.searchInput) this.searchInput.placeholder = viewModel.copy.searchPlaceholder;
        if (this.menu && this.menu.style.display !== 'none') {
            this.renderMenu();
            this.positionMenu();
        }
    }

    ensureMounted(): boolean {
        const player = document.querySelector<HTMLElement>('#movie_player');
        const controls = player?.querySelector<HTMLElement>('.ytp-right-controls');
        if (!player || !controls) return false;

        if (this.button?.isConnected && this.menu?.isConnected) {
            this.positionMenu();
            return true;
        }

        this.detach();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ytp-button vb-yt-subtitle-selector-button';
        button.setAttribute('aria-label', this.viewModel.copy.buttonLabel);
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-controls', 'vb-yt-subtitle-selector-menu');
        button.setAttribute('aria-expanded', 'false');
        button.title = this.viewModel.copy.buttonLabel;
        button.style.cssText = [
            'width:48px',
            'min-width:48px',
            'height:100%',
            'padding:0',
            'display:inline-flex',
            'align-items:center',
            'justify-content:center'
        ].join(';');

        const icon = document.createElement('img');
        icon.alt = '';
        icon.setAttribute('aria-hidden', 'true');
        icon.draggable = false;
        icon.src = BUTTON_ICON_URL ?? '';
        icon.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            `width:${ICON_SIZE_PX}px`,
            `height:${ICON_SIZE_PX}px`,
            'box-sizing:border-box',
            'pointer-events:none',
            'user-select:none',
            this.hasActiveSubtitle() ? ICON_STYLE_ACTIVE : ICON_STYLE_INACTIVE
        ].join(';');
        button.append(icon);
        button.addEventListener('click', () => {
            if (this.menu?.style.display === 'none') this.open();
            else this.close();
        });

        this.button = button;
        this.buttonIcon = icon;

        const settingsButton = controls.querySelector<HTMLElement>('.ytp-settings-button');
        const mountTarget = resolveSubtitleButtonMountTarget(controls, settingsButton);
        mountTarget.container.insertBefore(
            button,
            mountTarget.reference ?? mountTarget.container.firstChild
        );

        const menu = document.createElement('div');
        menu.id = 'vb-yt-subtitle-selector-menu';
        menu.className = 'vb-yt-subtitle-selector-menu';
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-label', this.viewModel.copy.buttonLabel);
        menu.style.cssText = MENU_SURFACE_STYLE;

        const header = document.createElement('div');
        header.className = 'vb-yt-subtitle-selector-header';
        header.style.cssText = [
            'flex:0 0 auto',
            'display:flex',
            'align-items:center',
            'gap:8px',
            'min-height:36px',
            'padding:2px 8px 2px 14px'
        ].join(';');

        const title = document.createElement('div');
        title.className = 'vb-yt-subtitle-selector-title';
        title.textContent = this.viewModel.copy.buttonLabel;
        title.style.cssText = [
            'min-width:0',
            'flex:1 1 auto',
            'overflow:hidden',
            'text-overflow:ellipsis',
            'white-space:nowrap',
            'font-size:13px',
            'font-weight:500',
            'color:rgba(255,255,255,.9)'
        ].join(';');

        const searchToggle = document.createElement('button');
        searchToggle.type = 'button';
        searchToggle.className = 'vb-yt-subtitle-selector-search-toggle';
        searchToggle.setAttribute('aria-label', this.viewModel.copy.searchPlaceholder);
        searchToggle.setAttribute('aria-expanded', 'false');
        searchToggle.title = this.viewModel.copy.searchPlaceholder;
        searchToggle.style.cssText = SEARCH_TOGGLE_BASE_STYLE;
        searchToggle.style.color = SEARCH_TOGGLE_IDLE_COLOR;
        searchToggle.style.background = 'transparent';
        searchToggle.append(createSearchIcon());
        searchToggle.addEventListener('pointerenter', () => {
            searchToggle.style.background = this.searchOpen ? ACTIVE_HOVER_BG : HOVER_BG;
        });
        searchToggle.addEventListener('pointerleave', () => this.syncSearchToggleStyle());
        searchToggle.addEventListener('click', () => {
            const open = !this.searchOpen;
            this.setSearchOpen(open);
            this.renderMenu();
            if (open) this.searchInput?.focus();
        });

        header.append(title, searchToggle);

        const searchRow = document.createElement('div');
        searchRow.className = 'vb-yt-subtitle-selector-search-row';
        searchRow.style.cssText = 'flex:0 0 auto;display:none;padding:2px 14px 8px';

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = this.viewModel.copy.searchPlaceholder;
        searchInput.setAttribute('aria-label', this.viewModel.copy.searchPlaceholder);
        searchInput.style.cssText = [
            SEARCH_INPUT_BASE_STYLE,
            'border:1px solid rgba(255,255,255,.22)',
            'background:rgba(255,255,255,.06)'
        ].join(';');
        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = 'rgba(255,255,255,.6)';
        });
        searchInput.addEventListener('blur', () => {
            searchInput.style.borderColor = 'rgba(255,255,255,.22)';
        });
        searchInput.addEventListener('input', () => {
            this.query = searchInput.value;
            this.renderMenu();
        });
        searchRow.append(searchInput);

        const optionList = document.createElement('div');
        optionList.setAttribute('role', 'listbox');
        optionList.style.cssText = [
            'min-height:0',
            'flex:1 1 auto',
            'overflow:auto',
            'display:flex',
            'flex-direction:column',
            'scrollbar-width:thin',
            'scrollbar-color:rgba(255,255,255,.28) transparent'
        ].join(';');

        menu.append(header, searchRow, optionList);
        menu.addEventListener('keydown', (event) => this.handleMenuKeydown(event));
        player.append(menu);

        markInteractionRoot(button);
        markInteractionRoot(menu);
        this.button = button;
        this.buttonIcon = icon;
        this.menu = menu;
        this.title = title;
        this.searchToggle = searchToggle;
        this.searchRow = searchRow;
        this.searchInput = searchInput;
        this.optionList = optionList;
        this.searchOpen = false;
        this.query = '';
        this.renderMenu();
        return true;
    }

    close(): void {
        if (!this.menu) return;
        this.setSearchOpen(false);
        this.menu.style.display = 'none';
        this.button?.setAttribute('aria-expanded', 'false');
    }

    detach(): void {
        this.close();
        this.button?.remove();
        this.menu?.remove();
        this.button = null;
        this.buttonIcon = null;
        this.menu = null;
        this.title = null;
        this.searchToggle = null;
        this.searchRow = null;
        this.searchInput = null;
        this.optionList = null;
        this.query = '';
        this.searchOpen = false;
        this.renderedSignature = null;
    }

    destroy(): void {
        document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
        window.removeEventListener('resize', this.handleWindowResize);
        this.detach();
        this.viewModel = EMPTY_VIEW_MODEL;
    }

    private hasActiveSubtitle(): boolean {
        return Boolean(this.viewModel.activeOptionId);
    }

    private updateIconState(): void {
        if (!this.buttonIcon) return;
        const active = this.hasActiveSubtitle();
        this.buttonIcon.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            `width:${ICON_SIZE_PX}px`,
            `height:${ICON_SIZE_PX}px`,
            'box-sizing:border-box',
            'pointer-events:none',
            'user-select:none',
            active ? ICON_STYLE_ACTIVE : ICON_STYLE_INACTIVE
        ].join(';');
    }

    private setSearchOpen(open: boolean): void {
        this.searchOpen = open;
        if (this.searchRow) this.searchRow.style.display = open ? 'block' : 'none';
        this.searchToggle?.setAttribute('aria-expanded', String(open));
        this.syncSearchToggleStyle();
        if (open) return;
        this.query = '';
        if (this.searchInput) this.searchInput.value = '';
    }

    private syncSearchToggleStyle(): void {
        if (!this.searchToggle) return;
        this.searchToggle.style.color = this.searchOpen
            ? SEARCH_TOGGLE_ACTIVE_COLOR
            : SEARCH_TOGGLE_IDLE_COLOR;
        this.searchToggle.style.background = this.searchOpen ? SEARCH_TOGGLE_ACTIVE_BG : 'transparent';
    }

    private open(): void {
        if (!this.ensureMounted() || !this.menu) return;
        this.setSearchOpen(false);
        this.renderMenu();
        this.menu.style.display = 'flex';
        this.button?.setAttribute('aria-expanded', 'true');
        this.positionMenu();
        if (!this.isCatalogEmpty()) this.searchToggle?.focus();
    }

    private positionMenu(): void {
        if (!this.button || !this.menu) return;
        const player = this.menu.parentElement;
        if (!player) return;
        const playerRect = player.getBoundingClientRect();
        const buttonRect = this.button.getBoundingClientRect();
        const right = Math.max(12, playerRect.right - buttonRect.right);
        const bottom = Math.max(56, playerRect.bottom - buttonRect.top + 8);
        this.menu.style.right = `${right}px`;
        this.menu.style.bottom = `${bottom}px`;
    }

    private renderMenu(): void {
        if (!this.optionList) return;
        this.syncSearchAvailability();
        const signature = this.renderSignature();
        if (signature === this.renderedSignature) return;
        this.optionList.replaceChildren();
        if (this.isCatalogEmpty()) {
            this.optionList.append(this.createEmptyState());
            this.renderedSignature = signature;
            return;
        }
        const visibleGroups = filterSubtitleMenuGroups(this.viewModel.groups, this.query);
        this.renderGroup(this.viewModel.copy.providedHeading, visibleGroups.provided);
        this.renderGroup(this.viewModel.copy.translatedHeading, visibleGroups.translated);
        // 签名只在整段渲染完成后写入，避免半截列表被后续周期一直当作「已渲染」。
        this.renderedSignature = signature;
    }

    /**
     * 稳定性判定只能按内容比较：宿主每个轮询周期都会重建目录对象，比较引用会永远判定为「已变化」。
     * 字段用嵌套数组承载，避免标签内的分隔符把不同内容串成同一签名。
     */
    private renderSignature(): string {
        const {
            groups,
            activeOptionId,
            activeLanguageCode,
            preferredLanguageCode,
            copy
        } = this.viewModel;
        const items = (options: SubtitleOption[]) => options.map((option) => [
            option.id,
            option.label,
            option.targetLanguageCode,
            option.kind,
            option.kind === 'provided' ? option.sourceKind : '',
            option.searchText
        ]);
        return JSON.stringify([
            items(groups.provided),
            items(groups.translated),
            activeOptionId,
            activeLanguageCode,
            preferredLanguageCode,
            this.query,
            this.searchOpen,
            copy
        ]);
    }

    private isCatalogEmpty(): boolean {
        return this.viewModel.groups.provided.length === 0
            && this.viewModel.groups.translated.length === 0;
    }

    /** 目录为空时没有可过滤项，收起搜索行并隐藏搜索入口。 */
    private syncSearchAvailability(): void {
        if (this.searchToggle) {
            this.searchToggle.style.display = this.isCatalogEmpty() ? 'none' : 'inline-flex';
        }
        if (this.isCatalogEmpty() && this.searchOpen) this.setSearchOpen(false);
    }

    private createEmptyState(): HTMLDivElement {
        const empty = document.createElement('div');
        empty.className = 'vb-yt-subtitle-selector-empty';
        empty.textContent = this.viewModel.copy.emptyMessage;
        empty.style.cssText = [
            'padding:16px 14px',
            'color:rgba(255,255,255,.55)',
            'font-size:12px',
            'letter-spacing:0',
            'text-align:center'
        ].join(';');
        return empty;
    }

    private renderGroup(heading: string, options: SubtitleOption[]): void {
        if (!this.optionList || options.length === 0) return;
        const headingElement = document.createElement('div');
        headingElement.className = 'vb-yt-subtitle-selector-heading';
        headingElement.textContent = heading;
        headingElement.style.cssText = [
            'padding:10px 14px 4px',
            'color:rgba(255,255,255,.55)',
            'font-size:11px',
            'font-weight:500',
            'letter-spacing:0'
        ].join(';');
        this.optionList.append(headingElement);

        for (const option of options) {
            const optionButton = document.createElement('button');
            const active = isSubtitleMenuOptionActive(
                option,
                this.viewModel.activeOptionId,
                this.viewModel.activeLanguageCode
            );
            optionButton.type = 'button';
            optionButton.setAttribute('role', 'option');
            optionButton.setAttribute('aria-selected', String(active));
            optionButton.dataset.optionId = option.id;
            const baseBackground = active ? ACTIVE_BG : 'transparent';
            const hoverBackground = active ? ACTIVE_HOVER_BG : HOVER_BG;
            optionButton.style.cssText = [
                'width:100%',
                'min-height:38px',
                'display:grid',
                'grid-template-columns:20px minmax(0,1fr) auto',
                'align-items:center',
                'gap:8px',
                'padding:8px 14px',
                'border:0',
                'border-radius:0',
                `background:${baseBackground}`,
                'color:#fff',
                'font:inherit',
                'letter-spacing:0',
                'text-align:left',
                'cursor:pointer',
                'transition:background .12s ease'
            ].join(';');
            optionButton.addEventListener('pointerenter', () => {
                optionButton.style.background = hoverBackground;
            });
            optionButton.addEventListener('pointerleave', () => {
                optionButton.style.background = baseBackground;
            });

            const check = document.createElement('span');
            check.textContent = active ? '\u2713' : '';
            check.setAttribute('aria-hidden', 'true');
            check.style.cssText = [
                'width:20px',
                'text-align:center',
                'color:#3ea6ff',
                'font-size:14px',
                'font-weight:700'
            ].join(';');

            const label = document.createElement('span');
            label.textContent = option.label;
            label.style.cssText = 'min-width:0;overflow-wrap:anywhere';

            const badges = document.createElement('span');
            badges.style.cssText = [
                'display:flex',
                'align-items:center',
                'justify-content:flex-end',
                'gap:8px',
                'flex:0 0 auto',
                'white-space:nowrap'
            ].join(';');
            badges.append(this.createBadge(
                option.kind === 'translated'
                    ? this.viewModel.copy.translatedBadge
                    : option.sourceKind === 'asr'
                        ? this.viewModel.copy.asrBadge
                        : this.viewModel.copy.authorBadge
            ));
            if (areTargetLanguagesCompatible(
                option.targetLanguageCode,
                this.viewModel.preferredLanguageCode
            )) {
                badges.append(this.createBadge(this.viewModel.copy.preferredBadge, true));
            }

            optionButton.append(check, label, badges);
            optionButton.addEventListener('focus', () => {
                optionButton.style.outline = FOCUS_OUTLINE;
                optionButton.style.outlineOffset = '-2px';
            });
            optionButton.addEventListener('blur', () => {
                optionButton.style.outline = '';
                optionButton.style.outlineOffset = '';
            });
            optionButton.addEventListener('click', () => this.handleOptionClick(option));
            this.optionList.append(optionButton);
        }
    }

    private createBadge(text: string, emphasized = false): HTMLSpanElement {
        const badge = document.createElement('span');
        badge.textContent = text;
        badge.style.cssText = [
            'font-size:11px',
            'line-height:1.3',
            'letter-spacing:0',
            `color:${emphasized ? '#3ea6ff' : 'rgba(255,255,255,.55)'}`
        ].join(';');
        return badge;
    }

    private handleOptionClick(option: SubtitleOption): void {
        this.onSelectLanguage(option.targetLanguageCode);
        this.close();
        this.button?.focus();
    }

    private handleMenuKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (this.searchOpen) {
                this.setSearchOpen(false);
                this.renderMenu();
                this.searchToggle?.focus();
                return;
            }
            this.close();
            this.button?.focus();
            return;
        }

        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const visibleOptions = flattenSubtitleMenuGroups(
            filterSubtitleMenuGroups(this.viewModel.groups, this.query)
        );
        const optionButtons = Array.from(
            this.optionList?.querySelectorAll<HTMLButtonElement>('button[data-option-id]') || []
        );
        const activeId = document.activeElement instanceof HTMLElement
            ? document.activeElement.dataset.optionId
            : undefined;
        const currentIndex = visibleOptions.findIndex((option) => option.id === activeId);
        const nextIndex = getNextOptionIndex(
            visibleOptions.length,
            currentIndex,
            event.key === 'ArrowDown' ? 1 : -1
        );
        optionButtons[nextIndex]?.focus();
    }
}
