import { isSiteHost } from '../../lib/siteProfiles';

export const BILIBILI_SUPPORTED_VIDEO_PATH_PREFIXES = [
    '/video/',
    '/bangumi/play/',
    '/medialist/play/',
    '/list/watchlater'
];

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

function decodeJsonString(value: string): string {
    try {
        return JSON.parse(`"${value}"`) as string;
    } catch {
        return value;
    }
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

function collectUploaderDataFromDom(): {
    profile: BilibiliUploaderProfile | null;
    targets: string[];
} {
    const seen = new Set<string>();
    let uid: string | null = null;
    let name: string | null = null;
    let profileUrl: string | null = null;

    for (const selector of UP_LINK_SELECTORS) {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(selector));
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
            const element = document.querySelector(selector);
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

    return {
        profile,
        targets: [...seen]
    };
}

function extractUploaderDataFromStateText(source: string): {
    profile: BilibiliUploaderProfile | null;
    targets: string[];
} {
    const targets = new Set<string>();

    const upDataMatch = source.match(
        /"upData"\s*:\s*\{[\s\S]*?"mid"\s*:\s*"?(?<mid>\d+)"?[\s\S]*?"name"\s*:\s*"(?<name>(?:\\.|[^"\\])*)"/
    );
    const ownerMatch = source.match(
        /"owner"\s*:\s*\{[\s\S]*?"mid"\s*:\s*"?(?<mid>\d+)"?[\s\S]*?"name"\s*:\s*"(?<name>(?:\\.|[^"\\])*)"/
    );

    addNormalizedBilibiliTarget(targets, upDataMatch?.groups?.mid ?? null);
    addNormalizedBilibiliTarget(targets, decodeJsonString(upDataMatch?.groups?.name ?? ''));
    addNormalizedBilibiliTarget(targets, ownerMatch?.groups?.mid ?? null);
    addNormalizedBilibiliTarget(targets, decodeJsonString(ownerMatch?.groups?.name ?? ''));

    const uid = upDataMatch?.groups?.mid ?? ownerMatch?.groups?.mid ?? null;
    const nameRaw = upDataMatch?.groups?.name ?? ownerMatch?.groups?.name ?? '';
    const name = nameRaw ? decodeJsonString(nameRaw) : null;

    return {
        profile: uid || name
            ? {
                uid,
                name,
                profileUrl: uid ? `https://space.bilibili.com/${uid}` : null
            }
            : null,
        targets: [...targets]
    };
}

function collectUploaderDataFromInitialState(): {
    profile: BilibiliUploaderProfile | null;
    targets: string[];
} | null {
    const scripts = Array.from(document.scripts);
    for (const script of scripts) {
        const source = script.textContent ?? '';
        if (!source.includes('__INITIAL_STATE__')) continue;

        const data = extractUploaderDataFromStateText(source);
        if (data.targets.length > 0 || data.profile) return data;
    }

    return null;
}

export function collectCurrentBilibiliUploaderSnapshot(): {
    profile: BilibiliUploaderProfile | null;
    targets: string[];
} {
    const fromDom = collectUploaderDataFromDom();
    const needsStateFallback = !fromDom.profile?.uid || !fromDom.profile?.name;
    const fromState = needsStateFallback ? collectUploaderDataFromInitialState() : null;

    const mergedTargets = new Set<string>([
        ...fromDom.targets,
        ...(fromState?.targets ?? [])
    ]);

    const resolvedUid = fromDom.profile?.uid ?? fromState?.profile?.uid ?? null;
    const resolvedName = fromDom.profile?.name ?? fromState?.profile?.name ?? null;
    const resolvedProfileUrl = fromDom.profile?.profileUrl
        ?? fromState?.profile?.profileUrl
        ?? (resolvedUid ? `https://space.bilibili.com/${resolvedUid}` : null);
    const resolvedProfile = resolvedUid || resolvedName || resolvedProfileUrl
        ? {
            uid: resolvedUid,
            name: resolvedName,
            profileUrl: resolvedProfileUrl
        }
        : null;

    addNormalizedBilibiliTarget(mergedTargets, resolvedUid);
    addNormalizedBilibiliTarget(mergedTargets, resolvedName);

    return {
        profile: resolvedProfile,
        targets: [...mergedTargets]
    };
}
