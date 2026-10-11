import { describe, expect, it } from 'vitest';
import { CONTENT_SETTINGS_KEYS, DEFAULT_SETTINGS, resolveSettings } from '../settings';

describe('bilibili thread ripper / no-p2p settings', () => {
    it('defaults both new capabilities to disabled', () => {
        expect(DEFAULT_SETTINGS.bb_thread_ripper).toEqual({ enabled: false });
        expect(DEFAULT_SETTINGS.bb_no_p2p).toEqual({ enabled: false });
    });

    it('resolveSettings fills the new keys with disabled defaults', () => {
        const resolved = resolveSettings({});
        expect(resolved.bb_thread_ripper.enabled).toBe(false);
        expect(resolved.bb_no_p2p.enabled).toBe(false);
    });

    it('resolveSettings preserves stored enabled flags', () => {
        const resolved = resolveSettings({
            bb_thread_ripper: { enabled: true },
            bb_no_p2p: { enabled: true }
        });
        expect(resolved.bb_thread_ripper).toEqual({ enabled: true });
        expect(resolved.bb_no_p2p).toEqual({ enabled: true });
    });

    it('normalize non-boolean enabled flags back to false', () => {
        const resolved = resolveSettings({
            bb_thread_ripper: { enabled: 'yes' as unknown as boolean },
            bb_no_p2p: { enabled: null as unknown as boolean }
        });
        expect(resolved.bb_thread_ripper).toEqual({ enabled: false });
        expect(resolved.bb_no_p2p).toEqual({ enabled: false });
    });

    it('registers both keys for the content script', () => {
        expect(CONTENT_SETTINGS_KEYS).toContain('bb_thread_ripper');
        expect(CONTENT_SETTINGS_KEYS).toContain('bb_no_p2p');
    });
});
