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

export type AutoPauseSites = {
    'youtube.com'?: boolean;
    'bilibili.com'?: boolean;
    [key: string]: boolean | undefined;
};

export type Settings = {
    enabled: boolean;
    h5_enabled: boolean;
    ap_enabled: boolean;
    bnd_enabled: boolean;
    yt_fast_pause: boolean;
    fast_pause_master: boolean;
    language: 'auto' | 'en' | 'zh';
    yt_config: YTConfig;
    h5_config: H5Config;
    ui_state: UIState;
    ap_scope: 'all' | 'selected';
    ap_sites: AutoPauseSites;
    ap_custom_sites: string[];
};

export type SettingsKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
    enabled: true,
    h5_enabled: true,
    ap_enabled: true,
    bnd_enabled: true,
    yt_fast_pause: true,
    fast_pause_master: true,
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
    ap_custom_sites: []
};

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
