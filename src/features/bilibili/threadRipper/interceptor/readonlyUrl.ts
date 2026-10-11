// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (src/utils/readonly-url.ts).

/** `URLSearchParams` without its mutators */
export type ReadonlyURLSearchParams = Omit<URLSearchParams, 'append' | 'delete' | 'set' | 'sort'>;

/**
 * A `URL` that can't be changed through: every property readonly, `searchParams` included. Any
 * `URL` is one, so functions that only read a URL take this
 */
export type ReadonlyURL = Readonly<Omit<URL, 'searchParams'>> & {
    readonly searchParams: ReadonlyURLSearchParams
};
