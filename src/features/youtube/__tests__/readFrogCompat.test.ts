import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    READ_FROG_TRANSLATE_BUTTON_CLASS,
    READ_FROG_TRANSLATE_BUTTON_CONTAINER_ID,
    createReadFrogActivationController,
    dispatchReadFrogToggleShortcut,
    findReadFrogTranslateButtonContainer,
    readReadFrogToggleState,
    resolvePluginTranslateYield
} from '../subtitleOverlay.shared';
import { cloneYTSubtitleConfig, DEFAULT_SETTINGS } from '../../../lib/settings';

type MutableBadgeHost = HTMLElement & { setBadge(text: string): void };

function mountReadFrogButton(badgeText: string): MutableBadgeHost {
    const host = document.createElement('div') as MutableBadgeHost;
    host.id = READ_FROG_TRANSLATE_BUTTON_CONTAINER_ID;
    const root = host.attachShadow({ mode: 'open' });
    const button = document.createElement('button');
    button.className = READ_FROG_TRANSLATE_BUTTON_CLASS;
    const icon = document.createElement('img');
    const badge = document.createElement('div');
    badge.textContent = badgeText;
    button.append(icon, badge);
    root.append(button);
    host.setBadge = (text: string) => {
        badge.textContent = text;
    };
    document.body.append(host);
    return host;
}

function unmountReadFrogButton() {
    findReadFrogTranslateButtonContainer()?.remove();
}

afterEach(() => {
    unmountReadFrogButton();
    vi.restoreAllMocks();
});

describe('readReadFrogToggleState', () => {
    it('reads the ON badge inside the open shadow root', () => {
        mountReadFrogButton('ON');
        expect(readReadFrogToggleState()).toBe('on');
    });

    it('reads the OFF badge inside the open shadow root', () => {
        mountReadFrogButton('OFF');
        expect(readReadFrogToggleState()).toBe('off');
    });

    it('returns null when the container is absent', () => {
        expect(readReadFrogToggleState()).toBeNull();
    });

    it('returns null when the badge is not readable', () => {
        const host = document.createElement('div');
        host.id = READ_FROG_TRANSLATE_BUTTON_CONTAINER_ID;
        const root = host.attachShadow({ mode: 'open' });
        const button = document.createElement('button');
        button.className = READ_FROG_TRANSLATE_BUTTON_CLASS;
        root.append(button);
        document.body.append(host);
        expect(readReadFrogToggleState(host)).toBeNull();
    });
});

describe('dispatchReadFrogToggleShortcut', () => {
    it('dispatches a paired Alt+C keydown and keyup on document', () => {
        const events: KeyboardEvent[] = [];
        const handler = (event: Event) => {
            events.push(event as KeyboardEvent);
        };
        document.addEventListener('keydown', handler);
        document.addEventListener('keyup', handler);

        dispatchReadFrogToggleShortcut();

        document.removeEventListener('keydown', handler);
        document.removeEventListener('keyup', handler);

        expect(events).toHaveLength(2);
        expect(events[0]?.type).toBe('keydown');
        expect(events[1]?.type).toBe('keyup');
        for (const event of events) {
            expect(event.altKey).toBe(true);
            expect(event.code).toBe('KeyC');
            expect(event.key).toBe('c');
        }
    });
});

interface ControllerHarness {
    state: 'on' | 'off' | null;
    dispatchCount: () => number;
    advance: (ms: number) => Promise<void>;
    activate: (key: string) => void;
    reset: () => void;
}

function harness(initialState: 'on' | 'off' | null): ControllerHarness {
    const result: ControllerHarness = {
        state: initialState,
        dispatchCount: () => 0,
        advance: async () => {},
        activate: () => {},
        reset: () => {}
    };

    let clock = 0;
    const wakes: Array<() => void> = [];
    const dispatches: string[] = [];

    const controller = createReadFrogActivationController({
        now: () => clock,
        sleep: (ms) =>
            new Promise<void>((resolve) => {
                void ms;
                wakes.push(resolve);
            }),
        findButtonContainer: () => (result.state === null ? null : (document.body as HTMLElement)),
        readToggleState: (container) => (container ? result.state : null),
        dispatchToggleShortcut: () => {
            dispatches.push(`dispatch@${clock}`);
        },
        waitIntervalMs: 100,
        waitTimeoutMs: 1_000,
        verifyIntervalMs: 50,
        verifyTimeoutMs: 200,
        maxDispatchAttempts: 2
    });

    result.dispatchCount = () => dispatches.length;
    result.advance = async (ms: number) => {
        clock += ms;
        const pending = wakes.splice(0);
        for (const wake of pending) {
            wake();
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    };
    result.activate = controller.activate;
    result.reset = controller.reset;
    return result;
}

describe('createReadFrogActivationController', () => {
    it('does not dispatch when the badge already reads ON', async () => {
        const h = harness('on');
        h.activate('video1|track1');
        await h.advance(0);
        expect(h.dispatchCount()).toBe(0);
    });

    it('dispatches Alt+C once when OFF and stops once the badge flips ON', async () => {
        const h = harness('off');
        h.activate('video1|track1');
        await h.advance(0);
        expect(h.dispatchCount()).toBe(1);

        h.state = 'on';
        await h.advance(50);
        expect(h.dispatchCount()).toBe(1);
        await h.advance(500);
        expect(h.dispatchCount()).toBe(1);
    });

    it('deduplicates repeated activation for the same key', async () => {
        const h = harness('off');
        h.activate('video1|track1');
        h.activate('video1|track1');
        await h.advance(0);
        expect(h.dispatchCount()).toBe(1);

        h.state = 'on';
        await h.advance(50);
        expect(h.dispatchCount()).toBe(1);
    });

    it('retries bounded times when dispatch never flips the badge', async () => {
        const h = harness('off');
        h.activate('video1|track1');
        await h.advance(0);
        expect(h.dispatchCount()).toBe(1);
        await h.advance(200);
        expect(h.dispatchCount()).toBe(2);
        await h.advance(2_000);
        expect(h.dispatchCount()).toBe(2);
    });

    it('gives up safely when the badge never becomes readable', async () => {
        const h = harness(null);
        h.activate('video1|track1');
        await h.advance(500);
        expect(h.dispatchCount()).toBe(0);
        await h.advance(2_000);
        expect(h.dispatchCount()).toBe(0);
    });

    it('stops retrying once the badge becomes unreadable after a dispatch', async () => {
        const h = harness('off');
        h.activate('video1|track1');
        await h.advance(0);
        expect(h.dispatchCount()).toBe(1);

        h.state = null;
        await h.advance(200);
        expect(h.dispatchCount()).toBe(1);
        await h.advance(2_000);
        expect(h.dispatchCount()).toBe(1);
    });

    it('does not re-enable after the user manually turns Read Frog off (same key)', async () => {
        const h = harness('off');
        h.activate('video1|track1');
        await h.advance(0);
        h.state = 'on';
        await h.advance(50);
        expect(h.dispatchCount()).toBe(1);

        h.state = 'off';
        h.activate('video1|track1');
        await h.advance(1_000);
        expect(h.dispatchCount()).toBe(1);
    });

    it('triggers again for a new key after a manual off', async () => {
        const h = harness('off');
        h.activate('video1|track1');
        await h.advance(0);
        h.state = 'on';
        await h.advance(50);
        expect(h.dispatchCount()).toBe(1);

        h.state = 'off';
        h.activate('video2|track1');
        await h.advance(0);
        expect(h.dispatchCount()).toBe(2);
    });

    it('cancels the in-flight run when reset is called', async () => {
        const h = harness(null);
        h.activate('video1|track1');
        h.reset();
        h.state = 'off';
        await h.advance(2_000);
        expect(h.dispatchCount()).toBe(0);

        h.activate('video1|track1');
        await h.advance(0);
        expect(h.dispatchCount()).toBe(1);
    });

    it('supersedes an in-flight run when a new key arrives', async () => {
        const h = harness(null);
        h.activate('video1|track1');
        h.activate('video2|track1');
        h.state = 'off';
        await h.advance(2_000);
        expect(h.dispatchCount()).toBe(1);
    });
});

describe('resolvePluginTranslateYield（合并协调判定）', () => {
    it('returns null when the switch is off, even with Read Frog present', () => {
        expect(resolvePluginTranslateYield('en', { enabled: false, readFrogPresent: true })).toBeNull();
        expect(resolvePluginTranslateYield('en', { enabled: false, readFrogPresent: false })).toBeNull();
    });

    it('returns null for Chinese subtitles even when the switch is on', () => {
        expect(resolvePluginTranslateYield('zh', { enabled: true, readFrogPresent: true })).toBeNull();
        expect(resolvePluginTranslateYield('zh-Hans', { enabled: true, readFrogPresent: false })).toBeNull();
    });

    it('yields to Read Frog when present, regardless of Immersive Translate', () => {
        expect(resolvePluginTranslateYield('en', { enabled: true, readFrogPresent: true })).toBe('read-frog');
        expect(resolvePluginTranslateYield('ja', { enabled: true, readFrogPresent: true })).toBe('read-frog');
    });

    it('falls back to the unconditional Immersive Translate yield when Read Frog is absent', () => {
        expect(resolvePluginTranslateYield('en', { enabled: true, readFrogPresent: false })).toBe('immersive-translate');
        expect(resolvePluginTranslateYield('ja', { enabled: true, readFrogPresent: false })).toBe('immersive-translate');
    });

    it('decides from the live DOM presence helper as used by the overlay', () => {
        // 开关开 + 非中文 + 容器在场 → read-frog
        mountReadFrogButton('OFF');
        expect(
            resolvePluginTranslateYield('en', {
                enabled: true,
                readFrogPresent: findReadFrogTranslateButtonContainer() !== null
            })
        ).toBe('read-frog');
        unmountReadFrogButton();
        // 容器缺席 → 回落 IT
        expect(
            resolvePluginTranslateYield('en', {
                enabled: true,
                readFrogPresent: findReadFrogTranslateButtonContainer() !== null
            })
        ).toBe('immersive-translate');
    });
});

describe('cloneYTSubtitleConfig（旧设置迁移）', () => {
    it('defaults to false when no legacy or new field is stored', () => {
        expect(cloneYTSubtitleConfig({}).compatibleWithPluginTranslate).toBe(false);
        expect(cloneYTSubtitleConfig(null).compatibleWithPluginTranslate).toBe(false);
        expect(DEFAULT_SETTINGS.yt_subtitle.compatibleWithPluginTranslate).toBe(false);
    });

    it('migrates to true when either legacy switch was true', () => {
        expect(
            cloneYTSubtitleConfig({ compatibleWithImmersiveTranslate: true }).compatibleWithPluginTranslate
        ).toBe(true);
        expect(
            cloneYTSubtitleConfig({ compatibleWithReadFrog: true }).compatibleWithPluginTranslate
        ).toBe(true);
        expect(
            cloneYTSubtitleConfig({
                compatibleWithImmersiveTranslate: true,
                compatibleWithReadFrog: true
            }).compatibleWithPluginTranslate
        ).toBe(true);
    });

    it('migrates to false when both legacy switches are false', () => {
        expect(
            cloneYTSubtitleConfig({
                compatibleWithImmersiveTranslate: false,
                compatibleWithReadFrog: false
            }).compatibleWithPluginTranslate
        ).toBe(false);
    });

    it('adopts the stored new field directly and ignores legacy switches', () => {
        expect(
            cloneYTSubtitleConfig({
                compatibleWithPluginTranslate: true,
                compatibleWithImmersiveTranslate: false,
                compatibleWithReadFrog: false
            }).compatibleWithPluginTranslate
        ).toBe(true);
        expect(
            cloneYTSubtitleConfig({
                compatibleWithPluginTranslate: false,
                compatibleWithImmersiveTranslate: true,
                compatibleWithReadFrog: true
            }).compatibleWithPluginTranslate
        ).toBe(false);
    });

    it('drops legacy keys from the sanitized config', () => {
        const sanitized = cloneYTSubtitleConfig({
            compatibleWithImmersiveTranslate: true,
            compatibleWithReadFrog: true
        });
        expect('compatibleWithImmersiveTranslate' in sanitized).toBe(false);
        expect('compatibleWithReadFrog' in sanitized).toBe(false);
    });
});
