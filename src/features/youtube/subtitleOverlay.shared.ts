export type YouTubeSubtitleOverlayPageConfig = {
    enabled: boolean;
};

export type YouTubeSubtitleCaptionTrack = {
    baseUrl: string;
    languageCode: string;
    kind?: string;
    vssId: string;
    name?: YouTubeTextValue;
    trackName?: string;
    isTranslatable?: boolean;
};

export type YouTubeTextValue = {
    simpleText?: string;
    runs?: Array<{ text: string }>;
};

export type YouTubeSubtitleTranslationLanguage = {
    languageCode: string;
    languageName: YouTubeTextValue;
};

export type YouTubeSubtitleAudioCaptionTrack = {
    url: string;
    vssId: string;
    kind?: string;
    languageCode?: string;
};

export type YouTubeSubtitleSelectedTrack = {
    languageCode: string | null;
    vssId: string | null;
    kind: string | null;
};

export type YouTubeSubtitlePlayerData = {
    videoId: string;
    channelKey: string | null;
    captionTracks: YouTubeSubtitleCaptionTrack[];
    translationLanguages: YouTubeSubtitleTranslationLanguage[];
    audioCaptionTracks: YouTubeSubtitleAudioCaptionTrack[];
    device: string | null;
    cver: string | null;
    playerState: number;
    selectedTrack: YouTubeSubtitleSelectedTrack;
    cachedTimedtextUrl: string | null;
};

export type YouTubeTimedTextSeg = {
    utf8: string;
    tOffsetMs?: number;
};

export type YouTubeTimedText = {
    tStartMs: number;
    dDurationMs?: number;
    aAppend?: number;
    segs?: YouTubeTimedTextSeg[];
    wpWinPosId?: number;
    wWinId?: number;
};

export type YouTubeSubtitlePlayerDataResponse = {
    source: typeof YT_SUBTITLE_OVERLAY_PAGE_SOURCE;
    channel: typeof YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL;
    type: typeof YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE;
    requestId: string;
    success: boolean;
    error?: string;
    data?: YouTubeSubtitlePlayerData;
};

export type YouTubeSubtitleEnsureEnabledResponse = {
    source: typeof YT_SUBTITLE_OVERLAY_PAGE_SOURCE;
    channel: typeof YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL;
    type: typeof YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE;
    requestId: string;
    success: boolean;
    enabled: boolean;
};

export type YouTubeSubtitleSetEnabledResponse = {
    source: typeof YT_SUBTITLE_OVERLAY_PAGE_SOURCE;
    channel: typeof YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL;
    type: typeof YT_SUBTITLE_OVERLAY_SET_SUBTITLES_RESPONSE;
    requestId: string;
    success: boolean;
    enabled: boolean;
};

export const YT_SUBTITLE_OVERLAY_PAGE_SCRIPT_PATH = 'assets/yt-subtitle-overlay.page.js';
export const YT_SUBTITLE_OVERLAY_INJECTED_SCRIPT_ID = 'vb-yt-subtitle-overlay';
export const YT_SUBTITLE_OVERLAY_BRIDGE_CHANNEL = 'vb:yt-subtitle-overlay';
export const YT_SUBTITLE_OVERLAY_PAGE_SOURCE = 'vb:yt-subtitle-overlay:page';
export const YT_SUBTITLE_OVERLAY_CONTENT_SOURCE = 'vb:yt-subtitle-overlay:content';

export const YT_SUBTITLE_OVERLAY_PLAYER_DATA_REQUEST = 'player-data-request';
export const YT_SUBTITLE_OVERLAY_PLAYER_DATA_RESPONSE = 'player-data-response';
export const YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_REQUEST = 'ensure-subtitles-request';
export const YT_SUBTITLE_OVERLAY_ENSURE_SUBTITLES_RESPONSE = 'ensure-subtitles-response';
export const YT_SUBTITLE_OVERLAY_SET_SUBTITLES_REQUEST = 'set-subtitles-request';
export const YT_SUBTITLE_OVERLAY_SET_SUBTITLES_RESPONSE = 'set-subtitles-response';

export const DEFAULT_YT_SUBTITLE_OVERLAY_PAGE_CONFIG: YouTubeSubtitleOverlayPageConfig = {
    enabled: false
};

/**
 * 检测 Immersive Translate 是否在页面中活跃。
 * 检测 IT 字幕渲染容器 `.imt-caption-container`，该容器在 IT 渲染字幕时出现。
 * 注意：IT 的全局 API 在隔离世界，content script 检测不到；`imt-state` 属性
 * 在 YouTube 上不出现。因此以 IT 字幕容器作为主要信号。
 */
export function isImmersiveTranslateActive(): boolean {
    if (typeof document !== 'undefined') {
        const container = document.querySelector('.imt-caption-container');
        if (container) return true;
    }
    return false;
}

/**
 * 判断语言代码是否为中文。
 * 匹配 zh / zh-Hans / zh-Hant / zh-CN 等所有以 zh 开头的语言代码。
 */
export function isChineseLanguageCode(languageCode: string): boolean {
    return languageCode.startsWith('zh');
}

export type PluginTranslateYield = 'read-frog' | 'immersive-translate';

/**
 * 「插件翻译兼容」单一开关的统一让位决策：
 * - 开关关闭或中文字幕 → null（VidBoost 正常自渲染）；
 * - Read Frog 在场 → 'read-frog'（让位并自动开启其翻译）；
 * - Read Frog 不在场 → 'immersive-translate'（回落 IT 无条件让位）。
 */
export function resolvePluginTranslateYield(
    trackLanguageCode: string,
    options: { enabled: boolean; readFrogPresent: boolean }
): PluginTranslateYield | null {
    if (!options.enabled) return null;
    if (isChineseLanguageCode(trackLanguageCode)) return null;
    return options.readFrogPresent ? 'read-frog' : 'immersive-translate';
}

/** Read Frog 启用视频字幕后挂载在播放器控件栏的翻译按钮容器（open shadow root）。 */
export const READ_FROG_TRANSLATE_BUTTON_CONTAINER_ID = 'read-frog-subtitles-translate-button-container';

/** Read Frog 翻译按钮类名，其内部含硬编码 ON / OFF 徽标文本。 */
export const READ_FROG_TRANSLATE_BUTTON_CLASS = 'read-frog-subtitles-translate-button';

/** Read Frog 默认字幕切换快捷键 Alt+C（其 toggleShortcut 配置的默认值）。 */
export const READ_FROG_TOGGLE_SHORTCUT = { altKey: true, code: 'KeyC', key: 'c' } as const;

/**
 * 查找 Read Frog 翻译按钮容器；未安装 / 未启用其视频字幕功能时返回 null。
 */
export function findReadFrogTranslateButtonContainer(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    return document.getElementById(READ_FROG_TRANSLATE_BUTTON_CONTAINER_ID);
}

/**
 * 读取 Read Frog 字幕翻译开关状态。
 * 徽标为按钮内硬编码的 "ON" / "OFF" 文本（非 i18n）；容器或徽标不可读时返回 null。
 */
export function readReadFrogToggleState(
    container: HTMLElement | null = findReadFrogTranslateButtonContainer()
): 'on' | 'off' | null {
    if (!container) return null;
    const root = container.shadowRoot;
    if (!root) return null;
    const button = root.querySelector(`.${READ_FROG_TRANSLATE_BUTTON_CLASS}`);
    if (!(button instanceof HTMLElement)) return null;
    const badge = Array.from(button.children).find(
        (child) =>
            child instanceof HTMLElement
            && (child.textContent?.trim() === 'ON' || child.textContent?.trim() === 'OFF')
    );
    if (!(badge instanceof HTMLElement)) return null;
    return badge.textContent?.trim() === 'ON' ? 'on' : 'off';
}

/**
 * 向 document 派发 Read Frog 默认切换快捷键（Alt+C）的合成事件。
 * Read Frog 的热键库监听 document 且不校验 isTrusted，合成事件可触发其切换。
 * keydown / keyup 必须成对派发。
 */
export function dispatchReadFrogToggleShortcut(): void {
    if (typeof document === 'undefined') return;
    for (const type of ['keydown', 'keyup'] as const) {
        document.dispatchEvent(
            new KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                altKey: READ_FROG_TOGGLE_SHORTCUT.altKey,
                code: READ_FROG_TOGGLE_SHORTCUT.code,
                key: READ_FROG_TOGGLE_SHORTCUT.key
            })
        );
    }
}

export type ReadFrogActivationDeps = {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    findButtonContainer?: () => HTMLElement | null;
    readToggleState?: (container: HTMLElement | null) => 'on' | 'off' | null;
    dispatchToggleShortcut?: () => void;
    /** 等待容器 / 徽标可读的轮询间隔与总时长上限。 */
    waitIntervalMs?: number;
    waitTimeoutMs?: number;
    /** 派发后等待徽标翻 ON 的轮询间隔与单次尝试的时长上限。 */
    verifyIntervalMs?: number;
    verifyTimeoutMs?: number;
    /** 包含等待的重试派发的最大尝试次数。 */
    maxDispatchAttempts?: number;
};

const DEFAULT_READ_FROG_ACTIVATION_DEPS: Required<Pick<ReadFrogActivationDeps,
    'waitIntervalMs' | 'waitTimeoutMs' | 'verifyIntervalMs' | 'verifyTimeoutMs' | 'maxDispatchAttempts'
>> = {
    waitIntervalMs: 500,
    waitTimeoutMs: 10_000,
    verifyIntervalMs: 400,
    verifyTimeoutMs: 3_000,
    maxDispatchAttempts: 3
};

/**
 * Read Frog 翻译自动开启的受控触发器。
 *
 * - 按 key（videoId + optionKey）去重：同一 key 只触发一次，1.2s 轮询不重复派发，
 *   用户手动关闭后同一 key 内不自动重开；
 * - 徽标已 ON 时不派发（不得把已开启的翻译切回 OFF）；
 * - 等待容器 / 徽标可读与验证翻 ON 均有界，超时安全放弃（不抛错）；
 * - 新 key 到来或 reset() 时，旧的在途流程通过世代号退出。
 */
export function createReadFrogActivationController(deps: ReadFrogActivationDeps = {}) {
    const now = deps.now ?? (() => Date.now());
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
    const findButtonContainer = deps.findButtonContainer ?? findReadFrogTranslateButtonContainer;
    const readToggleState = deps.readToggleState ?? readReadFrogToggleState;
    const dispatchToggleShortcut = deps.dispatchToggleShortcut ?? dispatchReadFrogToggleShortcut;
    const {
        waitIntervalMs,
        waitTimeoutMs,
        verifyIntervalMs,
        verifyTimeoutMs,
        maxDispatchAttempts
    } = { ...DEFAULT_READ_FROG_ACTIVATION_DEPS, ...deps };

    const triggeredKeys = new Set<string>();
    let generation = 0;

    async function run(key: string, runGeneration: number): Promise<void> {
        const superseded = () => runGeneration !== generation;

        const waitDeadline = now() + waitTimeoutMs;
        let state = readToggleState(findButtonContainer());
        while (state === null && now() < waitDeadline) {
            await sleep(waitIntervalMs);
            if (superseded()) return;
            state = readToggleState(findButtonContainer());
        }
        if (superseded() || state === null) return;

        for (let attempt = 0; attempt < maxDispatchAttempts; attempt++) {
            if (state === 'on') return;
            if (state === null) return;
            dispatchToggleShortcut();

            const verifyDeadline = now() + verifyTimeoutMs;
            while (now() < verifyDeadline) {
                await sleep(verifyIntervalMs);
                if (superseded()) return;
                state = readToggleState(findButtonContainer());
                if (state === 'on') return;
            }
            state = readToggleState(findButtonContainer());
        }
    }

    return {
        /** 对给定 key 启动自动开启流程；同 key 重复调用为 no-op。 */
        activate(key: string): void {
            if (!key || triggeredKeys.has(key)) return;
            triggeredKeys.add(key);
            generation += 1;
            void run(key, generation);
        },
        /** 取消在途流程并清空去重记录（卸载 / 导航时调用）。 */
        reset(): void {
            generation += 1;
            triggeredKeys.clear();
        }
    };
}

export function cloneYouTubeSubtitleOverlayPageConfig(
    config: YouTubeSubtitleOverlayPageConfig
): YouTubeSubtitleOverlayPageConfig {
    return {
        enabled: config.enabled
    };
}
