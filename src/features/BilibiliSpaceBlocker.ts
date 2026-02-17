import type { Feature } from './Feature';
import { InputManager } from '../lib/InputManager';
import { isSiteHost } from '../lib/siteProfiles';

/**
 * BilibiliSpaceBlocker
 *
 * Prevents the Space key from scrolling the page on Bilibili video pages.
 * Unlike the original userscript which blocks ALL keys, this only targets
 * the Space key and is smart enough to skip when the user is typing in
 * an input field, textarea, or contenteditable element.
 */
export class BilibiliSpaceBlocker implements Feature {
    private input = InputManager.getInstance();
    private enabled = false;
    private listenersRegistered = false;

    private isTypingContext(target: HTMLElement): boolean {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (target.isContentEditable) return true;
        // Bilibili danmaku (弹幕) input
        if (target.closest('.bpx-player-dm-input, .bpx-player-sending-area')) return true;
        return false;
    }

    mount() {
        if (!isSiteHost('bilibili')) return;
        if (this.enabled) return;
        this.enabled = true;

        if (this.listenersRegistered) return;
        this.listenersRegistered = true;

        this.input.on('keydown', 'bb-block-space', (e) => {
            if (!this.enabled) return false;

            const ke = e as KeyboardEvent;

            // Only block the Space key
            if (ke.code !== 'Space' && ke.key !== ' ') return false;

            // Don't block if modifier keys are held
            if (ke.ctrlKey || ke.altKey || ke.metaKey || ke.shiftKey) return false;

            const target = ke.target as HTMLElement;

            // Don't block when user is typing
            if (this.isTypingContext(target)) return false;

            // Prevent default page scroll, but keep propagation so
            // Bilibili's own Space shortcut can still toggle play/pause.
            ke.preventDefault();
            return false;
        }, { priority: 50 });
    }

    unmount() {
        this.enabled = false;
    }

    updateSettings(_settings: unknown) { }
}
