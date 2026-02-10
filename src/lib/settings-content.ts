import {
    DEFAULT_SETTINGS,
    type Settings,
    type SettingsKey
} from './settings';

export { DEFAULT_SETTINGS };
export type {
    Settings,
    SettingsKey,
    H5Config,
    YTConfig,
    AutoPauseSites
} from './settings';

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
