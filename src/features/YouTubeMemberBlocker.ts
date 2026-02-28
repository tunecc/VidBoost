import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import {
    getSettings,
    onSettingsChanged,
    DEFAULT_SETTINGS,
    YT_MEMBER_BLOCK_SETTINGS_KEYS,
    type YTMemberBlockMode
} from '../lib/settings-content';
import { ObserverManager } from '../lib/ObserverManager';
import {
    MEMBER_CARD_SELECTORS,
    MEMBER_CHANNEL_SELECTORS,
    MEMBER_BADGE_ARIA_LABELS,
    MEMBER_BADGE_CLASS_NAMES,
    MEMBER_COMMERCE_BADGE_CLASS,
    MEMBER_COMMERCE_ICON_SELECTOR,
    MEMBER_MOBILE_BADGE_DATA_TYPE,
    getFastMembershipSelectorsForMode
} from './youtube/memberSelectorMatrix';
import {
    installMemberNetworkPrefilterBridge,
    pushMemberNetworkPrefilterConfig
} from './youtube/memberNetworkPrefilter';

type CardDecision = 'hide' | 'show' | 'pending';

/**
 * YouTubeMemberBlocker
 *
 * Hides "Members only" video cards from YouTube feeds (homepage,
 * search, subscriptions, channel pages and sidebar suggestions).
 *
 * Supports three modes:
 *   - 'all'       – hide every Members-only card
 *   - 'blocklist' – hide only cards from channels in the user's blocklist
 *   - 'allowlist' – hide all Members-only cards EXCEPT those from channels
 *                   in the user's allowlist
 */
export class YouTubeMemberBlocker implements Feature {
    private enabled = false;
    private mode: YTMemberBlockMode = DEFAULT_SETTINGS.yt_member_block_mode;
    private blocklist: Set<string> = new Set();
    private allowlist: Set<string> = new Set();
    private observerManager = new ObserverManager('yt-member-blocker');
    private fastHideStyleEl: HTMLStyleElement | null = null;
    private hiddenCards: Set<HTMLElement> = new Set();
    private delayedScanTimer: ReturnType<typeof setTimeout> | null = null;
    private observerInitTimer: ReturnType<typeof setTimeout> | null = null;
    private navigateHandler: (() => void) | null = null;

    /** CSS marker to avoid re-processing the same card */
    private static readonly PROCESSED_ATTR = 'data-vb-member-checked';
    private static readonly HIDDEN_ATTR = 'data-vb-member-hidden';
    private static readonly ALLOW_ATTR = 'data-vb-member-allow';
    private static readonly OBSERVER_SCOPE = 'spa';
    private static readonly PAGE_OBSERVER_NAME = 'dom';

    constructor() {
        // Load persisted settings
        getSettings([...YT_MEMBER_BLOCK_SETTINGS_KEYS]).then((res) => {
            this.mode = res.yt_member_block_mode ?? DEFAULT_SETTINGS.yt_member_block_mode;
            this.setChannelList(this.blocklist, res.yt_member_blocklist ?? DEFAULT_SETTINGS.yt_member_blocklist);
            this.setChannelList(this.allowlist, res.yt_member_allowlist ?? DEFAULT_SETTINGS.yt_member_allowlist);
            if (this.enabled) {
                this.syncMemberNetworkPrefilterConfig();
                this.refreshFastHideStyle();
                this.restoreAll();
                this.scanPage();
            }
        });

        // React to live setting changes
        onSettingsChanged((changes) => {
            if (changes.yt_member_block_mode !== undefined) {
                this.mode = changes.yt_member_block_mode;
                this.refreshFastHideStyle();
            }
            if (changes.yt_member_blocklist !== undefined) {
                this.setChannelList(this.blocklist, changes.yt_member_blocklist);
                this.refreshFastHideStyle();
            }
            if (changes.yt_member_allowlist !== undefined) {
                this.setChannelList(this.allowlist, changes.yt_member_allowlist);
            }
            // Re-evaluate all cards when settings change
            if (this.enabled) {
                this.syncMemberNetworkPrefilterConfig();
                this.restoreAll();
                this.scanPage();
            }
        });
    }

    // ─── Feature interface ───────────────────────────────────

    mount() {
        if (!isSiteHost('youtube')) return;
        if (this.enabled) return;
        this.enabled = true;

        installMemberNetworkPrefilterBridge();
        this.syncMemberNetworkPrefilterConfig();
        this.refreshFastHideStyle();
        this.scanPage();
        this.startObserver();

        // YouTube renders badge elements asynchronously (often inside
        // Shadow DOM that our MutationObserver can't reach). Schedule
        // a single delayed rescan to catch them.
        this.delayedScanTimer = setTimeout(() => {
            this.delayedScanTimer = null;
            this.scanPage();
        }, 1500);

        // Handle YouTube SPA navigation (yt-navigate-finish fires
        // after the new page DOM is ready).
        this.navigateHandler = () => {
            this.restoreAll();
            this.scanPage();
            // Delayed rescan for the new page's badges too
            if (this.delayedScanTimer) clearTimeout(this.delayedScanTimer);
            this.delayedScanTimer = setTimeout(() => {
                this.delayedScanTimer = null;
                this.scanPage();
            }, 1500);
        };
        window.addEventListener('yt-navigate-finish', this.navigateHandler);
    }

    unmount() {
        if (!this.enabled) return;
        this.enabled = false;
        this.syncMemberNetworkPrefilterConfig();
        this.stopObserver();
        this.restoreAll();
        if (this.delayedScanTimer) {
            clearTimeout(this.delayedScanTimer);
            this.delayedScanTimer = null;
        }
        if (this.observerInitTimer) {
            clearTimeout(this.observerInitTimer);
            this.observerInitTimer = null;
        }
        if (this.navigateHandler) {
            window.removeEventListener('yt-navigate-finish', this.navigateHandler);
            this.navigateHandler = null;
        }
        this.removeFastHideStyle();
    }

    updateSettings(_settings: unknown) { }

    // ─── Core Logic ──────────────────────────────────────────

    private syncMemberNetworkPrefilterConfig() {
        pushMemberNetworkPrefilterConfig({
            enabled: this.enabled,
            mode: this.mode,
            blocklist: [...this.blocklist],
            allowlist: [...this.allowlist]
        });
    }

    private setChannelList(target: Set<string>, list: string[]) {
        target.clear();
        list
            .map(h => h.trim().toLowerCase())
            .filter(h => h.length > 0)
            .map(h => h.startsWith('@')
                ? h
                : (/^uc[a-z0-9_-]+$/i.test(h) ? h : `@${h}`))
            .forEach(h => target.add(h));
    }

    /**
     * Scan the entire page for membership video cards and evaluate them.
     */
    private scanPage() {
        if (!this.enabled) return;

        // Strategy: card-first – iterate every card container and check
        // for membership badges using deep DOM traversal (Shadow DOM safe).
        for (const cardSel of MEMBER_CARD_SELECTORS) {
            const cards = document.querySelectorAll<HTMLElement>(cardSel);
            cards.forEach(card => {
                if (card.hasAttribute(YouTubeMemberBlocker.PROCESSED_ATTR)) return;
                if (this.hasMembershipBadge(card)) {
                    const decision = this.evaluateCard(card);
                    if (decision === 'pending') return;
                    card.setAttribute(YouTubeMemberBlocker.PROCESSED_ATTR, '1');
                    if (decision === 'hide') this.hideCard(card);
                    else this.showCard(card);
                }
            });
        }
    }

    /**
     * Check whether a card element contains a "Members only" badge.
     *
     * YouTube uses Polymer components which may render badge elements
     * inside Shadow DOM boundaries. Standard `querySelector` cannot
     * cross shadow boundaries, so we use a deep traversal.
     */
    private hasMembershipBadge(card: HTMLElement): boolean {
        return this.deepQuerySelector(card, el => {
            // Match by aria-label (most reliable)
            const aria = el.getAttribute('aria-label')?.trim().toLowerCase();
            if (aria && MEMBER_BADGE_ARIA_LABELS.includes(aria)) return true;

            // Membership class is specific enough to trust directly.
            if (MEMBER_BADGE_CLASS_NAMES.some((className) => el.classList.contains(className))) {
                return true;
            }

            // Mobile badge marker
            if (el.tagName.toLowerCase() === 'ytm-badge' &&
                el.getAttribute('data-type') === MEMBER_MOBILE_BADGE_DATA_TYPE) {
                return true;
            }

            // Commerce badge can include non-membership labels, so verify text.
            if (el.classList.contains(MEMBER_COMMERCE_BADGE_CLASS)) {
                // Current YouTube membership badge can be icon-only under commerce shape.
                if (el.querySelector(MEMBER_COMMERCE_ICON_SELECTOR)) return true;
                const text = el.textContent?.trim() ?? '';
                const lc = text.toLowerCase();
                if (MEMBER_BADGE_ARIA_LABELS.some((label) => lc.includes(label))) return true;
            }

            return false;
        });
    }

    private refreshFastHideStyle() {
        if (!this.enabled || !this.supportsHasSelector()) {
            this.removeFastHideStyle();
            return;
        }
        const css = this.buildFastHideCss();
        if (!css) {
            this.removeFastHideStyle();
            return;
        }
        if (!this.fastHideStyleEl) {
            const style = document.createElement('style');
            style.id = 'vb-yt-member-fast-hide';
            (document.head || document.documentElement).appendChild(style);
            this.fastHideStyleEl = style;
        }
        if (this.fastHideStyleEl.textContent !== css) {
            this.fastHideStyleEl.textContent = css;
        }
    }

    private buildFastHideCss(): string {
        const membershipCardSelectors = getFastMembershipSelectorsForMode(this.mode);
        if (membershipCardSelectors.length === 0) return '';

        if (this.mode === 'all') {
            return `${membershipCardSelectors.join(',\n')} { display: none !important; }`;
        }

        if (this.mode === 'allowlist') {
            const hideUnlessAllowed = membershipCardSelectors
                .map(sel => `${sel}:not([${YouTubeMemberBlocker.ALLOW_ATTR}])`);
            return `${hideUnlessAllowed.join(',\n')} { display: none !important; }`;
        }

        const blockedSelectors: string[] = [];
        for (const sel of membershipCardSelectors) {
            for (const entry of this.blocklist) {
                const channelSelector = this.channelEntryToAnchorSelector(entry);
                if (!channelSelector) continue;
                blockedSelectors.push(`${sel}:has(${channelSelector}):not([${YouTubeMemberBlocker.ALLOW_ATTR}])`);
            }
        }
        if (blockedSelectors.length === 0) return '';
        return `${blockedSelectors.join(',\n')} { display: none !important; }`;
    }

    private channelEntryToAnchorSelector(entry: string): string | null {
        if (entry.startsWith('@')) {
            const handle = entry.slice(1).trim();
            if (!handle) return null;
            return this.buildChannelHrefMatcher(`/@${handle}`);
        }
        if (/^uc[a-z0-9_-]+$/i.test(entry)) {
            return this.buildChannelHrefMatcher(`/channel/${entry}`);
        }
        return null;
    }

    private buildChannelHrefMatcher(pathPrefix: string): string {
        const absDesktop = `https://www.youtube.com${pathPrefix}`;
        const absMobile = `https://m.youtube.com${pathPrefix}`;
        const matchers = [
            ...this.hrefMatchers(pathPrefix),
            ...this.hrefMatchers(absDesktop),
            ...this.hrefMatchers(absMobile)
        ];
        return `a:is(${matchers.join(', ')})`;
    }

    private hrefMatchers(prefix: string): string[] {
        const escaped = this.escapeCssAttrValue(prefix);
        return [
            `[href="${escaped}" i]`,
            `[href^="${escaped}/" i]`,
            `[href^="${escaped}?" i]`
        ];
    }

    private escapeCssAttrValue(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    private removeFastHideStyle() {
        if (!this.fastHideStyleEl) return;
        this.fastHideStyleEl.remove();
        this.fastHideStyleEl = null;
    }

    private supportsHasSelector(): boolean {
        try {
            return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('selector(:has(*))');
        } catch {
            return false;
        }
    }

    /**
     * Deep DOM traversal that enters Shadow DOM boundaries.
     * Calls `predicate` for every element in the tree rooted at `root`.
     * Returns true as soon as `predicate` returns true for any element.
     */
    private deepQuerySelector(root: Element, predicate: (el: Element) => boolean): boolean {
        // Check the root itself
        if (predicate(root)) return true;

        // Check light DOM children
        const children = root.children;
        for (let i = 0; i < children.length; i++) {
            if (this.deepQuerySelector(children[i], predicate)) return true;
        }

        // Enter shadow root if present
        if (root.shadowRoot) {
            const shadowChildren = root.shadowRoot.children;
            for (let i = 0; i < shadowChildren.length; i++) {
                if (this.deepQuerySelector(shadowChildren[i], predicate)) return true;
            }
        }

        return false;
    }

    /**
     * Decide whether to hide a single card based on mode + channel lists.
     */
    private evaluateCard(card: HTMLElement): CardDecision {
        if (this.mode === 'all') {
            return 'hide';
        }

        const handle = this.extractChannelHandle(card);
        if (!handle) return 'pending';

        if (this.mode === 'blocklist') {
            return this.blocklist.has(handle) ? 'hide' : 'show';
        }

        if (this.mode === 'allowlist') {
            // Hide unless channel is in allowlist
            return this.allowlist.has(handle) ? 'show' : 'hide';
        }
        return 'show';
    }

    private hideCard(card: HTMLElement) {
        card.removeAttribute(YouTubeMemberBlocker.ALLOW_ATTR);
        card.style.display = 'none';
        card.setAttribute(YouTubeMemberBlocker.HIDDEN_ATTR, '1');
        this.hiddenCards.add(card);
    }

    private showCard(card: HTMLElement) {
        // CSS fast-hide rules for allowlist/blocklist opt out cards marked as allow.
        if (this.mode === 'allowlist' || this.mode === 'blocklist') {
            card.setAttribute(YouTubeMemberBlocker.ALLOW_ATTR, '1');
        } else {
            card.removeAttribute(YouTubeMemberBlocker.ALLOW_ATTR);
        }
        card.style.display = '';
        card.removeAttribute(YouTubeMemberBlocker.HIDDEN_ATTR);
        this.hiddenCards.delete(card);
    }

    private restoreAll() {
        this.hiddenCards.forEach(card => {
            card.style.display = '';
            card.removeAttribute(YouTubeMemberBlocker.HIDDEN_ATTR);
            card.removeAttribute(YouTubeMemberBlocker.PROCESSED_ATTR);
        });
        this.hiddenCards.clear();

        // Also clean up processed markers on non-hidden cards
        document.querySelectorAll(`[${YouTubeMemberBlocker.PROCESSED_ATTR}]`).forEach(el => {
            el.removeAttribute(YouTubeMemberBlocker.PROCESSED_ATTR);
        });
        document.querySelectorAll(`[${YouTubeMemberBlocker.ALLOW_ATTR}]`).forEach(el => {
            el.removeAttribute(YouTubeMemberBlocker.ALLOW_ATTR);
        });
    }

    // ─── DOM Helpers ─────────────────────────────────────────

    private extractChannelHandle(card: HTMLElement): string | null {
        for (const selector of MEMBER_CHANNEL_SELECTORS) {
            const link = card.querySelector<HTMLAnchorElement>(selector);
            if (!link) continue;

            const href = link.getAttribute('href') ?? '';

            // /@channelHandle or /@channelHandle/...
            const handleMatch = href.match(/(?:https?:\/\/(?:www\.|m\.)?youtube\.com)?\/@([^/?]+)/i);
            if (handleMatch) return `@${handleMatch[1].toLowerCase()}`;

            // /channel/UCxxxxxx
            const channelMatch = href.match(/(?:https?:\/\/(?:www\.|m\.)?youtube\.com)?\/channel\/(UC[^/?]+)/i);
            if (channelMatch) return channelMatch[1].toLowerCase();
        }

        // Fallback: on a channel's own page, video cards don't contain channel links
        // (YouTube hides them since it's redundant). Extract from the page URL instead.
        return this.extractChannelFromPageURL();
    }

    /**
     * Try to extract the channel handle from the current page URL.
     * Works for URLs like youtube.com/@channelHandle or youtube.com/@channelHandle/membership
     */
    private extractChannelFromPageURL(): string | null {
        const path = window.location.pathname;
        const match = path.match(/^\/@([^/?]+)/);
        if (match) return `@${match[1].toLowerCase()}`;
        return null;
    }

    // ─── MutationObserver ────────────────────────────────────

    private startObserver() {
        if (this.observerManager.has(YouTubeMemberBlocker.OBSERVER_SCOPE, YouTubeMemberBlocker.PAGE_OBSERVER_NAME)) {
            return;
        }
        const body = document.body;
        if (!body) {
            // Content script runs at document_start; body may not exist yet.
            if (this.observerInitTimer) return;
            this.observerInitTimer = setTimeout(() => {
                this.observerInitTimer = null;
                if (this.enabled) this.startObserver();
            }, 50);
            return;
        }

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        this.observerManager.observe({
            scope: YouTubeMemberBlocker.OBSERVER_SCOPE,
            name: YouTubeMemberBlocker.PAGE_OBSERVER_NAME,
            target: body,
            options: {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['hidden']
            },
            callback: (mutations) => {
                let shouldScan = false;
                for (const m of mutations) {
                    // New nodes added (new cards, or badge children being populated)
                    if (m.addedNodes.length > 0) {
                        shouldScan = true;
                        break;
                    }
                    // Attribute changes: YouTube removes 'hidden' from badge
                    // containers when badge data arrives.
                    if (m.type === 'attributes' && m.attributeName === 'hidden') {
                        const target = m.target as HTMLElement;
                        if (target.classList?.contains('video-badge') ||
                            target.tagName?.toLowerCase() === 'ytd-badge-supported-renderer') {
                            shouldScan = true;
                            break;
                        }
                    }
                }
                if (shouldScan) {
                    // Debounce: wait 200ms for YouTube to finish its batch of DOM updates.
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        this.scanPage();
                    }, 200);
                }
            },
            onDisconnect: () => {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }
            }
        });
        // Catch cards already in DOM when observer attaches late.
        this.scanPage();
    }

    private stopObserver() {
        this.observerManager.disconnectScope(YouTubeMemberBlocker.OBSERVER_SCOPE);
    }
}
