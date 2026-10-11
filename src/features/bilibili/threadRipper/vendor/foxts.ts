// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (node_modules/foxts/dist/*/index.mjs).
//
// Inlined subset of `foxts@5.9.1` (MIT, Copyright (c) SukkaW), aligned with the upstream dist
// sources module by module: clamp (foxts/clamp), noop + falseFn (foxts/noop), wait (foxts/wait),
// never (foxts/guard), FIFO (foxts/fifo), pickOne (foxts/pick-random + foxts/random-int),
// addArrayElementsToSet (foxts/add-array-elements-to-set + foxts/identity), isAbortErrorLike
// (foxts/abort-error + foxts/extract-error-message), createRetrieKeywordFilter (foxts/retrie),
// split0th (foxts/split-nth).

/* ---------------------------------- foxts/clamp ---------------------------------- */

/**
 * `clamp(value, min, max)` clamps `value` into `[min, max]`;
 * `clamp(min, max)` returns a clamping function for the range.
 *
 * (Overloads added to mirror the upstream `foxts/clamp` declaration: the single union signature
 * made every three-argument call in `engine.ts` a type error.)
 */
export function clamp(value: number, min: number, max: number): number;
export function clamp(min: number, max: number): (value: number) => number;
export function clamp(a: number, b: number, c?: number): number | ((value: number) => number) {
    // 2-arg curried form: (a, b) are (min, max)
    if (c === undefined) {
        return (value: number) => (value < a ? a : value > b ? b : value);
    }
    // 3-arg form: (a, b, c) are (value, min, max)
    return a < b ? b : a > c ? c : a;
}

/* ---------------------------------- foxts/noop ----------------------------------- */

export const noop = () => {};
export const falseFn = () => false;

/* ---------------------------------- foxts/wait ----------------------------------- */

export function wait(ms: number, timerUnref = false): Promise<void> {
    return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        if (timerUnref && typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') {
            timer.unref();
        }
    });
}

/* --------------------------------- foxts/guard ----------------------------------- */

/** Unreachable-value guard: always throws a `TypeError` */
export function never(value: never, valueMetaName = 'value'): never {
    throw TypeError(`Unexpected ${valueMetaName}: ${value} as ${JSON.stringify(typeof value)}, should be "never"`);
}

/* ---------------------------------- foxts/fifo ----------------------------------- */

type FifoNode<T> = [value: T, next: FifoNode<T> | null];

/** Singly linked-list FIFO queue */
export class FIFO<T> {
    private head: FifoNode<T> | null = null;
    private tail: FifoNode<T> | null = null;
    $size = 0;

    constructor() {
        this.clear();
    }

    enqueue(value: T): void {
        const node: FifoNode<T> = [value, null];
        if (this.head) {
            this.tail![1] = node;
        } else {
            this.head = node;
        }
        this.tail = node;
        this.$size++;
    }

    push: (value: T) => void = this.enqueue;

    dequeue(): T | undefined {
        const node = this.head;
        if (node) {
            this.head = node[1];
            this.$size--;
            return node[0];
        }
        return undefined;
    }

    shift: () => T | undefined = this.dequeue;

    peek(): T | undefined {
        return this.head?.[0];
    }

    clear(): void {
        this.head = null;
        this.tail = null;
        this.$size = 0;
    }

    get size(): number {
        return this.$size;
    }

    get length(): number {
        return this.$size;
    }

    *[Symbol.iterator](): Generator<T, void, unknown> {
        let node = this.head;
        while (node) {
            yield node[0];
            node = node[1];
        }
    }
}

/* ------------------------- foxts/pick-random + random-int ------------------------ */

export function pickOne<T>(data: T[] | readonly T[]): T {
    if (data.length === 1) return data[0];
    return data[Math.floor(Math.random() * data.length)];
}

/* ------------------- foxts/add-array-elements-to-set + identity ------------------ */

function identity<T>(item: T): T {
    return item;
}

export function addArrayElementsToSet<T>(set: Set<T>, arr: T[], transformer: (item: T) => T = identity): Set<T> {
    arr.forEach((item) => set.add(transformer(item)));
    return set;
}

/* --------------- foxts/abort-error + foxts/extract-error-message ----------------- */

interface ErrorLikeObject {
    name: string;
    message: string;
    stack?: string;
}

function isErrorLikeObject(obj: unknown): obj is ErrorLikeObject {
    return typeof obj === 'object'
        && !!obj
        && 'name' in obj && typeof obj.name === 'string'
        && 'message' in obj && typeof obj.message === 'string'
        && (!('stack' in obj) || typeof obj.stack === 'string');
}

export interface AbortErrorLike extends Omit<ErrorLikeObject, 'name'> {
    name: 'AbortError';
    code?: 'ABORT_ERR';
}

export function isAbortErrorLike(error: unknown): error is AbortErrorLike {
    return !!isErrorLikeObject(error)
        && (error.name === 'AbortError' || ('code' in error && typeof error.code === 'string' && error.code === 'ABORT_ERR'));
}

/* ---------------------------------- foxts/retrie --------------------------------- */

const REGEX_ESCAPE_CHARS = new Set(['.', '?', '*', '+', '^', '$', '|', '(', ')', '{', '}', '[', ']', '\\']);

interface TrieNode {
    [key: string]: TrieNode | '' | undefined;
}

/** Compiles a trie of keywords into a regular expression source, alternation of shared prefixes factored out */
function buildRegexFromTrie(node: TrieNode): string {
    let lastChildPattern: string | undefined;
    let hasEmpty = false;
    const subtrees: string[] = [];
    const words: string[] = [];
    for (const key in node) {
        if (!key) {
            hasEmpty = true;
            continue;
        }
        lastChildPattern = buildRegexFromTrie(node[key] as TrieNode);
        (lastChildPattern ? subtrees : words).push(
            (key === '-' ? '\\x2d' : REGEX_ESCAPE_CHARS.has(key) ? `\\${key}` : key) + lastChildPattern
        );
    }
    if (hasEmpty && lastChildPattern == null) return '';
    const noSubtrees = subtrees.length === 0;
    if (words.length > 0) {
        subtrees.push(words.length > 1 ? `[${words.join('')}]` : words[0]);
    }
    let pattern = subtrees.length > 1 ? `(?:${subtrees.join('|')})` : subtrees[0];
    if (hasEmpty) {
        pattern = noSubtrees ? `${pattern}?` : `(?:${pattern})?`;
    }
    return pattern || '';
}

function retrieToRegex(keywords: ArrayLike<string>, asPrefixes: boolean): RegExp {
    const tree: TrieNode = {};
    const add = (keyword: string, asPrefix: boolean) => {
        let node: TrieNode = tree;
        for (let i = 0, len = keyword.length; i < len; ++i) {
            const char = keyword.charAt(i);
            if (!(char in node)) {
                node[char] = asPrefix ? { '': '' } : {};
            }
            node = node[char] as TrieNode;
        }
        node[''] = '';
    };
    for (let i = 0, len = keywords.length; i < len; ++i) {
        add(keywords[i], asPrefixes);
    }
    return new RegExp((asPrefixes ? '^' : '') + buildRegexFromTrie(tree));
}

/** Keyword substring filter compiled once into a regex; an empty keyword list matches nothing */
export function createRetrieKeywordFilter(keywords: ArrayLike<string>, asPrefixes = false): (str: string) => boolean {
    if (keywords.length === 0) return falseFn;
    const regex = retrieToRegex(keywords, asPrefixes);
    return regex.test.bind(regex);
}

/* --------------------------------- foxts/split-nth -------------------------------- */

/** Everything before the first occurrence of `sep`, or the whole string: `str.split(sep)[0]` without the array */
export function split0th(str: string, sep: string): string {
    const index = str.indexOf(sep);
    return index === -1 ? str : str.slice(0, index);
}
