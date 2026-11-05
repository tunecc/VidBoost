// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.bilibili.com/video/BV1d2pF6nESA/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BilibiliAutoSubtitle,
    findPreferredSubtitleButtonFromButtons,
    isActiveSubtitleItem,
    isChineseSubtitleButton,
    matchBilibiliUploaderTargets
} from '../../features/BilibiliAutoSubtitle';

const PLAYER_HTML = `
    <div id="bilibili-player"></div>
    <div class="bpx-player-ctrl-subtitle-language-item" data-lan="en-US">English</div>
    <div class="bpx-player-ctrl-subtitle-language-item" data-lan="zh-CN">中文（简体）</div>
    <div class="bpx-player-ctrl-subtitle-language-item" data-lan="ai-zh">中文（自动生成）</div>
`;

const UP_HTML = `
    <div class="up-detail-top">
        <a class="up-name" href="//space.bilibili.com/596842980/?spm_id_from=333.788.upinfo.detail.click">南翔</a>
    </div>
`;

function subtitleItems(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.bpx-player-ctrl-subtitle-language-item'));
}

function aiItem(): HTMLElement {
    const item = subtitleItems().find((button) => button.dataset.lan === 'ai-zh');
    if (!item) throw new Error('ai-zh subtitle item missing');
    return item;
}

function mountFeature(targets: string[] = ['596842980']): BilibiliAutoSubtitle {
    const feature = new BilibiliAutoSubtitle();
    feature.updateSettings({
        bb_subtitle: { enabled: true, targetMode: 'allowlist', targets }
    });
    feature.mount();
    return feature;
}

let feature: BilibiliAutoSubtitle | null = null;

beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = PLAYER_HTML;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});

afterEach(() => {
    feature?.unmount();
    feature = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('subtitle helpers', () => {
    it('detects Chinese subtitle items by language code and text', () => {
        document.body.innerHTML = PLAYER_HTML;
        const [english, simplified, automatic] = subtitleItems();

        expect(isChineseSubtitleButton(english)).toBe(false);
        expect(isChineseSubtitleButton(simplified)).toBe(true);
        expect(isChineseSubtitleButton(automatic)).toBe(true);
    });

    it('prefers AI Chinese, then zh-Hans/zh-CN, then any Chinese marker', () => {
        document.body.innerHTML = `
            <div class="bpx-player-ctrl-subtitle-language-item" data-lan="en-US">English</div>
            <div class="bpx-player-ctrl-subtitle-language-item" data-lan="zh-CN">中文（简体）</div>
            <div class="bpx-player-ctrl-subtitle-language-item" data-lan="ai-zh">中文（自动生成）</div>
        `;

        expect(findPreferredSubtitleButtonFromButtons(subtitleItems())?.dataset.lan).toBe('ai-zh');

        document.body.innerHTML = `
            <div class="bpx-player-ctrl-subtitle-language-item" data-lan="en-US">English</div>
            <div class="bpx-player-ctrl-subtitle-language-item" data-lan="zh-CN">中文（简体）</div>
        `;
        expect(findPreferredSubtitleButtonFromButtons(subtitleItems())?.dataset.lan).toBe('zh-CN');
    });

    it('detects the active subtitle state', () => {
        document.body.innerHTML = PLAYER_HTML;
        const item = aiItem();

        expect(isActiveSubtitleItem(item)).toBe(false);
        item.classList.add('bpx-state-active');
        expect(isActiveSubtitleItem(item)).toBe(true);
    });

    it('matches normalized uploader targets', () => {
        expect(matchBilibiliUploaderTargets(['596842980 | 南翔'], ['596842980', '南翔'])).toBe(true);
        expect(matchBilibiliUploaderTargets(['https://space.bilibili.com/596842980/'], ['596842980'])).toBe(true);
        expect(matchBilibiliUploaderTargets(['596842980'], ['383819124'])).toBe(false);
        expect(matchBilibiliUploaderTargets([], ['596842980'])).toBe(false);
    });
});

describe('BilibiliAutoSubtitle allowlist flow', () => {
    it('clicks the preferred Chinese subtitle for a whitelisted uploader', async () => {
        document.body.innerHTML = `${PLAYER_HTML}${UP_HTML}`;
        const item = aiItem();
        item.addEventListener('click', () => item.classList.add('bpx-state-active'));

        feature = mountFeature();
        await vi.advanceTimersByTimeAsync(1600);

        expect(item.classList.contains('bpx-state-active')).toBe(true);
    });

    it('keeps retrying when the uploader is not rendered yet instead of giving up', async () => {
        const item = aiItem();
        item.addEventListener('click', () => item.classList.add('bpx-state-active'));

        feature = mountFeature();
        // First attempt runs at 1200ms and finds no uploader DOM.
        await vi.advanceTimersByTimeAsync(3000);
        expect(item.classList.contains('bpx-state-active')).toBe(false);

        document.body.insertAdjacentHTML('beforeend', UP_HTML);
        await vi.advanceTimersByTimeAsync(3000);

        expect(item.classList.contains('bpx-state-active')).toBe(true);
    });

    it('does not activate subtitles for an uploader outside the allowlist', async () => {
        document.body.innerHTML = `${PLAYER_HTML}${UP_HTML}`;
        const item = aiItem();
        item.addEventListener('click', () => item.classList.add('bpx-state-active'));

        feature = mountFeature(['383819124']);
        await vi.advanceTimersByTimeAsync(3000);

        expect(item.classList.contains('bpx-state-active')).toBe(false);
    });

    it('retries when the click does not activate Chinese subtitles', async () => {
        document.body.innerHTML = `${PLAYER_HTML}${UP_HTML}`;
        const item = aiItem();
        const clicks: number[] = [];
        item.addEventListener('click', () => {
            clicks.push(Date.now());
        });

        feature = mountFeature();
        await vi.advanceTimersByTimeAsync(4000);

        expect(clicks.length).toBeGreaterThanOrEqual(2);
    });

    it('re-evaluates the allowlist after an in-page (SPA) navigation', async () => {
        document.body.innerHTML = `${PLAYER_HTML}${UP_HTML}`;
        const firstItem = aiItem();
        firstItem.addEventListener('click', () => firstItem.classList.add('bpx-state-active'));

        feature = mountFeature(['383819124']);
        await vi.advanceTimersByTimeAsync(3000);
        expect(firstItem.classList.contains('bpx-state-active')).toBe(false);

        history.pushState({}, '', '/video/BV1GmhQzcEhc/?spm_id_from=333.788');
        document.body.innerHTML = `
            ${PLAYER_HTML}
            <div class="up-detail-top">
                <a class="up-name" href="//space.bilibili.com/383819124/">波特可乐z</a>
            </div>
        `;
        const nextItem = aiItem();
        nextItem.addEventListener('click', () => nextItem.classList.add('bpx-state-active'));

        await vi.advanceTimersByTimeAsync(4000);
        expect(nextItem.classList.contains('bpx-state-active')).toBe(true);
    });

    it('never clicks when Chinese subtitles are already active', async () => {
        document.body.innerHTML = `${PLAYER_HTML}${UP_HTML}`;
        const item = aiItem();
        item.classList.add('bpx-state-active');
        const onClick = vi.fn();
        item.addEventListener('click', onClick);

        feature = mountFeature();
        await vi.advanceTimersByTimeAsync(3000);

        expect(onClick).not.toHaveBeenCalled();
    });
});
