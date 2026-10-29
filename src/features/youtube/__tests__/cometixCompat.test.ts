import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    COMETIX_TRANSLATE_CAPTION_WINDOW_ID,
    COMETIX_TRANSLATE_ROOT_ID,
    createCometixTranslateYieldController,
    findCometixTranslateRoot,
    hasCometixTranslateTakenOver,
    isCometixTranslatePresent,
    resolvePluginTranslateYield
} from '../subtitleOverlay.shared';

function mountCometixRoot(): HTMLElement {
    const root = document.createElement('div');
    root.id = COMETIX_TRANSLATE_ROOT_ID;
    document.body.append(root);
    return root;
}

function mountCometixCaptionWindow(): HTMLElement {
    const window = document.createElement('div');
    window.id = COMETIX_TRANSLATE_CAPTION_WINDOW_ID;
    document.body.append(window);
    return window;
}

afterEach(() => {
    document.getElementById(COMETIX_TRANSLATE_ROOT_ID)?.remove();
    document.getElementById(COMETIX_TRANSLATE_CAPTION_WINDOW_ID)?.remove();
    vi.restoreAllMocks();
});

describe('isCometixTranslatePresent（A1）', () => {
    it('returns true while the root element is mounted', () => {
        mountCometixRoot();
        expect(isCometixTranslatePresent()).toBe(true);
        expect(findCometixTranslateRoot()?.id).toBe(COMETIX_TRANSLATE_ROOT_ID);
    });

    it('returns false after the root element is removed', () => {
        mountCometixRoot().remove();
        expect(isCometixTranslatePresent()).toBe(false);
        expect(findCometixTranslateRoot()).toBeNull();
    });

    it('returns false without throwing when document is unavailable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
        Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
        try {
            expect(isCometixTranslatePresent()).toBe(false);
            expect(findCometixTranslateRoot()).toBeNull();
        } finally {
            if (descriptor) {
                Object.defineProperty(globalThis, 'document', descriptor);
            }
        }
    });
});

describe('hasCometixTranslateTakenOver（A2）', () => {
    it('returns true only once the caption window exists', () => {
        mountCometixRoot();
        expect(hasCometixTranslateTakenOver()).toBe(false);
        mountCometixCaptionWindow();
        expect(hasCometixTranslateTakenOver()).toBe(true);
    });

    it('returns false when nothing is mounted', () => {
        expect(hasCometixTranslateTakenOver()).toBe(false);
    });

    it('returns false without throwing when document is unavailable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
        Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true });
        try {
            expect(hasCometixTranslateTakenOver()).toBe(false);
        } finally {
            if (descriptor) {
                Object.defineProperty(globalThis, 'document', descriptor);
            }
        }
    });
});

describe('resolvePluginTranslateYield（三路优先级，A4 / A8 / A12）', () => {
    it('keeps the legacy result for every old combination when cometixPresent is omitted (A12)', () => {
        const legacy = (enabled: boolean, readFrogPresent: boolean) =>
            resolvePluginTranslateYield('en', { enabled, readFrogPresent });
        expect(legacy(false, true)).toBeNull();
        expect(legacy(false, false)).toBeNull();
        expect(legacy(true, true)).toBe('read-frog');
        expect(legacy(true, false)).toBe('immersive-translate');
        expect(
            resolvePluginTranslateYield('zh-Hans', { enabled: true, readFrogPresent: false })
        ).toBeNull();
    });

    it('ranks Read Frog above Cometix Translate (A4)', () => {
        expect(
            resolvePluginTranslateYield('en', {
                enabled: true,
                readFrogPresent: true,
                cometixPresent: true
            })
        ).toBe('read-frog');
    });

    it('yields to Cometix Translate when present and Read Frog is absent (A4)', () => {
        expect(
            resolvePluginTranslateYield('ja', {
                enabled: true,
                readFrogPresent: false,
                cometixPresent: true
            })
        ).toBe('cometix-translate');
    });

    it('falls back to Immersive Translate when neither plugin is present (A4 / A8)', () => {
        expect(
            resolvePluginTranslateYield('en', {
                enabled: true,
                readFrogPresent: false,
                cometixPresent: false
            })
        ).toBe('immersive-translate');
    });

    it('yields to nobody for Chinese subtitles or when the switch is off (A4)', () => {
        expect(
            resolvePluginTranslateYield('zh-CN', {
                enabled: true,
                readFrogPresent: true,
                cometixPresent: true
            })
        ).toBeNull();
        expect(
            resolvePluginTranslateYield('en', {
                enabled: false,
                readFrogPresent: false,
                cometixPresent: true
            })
        ).toBeNull();
    });
});

interface YieldHarness {
    takenOver: boolean;
    present: boolean;
    ensureCalls: () => number;
    fallbacks: () => string[];
    activate: (key: string) => void;
    reset: () => void;
}

function harness(): YieldHarness {
    const result: YieldHarness = {
        takenOver: false,
        present: true,
        ensureCalls: () => 0,
        fallbacks: () => [],
        activate: () => {},
        reset: () => {}
    };

    const fallbacks: string[] = [];
    let ensureCalls = 0;

    const controller = createCometixTranslateYieldController({
        present: () => result.present,
        hasTakenOver: () => result.takenOver,
        ensureNativeCaptions: async () => {
            ensureCalls += 1;
        },
        onFallback: (key) => {
            fallbacks.push(key);
        },
        waitIntervalMs: 500,
        waitTimeoutMs: 2_000
    });

    result.ensureCalls = () => ensureCalls;
    result.fallbacks = () => [...fallbacks];
    result.activate = controller.activate;
    result.reset = controller.reset;
    return result;
}

describe('createCometixTranslateYieldController', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('ensures native captions and succeeds once the caption window appears (A5)', async () => {
        const h = harness();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);
        expect(h.ensureCalls()).toBe(1);

        h.takenOver = true;
        await vi.advanceTimersByTimeAsync(500);
        expect(h.fallbacks()).toEqual([]);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(h.fallbacks()).toEqual([]);
    });

    it('deduplicates repeated activation for the same key (A5)', async () => {
        const h = harness();
        h.activate('video1|track1');
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);
        expect(h.ensureCalls()).toBe(1);
    });

    it('falls back exactly once when the caption window never appears (A6)', async () => {
        const h = harness();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);
        expect(h.fallbacks()).toEqual([]);

        await vi.advanceTimersByTimeAsync(2_000);
        expect(h.fallbacks()).toEqual(['video1|track1']);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(h.fallbacks()).toEqual(['video1|track1']);
    });

    it('allows the same key to yield again after reset clears the failure (A6)', async () => {
        const h = harness();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(2_000);
        expect(h.fallbacks()).toEqual(['video1|track1']);

        // 导航会 reset 控制器：去重记录清空后，同一 key 必须能重新让位，而不是永久跳过。
        h.reset();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);
        expect(h.ensureCalls()).toBe(2);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(h.fallbacks()).toEqual(['video1|track1', 'video1|track1']);
    });

    it('gives up without fallback when Cometix leaves during the wait', async () => {
        const h = harness();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);

        h.present = false;
        await vi.advanceTimersByTimeAsync(500);
        expect(h.fallbacks()).toEqual([]);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(h.fallbacks()).toEqual([]);
    });

    it('treats a takeover during the wait and a timeout as mutually exclusive (A7)', async () => {
        const h = harness();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(1_000);
        h.takenOver = true;
        await vi.advanceTimersByTimeAsync(1_000);
        expect(h.fallbacks()).toEqual([]);
    });

    it('cancels the in-flight wait when reset is called (A7)', async () => {
        const h = harness();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);
        h.reset();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(h.fallbacks()).toEqual([]);

        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);
        expect(h.ensureCalls()).toBe(2);
    });

    it('supersedes an in-flight wait when a new key arrives (A7)', async () => {
        const h = harness();
        h.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(0);
        h.activate('video2|track1');
        await vi.advanceTimersByTimeAsync(2_000);
        expect(h.fallbacks()).toEqual(['video2|track1']);
    });

    it('still waits when ensuring native captions rejects', async () => {
        const fallbacks: string[] = [];
        const controller = createCometixTranslateYieldController({
            present: () => true,
            hasTakenOver: () => false,
            ensureNativeCaptions: async () => {
                throw new Error('bridge unavailable');
            },
            onFallback: (key) => { fallbacks.push(key); },
            waitIntervalMs: 500,
            waitTimeoutMs: 1_000
        });

        controller.activate('video1|track1');
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fallbacks).toEqual(['video1|track1']);
    });
});
