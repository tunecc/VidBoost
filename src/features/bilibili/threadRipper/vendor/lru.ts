// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (node_modules/flru/dist/flru.mjs).
//
// Inlined `flru@1.0.2` (MIT, Copyright (c) Luke Edwards): a two-generation LRU-ish cache. Insertion
// beyond `max` rotates the current generation into the previous one; `get` promotes a
// previous-generation hit back into the current generation, `has` looks at both.

export interface flruCache<T = any> {
    clear(isPartial: boolean): void;
    has(key: string): boolean;
    get(key: string): undefined | T;
    set(key: string, value: T): void;
}

export default function flru<T = any>(max: number): flruCache<T> {
    let num: number;
    let curr: Record<string, T>;
    let prev: Record<string, T>;
    const limit = max || 1;

    function keep(key: string, value: T) {
        if (++num > limit) {
            prev = curr;
            reset(true);
            ++num;
        }
        curr[key] = value;
    }

    function reset(isPartial: boolean) {
        num = 0;
        curr = Object.create(null);
        if (!isPartial) prev = Object.create(null);
    }

    reset(false);

    return {
        clear: reset,
        has(key: string): boolean {
            return curr[key] !== undefined || prev[key] !== undefined;
        },
        get(key: string): undefined | T {
            let val = curr[key];
            if (val !== undefined) return val;
            val = prev[key];
            if (val !== undefined) {
                keep(key, val);
                return val;
            }
            return undefined;
        },
        set(key: string, value: T): void {
            if (curr[key] !== undefined) {
                curr[key] = value;
            } else {
                keep(key, value);
            }
        }
    };
}
