import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';

const DISPLAY_CLASS = 'vb-stats-speed-converter';
const DISPLAY_COLOR = '#42a5f5';
const NAV_DELAY_MS = 180;
const YT_ROOT_SELECTOR = '#movie_player, ytd-player, #player';
const BB_ROOT_SELECTOR = '#bilibili-player, .bpx-player-container, .bilibili-player';
const YT_PANEL_SELECTOR = '.html5-video-info-panel, .html5-video-info-panel-content';
const BB_PANEL_SELECTOR = '.bpx-player-info-panel';

type SpeedBinding = {
    valueEl: HTMLElement;
    displayEl: HTMLSpanElement;
    observer: MutationObserver;
    attachDisplay: () => void;
};

type SpeedCandidate = {
    valueEl: HTMLElement;
    attachDisplay: (displayEl: HTMLSpanElement) => void;
};

function isElement(value: unknown): value is HTMLElement {
    return value instanceof HTMLElement;
}

function normalizeLabel(text: string) {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function convertKbpsToMBps(text: string) {
    const match = text.match(/([\d,.]+)\s*Kbps\b/i);
    if (!match) return null;

    const numeric = Number.parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(numeric)) return null;

    return (numeric / 8 / 1024).toFixed(2);
}

function readSourceText(valueEl: HTMLElement) {
    const parts: string[] = [];
    for (const node of Array.from(valueEl.childNodes)) {
        if (node instanceof HTMLElement && node.classList.contains(DISPLAY_CLASS)) {
            continue;
        }
        parts.push(node.textContent || '');
    }
    return parts.join('');
}

export class StatsSpeedConverter implements Feature {
    private enabled = false;
    private mainObserver: MutationObserver | null = null;
    private mainObserverTarget: Node | null = null;
    private navigationTimer: number | null = null;
    private syncQueued = false;
    private bindings = new Map<HTMLElement, SpeedBinding>();

    private readonly handleNavigation = () => {
        if (!this.enabled) return;
        if (this.navigationTimer != null) {
            window.clearTimeout(this.navigationTimer);
        }
        this.navigationTimer = window.setTimeout(() => {
            this.navigationTimer = null;
            this.scheduleSync();
        }, NAV_DELAY_MS);
    };

    mount() {
        if (!this.isSupportedHost()) return;
        if (this.enabled) return;

        this.enabled = true;
        this.refreshMainObserver();
        window.addEventListener('popstate', this.handleNavigation);
        document.addEventListener('yt-navigate-finish', this.handleNavigation, true);
        this.scheduleSync();
    }

    unmount() {
        this.enabled = false;

        if (this.navigationTimer != null) {
            window.clearTimeout(this.navigationTimer);
            this.navigationTimer = null;
        }

        window.removeEventListener('popstate', this.handleNavigation);
        document.removeEventListener('yt-navigate-finish', this.handleNavigation, true);
        this.mainObserver?.disconnect();
        this.mainObserver = null;
        this.mainObserverTarget = null;
        this.syncQueued = false;
        this.disconnectAllBindings();
    }

    updateSettings(_settings: unknown) {}

    private isSupportedHost() {
        return isSiteHost('youtube') || isSiteHost('bilibili');
    }

    private resolveMainObserverTarget() {
        if (isSiteHost('youtube')) {
            return document.querySelector(YT_ROOT_SELECTOR)
                || document.body
                || document.documentElement
                || null;
        }

        if (isSiteHost('bilibili')) {
            return document.querySelector(BB_ROOT_SELECTOR)
                || document.body
                || document.documentElement
                || null;
        }

        return document.body || document.documentElement || null;
    }

    private refreshMainObserver() {
        const target = this.resolveMainObserverTarget();
        if (!target) return;
        if (this.mainObserver && this.mainObserverTarget === target) return;

        this.mainObserver?.disconnect();
        this.mainObserverTarget = target;
        this.mainObserver = new MutationObserver((mutations) => {
            if (!this.shouldSyncForMutations(mutations)) return;
            this.scheduleSync();
        });

        this.mainObserver.observe(target, {
            childList: true,
            subtree: true
        });
    }

    private scheduleSync() {
        if (!this.enabled) return;
        if (this.syncQueued) return;

        this.syncQueued = true;
        window.requestAnimationFrame(() => {
            this.syncQueued = false;
            this.sync();
        });
    }

    private sync() {
        this.refreshMainObserver();
        this.cleanupStaleBindings();
        if (!this.enabled) return;

        const candidates = isSiteHost('youtube')
            ? this.collectYouTubeCandidates()
            : isSiteHost('bilibili')
                ? this.collectBilibiliCandidates()
                : [];

        for (const candidate of candidates) {
            let binding = this.bindings.get(candidate.valueEl);
            if (!binding) {
                const displayEl = this.createDisplayEl();
                candidate.attachDisplay(displayEl);

                const observer = new MutationObserver((mutations) => {
                    const onlyDisplayMutations = mutations.every((mutation) => {
                        const target = mutation.target;
                        return displayEl === target || displayEl.contains(target);
                    });
                    if (onlyDisplayMutations) return;
                    this.updateBinding(candidate.valueEl);
                });
                observer.observe(candidate.valueEl, {
                    characterData: true,
                    childList: true,
                    subtree: true
                });

                binding = {
                    valueEl: candidate.valueEl,
                    displayEl,
                    observer,
                    attachDisplay: () => candidate.attachDisplay(displayEl)
                };
                this.bindings.set(candidate.valueEl, binding);
            }

            this.updateBinding(candidate.valueEl);
        }
    }

    private shouldSyncForMutations(mutations: MutationRecord[]) {
        if (!this.enabled) return false;
        if (this.mainObserverTarget instanceof Element && !document.contains(this.mainObserverTarget)) {
            return true;
        }

        for (const mutation of mutations) {
            if (mutation.type !== 'childList') continue;

            for (const node of Array.from(mutation.addedNodes)) {
                if (this.isRelevantMutationNode(node)) return true;
            }

            for (const node of Array.from(mutation.removedNodes)) {
                if (this.isRelevantMutationNode(node)) return true;
            }
        }

        return false;
    }

    private isRelevantMutationNode(node: Node) {
        if (!(node instanceof Element)) {
            return false;
        }

        const rootSelector = isSiteHost('youtube') ? YT_ROOT_SELECTOR : BB_ROOT_SELECTOR;
        const panelSelector = isSiteHost('youtube') ? YT_PANEL_SELECTOR : BB_PANEL_SELECTOR;
        if (node.matches(rootSelector) || node.querySelector(rootSelector)) {
            return true;
        }
        if (node.matches(panelSelector) || node.querySelector(panelSelector)) {
            return true;
        }

        for (const [valueEl, binding] of this.bindings) {
            if (node === valueEl || node.contains(valueEl)) return true;
            if (node === binding.displayEl || node.contains(binding.displayEl)) return true;
        }

        return false;
    }

    private cleanupStaleBindings() {
        for (const [valueEl, binding] of this.bindings) {
            if (document.contains(valueEl)) continue;
            binding.observer.disconnect();
            binding.displayEl.remove();
            this.bindings.delete(valueEl);
        }
    }

    private disconnectAllBindings() {
        for (const [, binding] of this.bindings) {
            binding.observer.disconnect();
            binding.displayEl.remove();
        }
        this.bindings.clear();
    }

    private updateBinding(valueEl: HTMLElement) {
        const binding = this.bindings.get(valueEl);
        if (!binding) return;

        binding.attachDisplay();

        const converted = convertKbpsToMBps(readSourceText(valueEl));
        if (!converted) {
            if (binding.displayEl.style.display !== 'none') {
                binding.displayEl.style.display = 'none';
            }
            if (binding.displayEl.textContent !== '') {
                binding.displayEl.textContent = '';
            }
            return;
        }

        if (binding.displayEl.style.display !== 'inline') {
            binding.displayEl.style.display = 'inline';
        }

        const nextText = `(${converted} MB/s)`;
        if (binding.displayEl.textContent !== nextText) {
            binding.displayEl.textContent = nextText;
        }
    }

    private createDisplayEl() {
        const el = document.createElement('span');
        el.className = DISPLAY_CLASS;
        el.style.marginLeft = '8px';
        el.style.color = DISPLAY_COLOR;
        el.style.fontWeight = 'bold';
        el.style.whiteSpace = 'nowrap';
        return el;
    }

    private collectYouTubeCandidates(): SpeedCandidate[] {
        if (!isSiteHost('youtube')) return [];

        const panels = Array.from(document.querySelectorAll<HTMLElement>('.html5-video-info-panel, .html5-video-info-panel-content'));
        const candidates: SpeedCandidate[] = [];

        for (const panel of panels) {
            const label = document.evaluate(
                ".//div[contains(text(), 'Connection Speed') or contains(text(), '连接速度')]",
                panel,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (!isElement(label)) continue;

            const valueContainer = label.nextElementSibling;
            if (!isElement(valueContainer)) continue;

            const directSpans = Array.from(valueContainer.children).filter(
                (child): child is HTMLSpanElement => child instanceof HTMLSpanElement
            );
            const valueEl = directSpans.find((span) => /Kbps\b/i.test(span.textContent || ''))
                || directSpans[1]
                || directSpans[directSpans.length - 1]
                || valueContainer.querySelector<HTMLElement>('span:nth-child(2)')
                || valueContainer.querySelector<HTMLElement>('span');
            if (!valueEl) continue;

            candidates.push({
                valueEl,
                attachDisplay: (displayEl) => {
                    displayEl.style.marginLeft = '4px';
                    if (displayEl.parentElement !== valueEl) {
                        valueEl.appendChild(displayEl);
                    } else if (valueEl.lastElementChild !== displayEl) {
                        valueEl.appendChild(displayEl);
                    }
                }
            });
        }

        return candidates;
    }

    private collectBilibiliCandidates(): SpeedCandidate[] {
        if (!isSiteHost('bilibili')) return [];

        const candidates: SpeedCandidate[] = [];
        const rows = document.querySelectorAll<HTMLElement>('.bpx-player-info-panel .info-line');

        for (const row of rows) {
            const titleEl = row.querySelector<HTMLElement>('.info-title');
            const valueEl = row.querySelector<HTMLElement>('.info-data');
            if (!titleEl || !valueEl) continue;

            const label = normalizeLabel(titleEl.textContent || '');
            const isSpeedRow = label === 'video speed:' || label === 'video speed'
                || label === 'audio speed:' || label === 'audio speed'
                || label === '视频速度:' || label === '视频速度'
                || label === '音频速度:' || label === '音频速度';
            if (!isSpeedRow) continue;

            candidates.push({
                valueEl,
                attachDisplay: (displayEl) => {
                    displayEl.style.marginLeft = '4px';
                    if (displayEl.parentElement !== valueEl) {
                        valueEl.appendChild(displayEl);
                    } else if (valueEl.lastElementChild !== displayEl) {
                        valueEl.appendChild(displayEl);
                    }
                }
            });
        }

        return candidates;
    }
}
