import { markInteractionRoot } from '../../../../lib/pointerTargets';
import { areTargetLanguagesCompatible } from './language';
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
        preferredBadge: ''
    }
};

export class SubtitleSelector {
    private viewModel = EMPTY_VIEW_MODEL;
    private button: HTMLButtonElement | null = null;
    private menu: HTMLDivElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private optionList: HTMLDivElement | null = null;
    private query = '';

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
        if (viewModel.groups.provided.length === 0 && viewModel.groups.translated.length === 0) {
            this.detach();
            return;
        }
        if (this.button) {
            this.button.setAttribute('aria-label', viewModel.copy.buttonLabel);
            this.button.title = viewModel.copy.buttonLabel;
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

        const icon = document.createElement('span');
        icon.textContent = 'CC';
        icon.setAttribute('aria-hidden', 'true');
        icon.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'width:24px',
            'height:17px',
            'border:2px solid currentColor',
            'border-radius:2px',
            'box-sizing:border-box',
            'font:700 9px/1 Arial,sans-serif',
            'letter-spacing:0'
        ].join(';');
        button.append(icon);
        button.addEventListener('click', () => {
            if (this.menu?.style.display === 'none') this.open();
            else this.close();
        });

        const settingsButton = controls.querySelector('.ytp-settings-button');
        controls.insertBefore(button, settingsButton ?? controls.firstChild);

        const menu = document.createElement('div');
        menu.id = 'vb-yt-subtitle-selector-menu';
        menu.className = 'vb-yt-subtitle-selector-menu';
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-label', this.viewModel.copy.buttonLabel);
        menu.style.cssText = [
            'position:absolute',
            'display:none',
            'flex-direction:column',
            'width:min(320px, calc(100% - 24px))',
            'max-height:min(420px, calc(100% - 80px))',
            'box-sizing:border-box',
            'padding:10px',
            'gap:8px',
            'overflow:hidden',
            'z-index:70',
            'color:#fff',
            'background:rgba(20,20,20,.96)',
            'border:1px solid rgba(255,255,255,.18)',
            'border-radius:6px',
            'box-shadow:0 8px 24px rgba(0,0,0,.38)',
            'font:400 13px/1.35 Roboto,Arial,sans-serif',
            'letter-spacing:0'
        ].join(';');

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = this.viewModel.copy.searchPlaceholder;
        searchInput.setAttribute('aria-label', this.viewModel.copy.searchPlaceholder);
        searchInput.style.cssText = [
            'width:100%',
            'height:34px',
            'box-sizing:border-box',
            'padding:0 10px',
            'border:1px solid rgba(255,255,255,.26)',
            'border-radius:4px',
            'outline:none',
            'color:#fff',
            'background:rgba(255,255,255,.08)',
            'font:inherit',
            'letter-spacing:0'
        ].join(';');
        searchInput.addEventListener('input', () => {
            this.query = searchInput.value;
            this.renderMenu();
        });

        const optionList = document.createElement('div');
        optionList.setAttribute('role', 'listbox');
        optionList.style.cssText = 'min-height:0;overflow:auto;display:flex;flex-direction:column;gap:4px';
        menu.append(searchInput, optionList);
        menu.addEventListener('keydown', (event) => this.handleMenuKeydown(event));
        player.append(menu);

        markInteractionRoot(button);
        markInteractionRoot(menu);
        this.button = button;
        this.menu = menu;
        this.searchInput = searchInput;
        this.optionList = optionList;
        this.renderMenu();
        return true;
    }

    close(): void {
        if (!this.menu) return;
        this.menu.style.display = 'none';
        this.button?.setAttribute('aria-expanded', 'false');
    }

    detach(): void {
        this.close();
        this.button?.remove();
        this.menu?.remove();
        this.button = null;
        this.menu = null;
        this.searchInput = null;
        this.optionList = null;
        this.query = '';
    }

    destroy(): void {
        document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
        window.removeEventListener('resize', this.handleWindowResize);
        this.detach();
        this.viewModel = EMPTY_VIEW_MODEL;
    }

    private open(): void {
        if (!this.ensureMounted() || !this.menu || !this.searchInput) return;
        this.query = '';
        this.searchInput.value = '';
        this.renderMenu();
        this.menu.style.display = 'flex';
        this.button?.setAttribute('aria-expanded', 'true');
        this.positionMenu();
        this.searchInput.focus();
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
        const visibleGroups = filterSubtitleMenuGroups(this.viewModel.groups, this.query);
        this.optionList.replaceChildren();
        this.renderGroup(this.viewModel.copy.providedHeading, visibleGroups.provided);
        this.renderGroup(this.viewModel.copy.translatedHeading, visibleGroups.translated);
    }

    private renderGroup(heading: string, options: SubtitleOption[]): void {
        if (!this.optionList || options.length === 0) return;
        const headingElement = document.createElement('div');
        headingElement.textContent = heading;
        headingElement.style.cssText = [
            'padding:8px 8px 3px',
            'color:rgba(255,255,255,.68)',
            'font-size:11px',
            'font-weight:600',
            'text-transform:uppercase',
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
            optionButton.style.cssText = [
                'width:100%',
                'min-height:38px',
                'display:grid',
                'grid-template-columns:18px minmax(0,1fr) auto',
                'align-items:center',
                'gap:8px',
                'padding:6px 8px',
                'border:0',
                'border-radius:4px',
                `background:${active ? 'rgba(62,166,255,.24)' : 'transparent'}`,
                'color:#fff',
                'font:inherit',
                'letter-spacing:0',
                'text-align:left',
                'cursor:pointer'
            ].join(';');

            const check = document.createElement('span');
            check.textContent = active ? '\u2713' : '';
            check.setAttribute('aria-hidden', 'true');
            check.style.cssText = 'width:18px;text-align:center;color:#3ea6ff;font-weight:700';

            const label = document.createElement('span');
            label.textContent = option.label;
            label.style.cssText = 'min-width:0;overflow-wrap:anywhere';

            const badges = document.createElement('span');
            badges.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:4px;white-space:nowrap';
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
                optionButton.style.outline = '2px solid rgba(255,255,255,.9)';
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
            'padding:2px 5px',
            'border-radius:3px',
            `color:${emphasized ? '#3ea6ff' : 'rgba(255,255,255,.72)'}`,
            `background:${emphasized ? 'rgba(62,166,255,.16)' : 'rgba(255,255,255,.1)'}`,
            'font-size:10px',
            'line-height:1.3',
            'letter-spacing:0'
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
