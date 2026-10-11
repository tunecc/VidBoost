// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (src/utils/fake-native-function.ts).
//
// Adaptation: `unsafeWindow.Function.prototype.toString` (the page's `Function.prototype.toString`
// through the GM sandbox) becomes the MAIN-world `window.Function.prototype.toString`.

/* eslint-disable @typescript-eslint/no-unsafe-function-type -- any function */
/* eslint-disable @typescript-eslint/unbound-method -- only called with Reflect.apply */

export function createFakeNativeFunction<T extends Function>(cb: T): T {
    const fnName = cb.name || '';

    const toStringFn = () => `function ${fnName}() { [native code] }`;

    Object.defineProperties(cb, {
        toString: {
            value: toStringFn,
            writable: true,
            configurable: false,
            enumerable: false
        },
        toLocaleString: {
            value: toStringFn,
            writable: true,
            configurable: false,
            enumerable: false
        }
    });

    return cb;
}

const nativeFunctionToString = window.Function.prototype.toString;

/**
 * Just enough for polyfills and feature detection: `patched.toString()` (and `String(patched)`)
 * returns `native`'s source in the browser's own format, e.g. `function fetch() { [native code] }`,
 * and `patched.name` is `native.name`. `Function.prototype.toString` itself is left alone.
 */
export function disguiseAsNative(patched: Function, native: Function) {
    const source: string = Reflect.apply(nativeFunctionToString, native, []);

    Object.defineProperties(patched, {
        name: { value: native.name, configurable: true },
        toString: {
            // A page subclass inherits a class's static members: it keeps its own source
            value(this: unknown) {
                return this === patched ? source : Reflect.apply(nativeFunctionToString, this, []);
            },
            writable: true,
            configurable: true,
            enumerable: false
        }
    });
}
