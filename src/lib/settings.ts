export type H5Config = {
    speedStep?: number;
    maxSpeed?: number;
    restoreSpeed?: number;
    seekForward?: number;
    seekRewind?: number;
    blockNumKeys?: boolean;
};

export type YTConfig = {
    blockNativeSeek?: boolean;
};

export type UIState = {
    general?: boolean;
    youtube?: boolean;
    bilibili?: boolean;
};

export type BilibiliCdnConfig = {
    enabled: boolean;
    node: string;
    bangumiMode: boolean;
};

export type AutoPauseSites = {
    'youtube.com'?: boolean;
    'bilibili.com'?: boolean;
    [key: string]: boolean | undefined;
};

export type YTMemberBlockMode = 'all' | 'blocklist' | 'allowlist';

export type Settings = {
    enabled: boolean;
    h5_enabled: boolean;
    ap_enabled: boolean;
    ap_allow_background: boolean;
    bnd_enabled: boolean;
    yt_fast_pause: boolean;
    fast_pause_master: boolean;
    bb_block_space: boolean;
    bb_cdn: BilibiliCdnConfig;
    language: 'auto' | 'en' | 'zh';
    yt_config: YTConfig;
    h5_config: H5Config;
    ui_state: UIState;
    ap_scope: 'all' | 'selected';
    ap_sites: AutoPauseSites;
    ap_custom_sites: string[];
    yt_member_block: boolean;
    yt_member_block_mode: YTMemberBlockMode;
    yt_member_blocklist: string[];
    yt_member_allowlist: string[];
};

export type SettingsKey = keyof Settings;

export const CONTENT_SETTINGS_KEYS = [
    'enabled',
    'h5_enabled',
    'ap_enabled',
    'bnd_enabled',
    'yt_fast_pause',
    'fast_pause_master',
    'bb_block_space',
    'bb_cdn',
    'yt_config',
    'yt_member_block'
] as const satisfies SettingsKey[];

export const POPUP_SETTINGS_KEYS = [
    ...CONTENT_SETTINGS_KEYS,
    'language',
    'h5_config',
    'ui_state',
    'bb_cdn',
    'yt_member_block_mode',
    'yt_member_blocklist',
    'yt_member_allowlist'
] as const satisfies SettingsKey[];

export const YT_MEMBER_BLOCK_SETTINGS_KEYS = [
    'yt_member_block',
    'yt_member_block_mode',
    'yt_member_blocklist',
    'yt_member_allowlist'
] as const satisfies SettingsKey[];

export const DEFAULT_SETTINGS: Settings = {
    enabled: true,
    h5_enabled: true,
    ap_enabled: true,
    ap_allow_background: true,
    bnd_enabled: true,
    yt_fast_pause: true,
    fast_pause_master: true,
    bb_block_space: true,
    bb_cdn: { enabled: false, node: '', bangumiMode: false },
    language: 'auto',
    yt_config: { blockNativeSeek: true },
    h5_config: {
        speedStep: 0.1,
        maxSpeed: 16.0,
        restoreSpeed: 1.0,
        seekForward: 5,
        seekRewind: 3
    },
    ui_state: { general: true, youtube: true, bilibili: true },
    ap_scope: 'all',
    ap_sites: { 'youtube.com': true, 'bilibili.com': true },
    ap_custom_sites: [],
    yt_member_block: false,
    yt_member_block_mode: 'all',
    yt_member_blocklist: [],
    yt_member_allowlist: []
};

export function resolveSettings(source: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        ...source,
        yt_config: { ...DEFAULT_SETTINGS.yt_config, ...(source.yt_config ?? {}) },
        h5_config: { ...DEFAULT_SETTINGS.h5_config, ...(source.h5_config ?? {}) },
        ui_state: { ...DEFAULT_SETTINGS.ui_state, ...(source.ui_state ?? {}) },
        bb_cdn: { ...DEFAULT_SETTINGS.bb_cdn, ...(source.bb_cdn ?? {}) },
        ap_sites: { ...DEFAULT_SETTINGS.ap_sites, ...(source.ap_sites ?? {}) },
        ap_custom_sites: Array.isArray(source.ap_custom_sites)
            ? [...source.ap_custom_sites]
            : [...DEFAULT_SETTINGS.ap_custom_sites],
        yt_member_blocklist: Array.isArray(source.yt_member_blocklist)
            ? [...source.yt_member_blocklist]
            : [...DEFAULT_SETTINGS.yt_member_blocklist],
        yt_member_allowlist: Array.isArray(source.yt_member_allowlist)
            ? [...source.yt_member_allowlist]
            : [...DEFAULT_SETTINGS.yt_member_allowlist]
    };
}

export function getSettings<K extends SettingsKey>(keys: K[]): Promise<Pick<Settings, K>> {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (res) => {
            const out = {} as Pick<Settings, K>;
            keys.forEach((k) => {
                const value = res[k] as Settings[K] | undefined;
                out[k] = value !== undefined ? value : DEFAULT_SETTINGS[k];
            });
            resolve(out);
        });
    });
}

export function setSettings(values: Partial<Settings>) {
    chrome.storage.local.set(values);
}

export function onSettingsChanged(cb: (changes: Partial<Settings>) => void) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
        const out: Partial<Settings> = {};
        const outMap = out as Record<SettingsKey, Settings[SettingsKey] | undefined>;
        (Object.keys(changes) as SettingsKey[]).forEach((k) => {
            if (!(k in DEFAULT_SETTINGS)) return;
            outMap[k] = changes[k].newValue as Settings[typeof k];
        });
        if (Object.keys(out).length > 0) cb(out);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}

export function onStorageKeysChanged<T extends Record<string, unknown>>(
    keys: string[],
    cb: (changes: Partial<T>) => void
) {
    const keySet = new Set(keys);
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
        const out: Partial<T> = {};
        Object.keys(changes).forEach((k) => {
            if (!keySet.has(k)) return;
            out[k as keyof T] = changes[k].newValue as T[keyof T];
        });
        if (Object.keys(out).length > 0) cb(out);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
