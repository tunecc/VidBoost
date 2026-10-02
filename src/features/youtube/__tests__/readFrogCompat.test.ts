import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    READ_FROG_TRANSLATE_BUTTON_CLASS,
    READ_FROG_TRANSLATE_BUTTON_CONTAINER_ID,
    createReadFrogActivationController,
    dispatchReadFrogToggleShortcut,
    findReadFrogTranslateButtonContainer,
    readReadFrogToggleState
} from '../subtitleOverlay.shared';

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
