import {
    runtimeSendMessage,
    storageLocalGet,
    storageLocalSet
} from '../lib/webext';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

export function runFirefoxLoopbackSelfDiagnostics(
    publishAttr: (name: string, value: string) => void
) {
    const globalApi = globalThis as typeof globalThis & {
        browser?: {
            runtime?: { sendMessage?: (message: unknown) => Promise<unknown> };
            storage?: {
                local?: {
                    get?: (keys?: unknown) => Promise<Record<string, unknown>>;
                    set?: (items: Record<string, unknown>) => Promise<void>;
                };
            };
        };
        chrome?: {
            runtime?: {
                lastError?: { message?: string };
                sendMessage?: (
                    message: unknown,
                    callback?: (response?: unknown) => void
                ) => void;
            };
            storage?: {
                local?: {
                    get?: (
                        keys: unknown,
                        callback: (items: Record<string, unknown>) => void
                    ) => void;
                    set?: (
                        items: Record<string, unknown>,
                        callback: () => void
                    ) => void;
                };
            };
        };
    };

    const browserStorage = globalApi.browser?.storage?.local;
    const chromeStorage = globalApi.chrome?.storage?.local;
    const browserRuntime = globalApi.browser?.runtime;
    const chromeRuntime = globalApi.chrome?.runtime;
    const apiMode = browserStorage || typeof browserRuntime?.sendMessage === 'function'
        ? 'browser'
        : chromeStorage || typeof chromeRuntime?.sendMessage === 'function'
            ? 'chrome'
            : 'none';

    const withTimeout = <T>(
        promise: Promise<T>,
        timeoutMs: number,
        onTimeout: () => void
    ) => new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            onTimeout();
            reject(new Error('timeout'));
        }, timeoutMs);
        promise.then((value) => {
            window.clearTimeout(timer);
            resolve(value);
        }).catch((error) => {
            window.clearTimeout(timer);
            reject(error);
        });
    });

    const rawStorageProbe = async (storageKey: string, token: string) => {
        if (browserStorage?.set && browserStorage?.get) {
            await browserStorage.set({ [storageKey]: token });
            return await browserStorage.get(storageKey);
        }

        if (chromeStorage?.set && chromeStorage?.get) {
            return await new Promise<Record<string, unknown>>((resolve, reject) => {
                chromeStorage.set?.({ [storageKey]: token }, () => {
                    const setError = chromeRuntime?.lastError?.message;
                    if (setError) {
                        reject(new Error(setError));
                        return;
                    }

                    chromeStorage.get?.(storageKey, (result) => {
                        const getError = chromeRuntime?.lastError?.message;
                        if (getError) {
                            reject(new Error(getError));
                            return;
                        }
                        resolve(result);
                    });
                });
            });
        }

        throw new Error('storage-unavailable');
    };

    const rawRuntimeProbe = async () => {
        if (browserRuntime?.sendMessage) {
            return await browserRuntime.sendMessage({ type: 'VB_TEST_CLEAR_YT_CDN_OVERRIDE' });
        }

        if (chromeRuntime?.sendMessage) {
            return await new Promise<unknown>((resolve, reject) => {
                chromeRuntime.sendMessage?.({ type: 'VB_TEST_CLEAR_YT_CDN_OVERRIDE' }, (response) => {
                    const errorMessage = chromeRuntime?.lastError?.message;
                    if (errorMessage) {
                        reject(new Error(errorMessage));
                        return;
                    }
                    resolve(response);
                });
            });
        }

        throw new Error('runtime-unavailable');
    };

    publishAttr('vbApiMode', apiMode);
    publishAttr('vbStorageProbe', 'pending');
    publishAttr('vbRuntimeProbe', 'pending');
    publishAttr('vbStorageRawProbe', 'pending');
    publishAttr('vbRuntimeRawProbe', 'pending');

    const storageKey = 'vb_loopback_storage_probe';
    const token = String(Date.now());

    void withTimeout(
        storageLocalSet({ [storageKey]: token }).then(async () => {
            const result = await storageLocalGet<Record<string, unknown>>(storageKey);
            publishAttr(
                'vbStorageProbe',
                result[storageKey] === token ? 'ok' : 'mismatch'
            );
        }),
        1500,
        () => publishAttr('vbStorageProbe', 'timeout')
    ).catch(() => {
        publishAttr('vbStorageProbe', 'error');
    });

    void withTimeout(
        runtimeSendMessage({ type: 'VB_TEST_CLEAR_YT_CDN_OVERRIDE' }).then((response) => {
            publishAttr(
                'vbRuntimeProbe',
                isRecord(response) && response.ok === true ? 'ok' : 'empty'
            );
        }),
        1500,
        () => publishAttr('vbRuntimeProbe', 'timeout')
    ).catch(() => {
        publishAttr('vbRuntimeProbe', 'error');
    });

    void withTimeout(
        rawStorageProbe(storageKey, `${token}:raw`).then((result) => {
            publishAttr(
                'vbStorageRawProbe',
                result[storageKey] === `${token}:raw` ? 'ok' : 'mismatch'
            );
        }),
        1500,
        () => publishAttr('vbStorageRawProbe', 'timeout')
    ).catch(() => {
        publishAttr('vbStorageRawProbe', 'error');
    });

    void withTimeout(
        rawRuntimeProbe().then((response) => {
            publishAttr(
                'vbRuntimeRawProbe',
                isRecord(response) && response.ok === true ? 'ok' : 'empty'
            );
        }),
        1500,
        () => publishAttr('vbRuntimeRawProbe', 'timeout')
    ).catch(() => {
        publishAttr('vbRuntimeRawProbe', 'error');
    });
}
