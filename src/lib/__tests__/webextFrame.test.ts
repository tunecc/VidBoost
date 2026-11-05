// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTopFrameContext } from '../webext';

describe('isTopFrameContext', () => {
    it('returns true in the top frame', () => {
        expect(isTopFrameContext()).toBe(true);
    });

    it('returns false inside a sub frame', () => {
        const original = window.top;
        Object.defineProperty(window, 'top', { value: {}, configurable: true });
        try {
            expect(isTopFrameContext()).toBe(false);
        } finally {
            Object.defineProperty(window, 'top', { value: original, configurable: true });
        }
    });
});
