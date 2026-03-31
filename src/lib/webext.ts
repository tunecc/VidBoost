type StorageChangeLike = {
    oldValue?: unknown;
    newValue?: unknown;
};

type MessageSenderLike = {
    tab?: {
        id?: number;
    };
};

export type RuntimeMessageListener = (
    message: unknown,
    sender: MessageSenderLike,
    sendResponse: (response?: unknown) => void
) => boolean | void;

type OnMessageEventLike = {
    addListener(listener: RuntimeMessageListener): void;
    removeListener(listener: RuntimeMessageListener): void;
};

type VoidEventListener<T extends (...args: never[]) => void> = {
    addListener(listener: T): void;
    removeListener(listener: T): void;
};

type StorageAreaLike = {
    get(keys?: unknown): Promise<Record<string, unknown>> | void;
    get(keys: unknown, callback: (items: Record<string, unknown>) => void): void;
    set(items: Record<string, unknown>): Promise<void> | void;
    set(items: Record<string, unknown>, callback: () => void): void;
    remove(keys: string | string[]): Promise<void> | void;
    remove(keys: string | string[], callback: () => void): void;
};

type SessionStorageAreaLike = StorageAreaLike & {
    setAccessLevel?(options: { accessLevel: string }): Promise<void> | void;
    setAccessLevel?(options: { accessLevel: string }, callback: () => void): void;
};

type ExtensionApiLike = {
    runtime?: {
        lastError?: { message?: string };
        sendMessage?(message: unknown): Promise<unknown> | void;
        sendMessage?(message: unknown, callback: (response?: unknown) => void): void;
        getURL?(path: string): string;
        getManifest?(): { version?: string };
        onMessage?: OnMessageEventLike;
        onInstalled?: VoidEventListener<() => void>;
    };
    tabs?: {
        query?(queryInfo: Record<string, unknown>): Promise<Array<{ id?: number }>> | void;
        query?(
            queryInfo: Record<string, unknown>,
            callback: (tabs: Array<{ id?: number }>) => void
        ): void;
        sendMessage?(tabId: number, message: unknown): Promise<unknown> | void;
        sendMessage?(
            tabId: number,
            message: unknown,
            callback: (response?: unknown) => void
        ): void;
        onRemoved?: VoidEventListener<(tabId: number) => void>;
    };
    storage?: {
        local?: StorageAreaLike;
        session?: SessionStorageAreaLike;
        onChanged?: VoidEventListener<(
            changes: Record<string, StorageChangeLike>,
            areaName?: string
        ) => void>;
    };
};

function browserApi(): ExtensionApiLike | null {
    const api = (globalThis as typeof globalThis & { browser?: ExtensionApiLike }).browser;
    return api ?? null;
}

function chromeApi(): ExtensionApiLike | null {
    const api = (globalThis as typeof globalThis & { chrome?: ExtensionApiLike }).chrome;
    return api ?? null;
}

function runtimeLastErrorMessage() {
    return chromeApi()?.runtime?.lastError?.message || '';
}

function isPromiseLike<T>(value: unknown): value is Promise<T> {
    return Boolean(value) && typeof (value as { then?: unknown }).then === 'function';
}

function callbackToPromise<T>(
    executor: (callback: (value: T) => void) => Promise<T | undefined> | void | unknown,
    fallbackValue: T
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false;

        const rejectOnce = (error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        const resolveOnce = (value: T | undefined) => {
            if (settled) return;
            settled = true;
            resolve(value ?? fallbackValue);
        };

        try {
            const maybePromise = executor((value) => {
                const errorMessage = runtimeLastErrorMessage();
                if (errorMessage) {
                    rejectOnce(new Error(errorMessage));
                    return;
                }
                resolveOnce(value);
            });

            if (isPromiseLike<T | undefined>(maybePromise)) {
                void maybePromise.then((value) => {
                    resolveOnce(value);
                }).catch((error) => {
                    rejectOnce(error);
                });
            }
        } catch (error) {
            rejectOnce(error);
        }
    });
}

function callbackToVoidPromise(
    executor: (callback: () => void) => Promise<void> | void | unknown
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let settled = false;

        const rejectOnce = (error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
        };

        const resolveOnce = () => {
            if (settled) return;
            settled = true;
            resolve();
        };

        try {
            const maybePromise = executor(() => {
                const errorMessage = runtimeLastErrorMessage();
                if (errorMessage) {
                    rejectOnce(new Error(errorMessage));
                    return;
                }
                resolveOnce();
            });

            if (isPromiseLike<void>(maybePromise)) {
                void maybePromise.then(() => {
                    resolveOnce();
                }).catch((error) => {
                    rejectOnce(error);
                });
            }
        } catch (error) {
            rejectOnce(error);
        }
    });
}

export function hasStorageApi(kind: 'local' | 'session' = 'local') {
    const storage = browserApi()?.storage?.[kind] ?? chromeApi()?.storage?.[kind];
    return Boolean(storage);
}

export function getManifestVersion(fallback = '0.0.0') {
    return browserApi()?.runtime?.getManifest?.().version
        ?? chromeApi()?.runtime?.getManifest?.().version
        ?? fallback;
}

export function getRuntimeUrl(path: string): string | null {
    const getURL = browserApi()?.runtime?.getURL ?? chromeApi()?.runtime?.getURL;
    return typeof getURL === 'function' ? getURL(path) : null;
}

export function isFirefoxExtensionRuntime() {
    const runtimeUrl = getRuntimeUrl('');
    return typeof runtimeUrl === 'string' && runtimeUrl.startsWith('moz-extension://');
}

export function addRuntimeMessageListener(listener: RuntimeMessageListener) {
    const onMessage = browserApi()?.runtime?.onMessage ?? chromeApi()?.runtime?.onMessage;
    if (!onMessage) return;
    onMessage.addListener(listener);
}

export function removeRuntimeMessageListener(listener: RuntimeMessageListener) {
    const onMessage = browserApi()?.runtime?.onMessage ?? chromeApi()?.runtime?.onMessage;
    if (!onMessage) return;
    onMessage.removeListener(listener);
}

export function addRuntimeInstalledListener(listener: () => void) {
    const onInstalled = browserApi()?.runtime?.onInstalled ?? chromeApi()?.runtime?.onInstalled;
    if (!onInstalled) return;
    onInstalled.addListener(listener);
}

export function addTabRemovedListener(listener: (tabId: number) => void) {
    const onRemoved = browserApi()?.tabs?.onRemoved ?? chromeApi()?.tabs?.onRemoved;
    if (!onRemoved) return;
    onRemoved.addListener(listener);
}

export async function runtimeSendMessage<T = unknown>(message: unknown): Promise<T | undefined> {
    const browserRuntime = browserApi()?.runtime;
    const browserSendMessage = browserRuntime?.sendMessage;
    if (typeof browserSendMessage === 'function') {
        const sendMessage = browserSendMessage as (payload: unknown) => Promise<unknown>;
        return await sendMessage.call(browserRuntime, message) as T | undefined;
    }

    const chromeRuntime = chromeApi()?.runtime;
    const chromeSendMessage = chromeRuntime?.sendMessage;
    if (typeof chromeSendMessage !== 'function') return undefined;
    return await callbackToPromise<unknown>(
        (callback) => chromeSendMessage.call(chromeRuntime, message, callback),
        undefined
    ) as T | undefined;
}

export async function tabsQuery(
    queryInfo: Record<string, unknown>
): Promise<Array<{ id?: number }>> {
    const browserTabs = browserApi()?.tabs;
    const browserQuery = browserTabs?.query;
    if (typeof browserQuery === 'function') {
        const query = browserQuery as (
            payload: Record<string, unknown>
        ) => Promise<Array<{ id?: number }>>;
        return await query.call(browserTabs, queryInfo) ?? [];
    }

    const chromeTabs = chromeApi()?.tabs;
    const chromeQuery = chromeTabs?.query;
    if (typeof chromeQuery !== 'function') return [];
    return await callbackToPromise<Array<{ id?: number }>>(
        (callback) => chromeQuery.call(chromeTabs, queryInfo, callback),
        []
    );
}

export async function tabsSendMessage<T = unknown>(
    tabId: number,
    message: unknown
): Promise<T | undefined> {
    const browserTabs = browserApi()?.tabs;
    const browserSendMessage = browserTabs?.sendMessage;
    if (typeof browserSendMessage === 'function') {
        const sendMessage = browserSendMessage as (
            targetTabId: number,
            payload: unknown
        ) => Promise<unknown>;
        return await sendMessage.call(browserTabs, tabId, message) as T | undefined;
    }

    const chromeTabs = chromeApi()?.tabs;
    const chromeSendMessage = chromeTabs?.sendMessage;
    if (typeof chromeSendMessage !== 'function') return undefined;
    return await callbackToPromise<unknown>(
        (callback) => chromeSendMessage.call(chromeTabs, tabId, message, callback),
        undefined
    ) as T | undefined;
}

export async function storageLocalGet<T extends Record<string, unknown>>(
    keys: string[] | string
): Promise<T> {
    const browserArea = browserApi()?.storage?.local;
    if (browserArea) {
        return await browserArea.get(keys) as T;
    }

    const chromeArea = chromeApi()?.storage?.local;
    if (!chromeArea) return {} as T;
    return await callbackToPromise<Record<string, unknown>>(
        (callback) => chromeArea.get(keys, callback),
        {}
    ) as T;
}

export async function storageLocalSet(values: Record<string, unknown>) {
    const browserArea = browserApi()?.storage?.local;
    if (browserArea) {
        await browserArea.set(values);
        return;
    }

    const chromeArea = chromeApi()?.storage?.local;
    if (!chromeArea) return;
    await callbackToVoidPromise((callback) => chromeArea.set(values, callback));
}

export async function storageLocalRemove(keys: string[]) {
    const browserArea = browserApi()?.storage?.local;
    if (browserArea) {
        await browserArea.remove(keys);
        return;
    }

    const chromeArea = chromeApi()?.storage?.local;
    if (!chromeArea) return;
    await callbackToVoidPromise((callback) => chromeArea.remove(keys, callback));
}

export async function storageSessionGet<T extends Record<string, unknown>>(
    keys: string[] | string
): Promise<T> {
    const browserArea = browserApi()?.storage?.session;
    if (browserArea) {
        try {
            return await browserArea.get(keys) as T;
        } catch {
            // Firefox content scripts can briefly race with setAccessLevel during startup.
            // Fall back to local storage so coordination features keep working.
        }
    }

    const chromeArea = chromeApi()?.storage?.session;
    if (chromeArea) {
        try {
            return await callbackToPromise<Record<string, unknown>>(
                (callback) => chromeArea.get(keys, callback),
                {}
            ) as T;
        } catch {
            // Fall through to local storage fallback.
        }
    }

    return await storageLocalGet<T>(keys);
}

export async function storageSessionSet(values: Record<string, unknown>) {
    const browserArea = browserApi()?.storage?.session;
    if (browserArea) {
        try {
            await browserArea.set(values);
            return;
        } catch {
            // Fall through to local storage fallback.
        }
    }

    const chromeArea = chromeApi()?.storage?.session;
    if (chromeArea) {
        try {
            await callbackToVoidPromise((callback) => chromeArea.set(values, callback));
            return;
        } catch {
            // Fall through to local storage fallback.
        }
    }

    await storageLocalSet(values);
}

export async function storageSessionRemove(keys: string | string[]) {
    const browserArea = browserApi()?.storage?.session;
    if (browserArea) {
        try {
            await browserArea.remove(keys);
            return;
        } catch {
            // Fall through to local storage fallback.
        }
    }

    const chromeArea = chromeApi()?.storage?.session;
    if (chromeArea) {
        try {
            await callbackToVoidPromise((callback) => chromeArea.remove(keys, callback));
            return;
        } catch {
            // Fall through to local storage fallback.
        }
    }

    await storageLocalRemove(typeof keys === 'string' ? [keys] : keys);
}

export async function storageSessionSetAccessLevel(accessLevel: string) {
    const browserArea = browserApi()?.storage?.session;
    const browserSetAccessLevel = browserArea?.setAccessLevel;
    if (typeof browserSetAccessLevel === 'function') {
        await browserSetAccessLevel({ accessLevel });
        return;
    }

    const chromeArea = chromeApi()?.storage?.session;
    const chromeSetAccessLevel = chromeArea?.setAccessLevel;
    if (typeof chromeSetAccessLevel !== 'function') return;
    await callbackToVoidPromise((callback) => chromeSetAccessLevel({ accessLevel }, callback));
}

export function addStorageChangedListener(
    listener: (changes: Record<string, StorageChangeLike>, areaName?: string) => void
) {
    const onChanged = browserApi()?.storage?.onChanged ?? chromeApi()?.storage?.onChanged;
    if (!onChanged) return;
    onChanged.addListener(listener);
}

export function removeStorageChangedListener(
    listener: (changes: Record<string, StorageChangeLike>, areaName?: string) => void
) {
    const onChanged = browserApi()?.storage?.onChanged ?? chromeApi()?.storage?.onChanged;
    if (!onChanged) return;
    onChanged.removeListener(listener);
}
