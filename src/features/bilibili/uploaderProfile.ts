import { isSiteHost } from '../../lib/siteProfiles';

export const BILIBILI_SUPPORTED_VIDEO_PATH_PREFIXES = [
    '/video/',
    '/bangumi/play/',
    '/medialist/play/',
    '/list/watchlater'
];

export const BILIBILI_UPLOADER_DOM_WAIT_INTERVAL_MS = 150;
export const BILIBILI_UPLOADER_DOM_WAIT_TIMEOUT_MS = 1000;
export const BILIBILI_UPLOADER_DOM_WAIT_TIMEOUT_NO_BVID_MS = 400;
export const BILIBILI_UPLOADER_LOOKUP_BUDGET_MS = 2000;
export const BILIBILI_UPLOADER_API_TIMEOUT_MS = 1200;

const UP_LINK_SELECTORS = [
    '#v_upinfo a[href*="space.bilibili.com/"]',
    '.up-info-container a[href*="space.bilibili.com/"]',
    '.up-detail-top a[href*="space.bilibili.com/"]',
    '.video-owner a[href*="space.bilibili.com/"]',
    'a.up-name[href*="space.bilibili.com/"]'
];

const UP_NAME_SELECTORS = [
    '#v_upinfo .up-name',
    '#v_upinfo [class*="up-name"]',
    '.up-info-container .up-name',
    '.up-info-container [class*="username"]',
    '.up-detail-top .up-name',
    '.video-owner .up-name',
    '.video-owner [class*="username"]',
    'a.up-name'
];

export type BilibiliUploaderProfile = {
    uid: string | null;
    name: string | null;
    profileUrl: string | null;
};

export type BilibiliUploaderLookupReason = 'unsupported-page' | 'not-ready';

export type BilibiliUploaderSnapshot = {
    profile: BilibiliUploaderProfile | null;
    targets: string[];
};

export type BilibiliUploaderLookupResult = BilibiliUploaderSnapshot & {
    reason?: BilibiliUploaderLookupReason;
};

export type BilibiliUploaderResolveOptions = {
    doc?: Document;
    href?: string;
    waitTimeoutMs?: number;
    waitIntervalMs?: number;
    allowApiFallback?: boolean;
    fetchImpl?: typeof fetch;
    apiTimeoutMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
};

export function stripBilibiliTargetNote(value: string): string {
    return value.split(/[|｜]/, 1)[0]?.trim() ?? value.trim();
}

export function sanitizeBilibiliUploaderName(value: string | null | undefined): string | null {
    if (!value) return null;

    const normalized = value
        .replace(/\s+/g, ' ')
        .replace(/的个人空间$/u, '')
        .replace(/\s*UP主$/u, '')
        .trim();

    return normalized || null;
}

export function extractBilibiliUploaderMid(value: string): string | null {
    const trimmed = stripBilibiliTargetNote(value);
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return trimmed;

    const match = trimmed.match(/space\.bilibili\.com\/(\d+)/i);
    return match?.[1] ?? null;
}

export function normalizeBilibiliTargetValue(value: string): string | null {
    const trimmed = stripBilibiliTargetNote(value);
    if (!trimmed) return null;

    const mid = extractBilibiliUploaderMid(trimmed);
    if (mid) return mid;

    const normalized = trimmed
        .replace(/^@/, '')
        .replace(/^https?:\/\/(space\.)?bilibili\.com\//i, '')
        .replace(/^space\.bilibili\.com\//i, '')
        .replace(/\/+$/, '')
        .toLowerCase();

    return normalized || null;
}

export function addNormalizedBilibiliTarget(targets: Set<string>, value: string | null) {
    if (!value) return;
    const normalized = normalizeBilibiliTargetValue(value);
    if (normalized) targets.add(normalized);
}

export function isSupportedBilibiliVideoPage(): boolean {
    if (!isSiteHost('bilibili')) return false;
    return BILIBILI_SUPPORTED_VIDEO_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
}

/** Pure URL check so callers (and tests) do not depend on the live `location`. */
export function isSupportedBilibiliVideoUrl(input: string): boolean {
    if (!input) return false;

    let parsed: URL;
    try {
        parsed = new URL(input, 'https://www.bilibili.com');
    } catch {
        return false;
    }

    if (!isSiteHost('bilibili', parsed.hostname)) return false;
    return BILIBILI_SUPPORTED_VIDEO_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
}

/** Extracts the BV id from a video URL, e.g. `https://www.bilibili.com/video/BV1d2pF6nESA/?spm=...`. */
export function extractBilibiliBvid(input: string): string | null {
    if (!input) return null;
    const match = input.match(/\/video\/(BV[0-9A-Za-z]{10})(?:[/?#]|$)/);
    return match?.[1] ?? null;
}

function readUploaderNameFromElement(element: Element | null): string | null {
    if (!element) return null;

    const candidates = [
        element.textContent,
        element.getAttribute('title'),
        element.getAttribute('aria-label'),
        element.getAttribute('data-name'),
        element.getAttribute('data-uname')
    ];

    if (element instanceof HTMLAnchorElement) {
        candidates.push(element.title);
    }

    const image = element.querySelector('img[alt], img[title]');
    if (image instanceof HTMLImageElement) {
        candidates.push(image.alt, image.title);
    }

    for (const candidate of candidates) {
        const sanitized = sanitizeBilibiliUploaderName(candidate);
        if (sanitized) return sanitized;
    }

    return null;
}

/**
 * Reads the current video's uploader from the DOM only.
 * All selectors are scoped to the video detail area, so recommendation cards
 * and comment authors never leak into the result.
 */
export function collectBilibiliUploaderSnapshotFromDocument(doc: Document = document): BilibiliUploaderSnapshot {
    const seen = new Set<string>();
    let uid: string | null = null;
    let name: string | null = null;
    let profileUrl: string | null = null;

    for (const selector of UP_LINK_SELECTORS) {
        const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>(selector));
        for (const link of links) {
            addNormalizedBilibiliTarget(seen, link.href);
            const candidateName = readUploaderNameFromElement(link);
            addNormalizedBilibiliTarget(seen, candidateName);

            uid = uid ?? extractBilibiliUploaderMid(link.href);
            name = name ?? candidateName;
            profileUrl = profileUrl ?? (link.href || null);
        }
    }

    if (!name) {
        for (const selector of UP_NAME_SELECTORS) {
            const element = doc.querySelector(selector);
            const candidateName = readUploaderNameFromElement(element);
            if (!candidateName) continue;
            name = candidateName;
            addNormalizedBilibiliTarget(seen, candidateName);
            break;
        }
    }

    const profile = uid || name || profileUrl
        ? {
            uid,
            name,
            profileUrl: profileUrl || (uid ? `https://space.bilibili.com/${uid}` : null)
        }
        : null;

    addNormalizedBilibiliTarget(seen, uid);
    addNormalizedBilibiliTarget(seen, name);

    return {
        profile,
        targets: [...seen]
    };
}

/**
 * DOM-only snapshot used by the quality feature. Kept synchronous and free of
 * network access so existing callers behave exactly as before.
 */
export function collectCurrentBilibiliUploaderSnapshot(): BilibiliUploaderSnapshot {
    return collectBilibiliUploaderSnapshotFromDocument(document);
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export async function waitForBilibiliUploaderSnapshot(
    options: BilibiliUploaderResolveOptions = {}
): Promise<BilibiliUploaderSnapshot> {
    const doc = options.doc ?? document;
    const now = options.now ?? (() => Date.now());
    const sleep = options.sleep ?? defaultSleep;
    const timeoutMs = options.waitTimeoutMs ?? BILIBILI_UPLOADER_DOM_WAIT_TIMEOUT_MS;
    const intervalMs = options.waitIntervalMs ?? BILIBILI_UPLOADER_DOM_WAIT_INTERVAL_MS;
    const deadline = now() + timeoutMs;

    let latest = collectBilibiliUploaderSnapshotFromDocument(doc);
    while (now() < deadline) {
        if (latest.profile?.uid && latest.profile?.name) return latest;
        await sleep(intervalMs);
        const next = collectBilibiliUploaderSnapshotFromDocument(doc);
        if (next.profile || next.targets.length > 0) latest = next;
        if (latest.profile?.uid && latest.profile?.name) return latest;
    }

    return latest;
}

export async function fetchBilibiliUploaderByBvid(
    bvid: string,
    options: BilibiliUploaderResolveOptions = {}
): Promise<BilibiliUploaderProfile | null> {
    if (!bvid) return null;

    const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) return null;

    const timeoutMs = options.apiTimeoutMs ?? BILIBILI_UPLOADER_API_TIMEOUT_MS;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (controller) {
        timer = setTimeout(() => {
            try {
                controller.abort();
            } catch {
                // ignore
            }
        }, timeoutMs);
    }

    try {
        const response = await fetchImpl(
            `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
            {
                credentials: 'include',
                ...(controller ? { signal: controller.signal } : {})
            }
        );
        if (!response?.ok) return null;

        const payload = await response.json() as {
            code?: number;
            data?: { owner?: { mid?: number | string | null; name?: string | null } | null } | null;
        };
        if (payload?.code !== 0) return null;

        const owner = payload.data?.owner ?? null;
        const uid = owner?.mid != null ? String(owner.mid) : null;
        const name = sanitizeBilibiliUploaderName(owner?.name ?? null);
        if (!uid && !name) return null;

        return {
            uid,
            name,
            profileUrl: uid ? `https://space.bilibili.com/${uid}` : null
        };
    } catch {
        return null;
    } finally {
        if (timer != null) clearTimeout(timer);
    }
}

/**
 * Resolves the current video uploader: DOM (with a bounded wait) first,
 * then the public view API as a fallback for `/video/BV...` pages.
 */
export async function resolveBilibiliUploaderSnapshot(
    options: BilibiliUploaderResolveOptions = {}
): Promise<BilibiliUploaderLookupResult> {
    const doc = options.doc ?? document;
    const href = options.href ?? (typeof location !== 'undefined' ? location.href : '');
    const now = options.now ?? (() => Date.now());
    const startedAt = now();

    if (!isSupportedBilibiliVideoUrl(href)) {
        return { profile: null, targets: [], reason: 'unsupported-page' };
    }

    const bvid = extractBilibiliBvid(href);
    const waitTimeoutMs = options.waitTimeoutMs
        ?? (bvid
            ? BILIBILI_UPLOADER_DOM_WAIT_TIMEOUT_MS
            : BILIBILI_UPLOADER_DOM_WAIT_TIMEOUT_NO_BVID_MS);

    const fromDom = await waitForBilibiliUploaderSnapshot({ ...options, doc, waitTimeoutMs });
    if (fromDom.profile?.uid) return fromDom;

    if (options.allowApiFallback === false || !bvid) {
        return fromDom.profile ? fromDom : { ...fromDom, reason: 'not-ready' };
    }

    // Keep the whole lookup within a single response budget so the popup
    // message channel never stays open longer than expected.
    const remainingMs = Math.max(
        250,
        BILIBILI_UPLOADER_LOOKUP_BUDGET_MS - (now() - startedAt)
    );
    const apiTimeoutMs = Math.min(
        options.apiTimeoutMs ?? BILIBILI_UPLOADER_API_TIMEOUT_MS,
        remainingMs
    );
    const fromApi = await fetchBilibiliUploaderByBvid(bvid, { ...options, apiTimeoutMs });
    if (!fromApi) {
        return fromDom.profile ? fromDom : { ...fromDom, reason: 'not-ready' };
    }

    const mergedTargets = new Set<string>(fromDom.targets);
    addNormalizedBilibiliTarget(mergedTargets, fromApi.uid);
    addNormalizedBilibiliTarget(mergedTargets, fromApi.name);

    return {
        profile: {
            uid: fromDom.profile?.uid ?? fromApi.uid,
            name: fromDom.profile?.name ?? fromApi.name,
            profileUrl: fromDom.profile?.profileUrl ?? fromApi.profileUrl
        },
        targets: [...mergedTargets]
    };
}
