export type BilibiliQualityOption = {
    value: string;
    label: string;
    aliases: string[];
};

export const BILIBILI_QUALITY_ORDER = ['127', '126', '125', '120', '116', '112', '80', '74', '64', '32', '16'] as const;

export const BILIBILI_QUALITY_OPTIONS: BilibiliQualityOption[] = [
    { value: '127', label: '8K', aliases: ['8k'] },
    { value: '126', label: 'Dolby Vision', aliases: ['dolby vision', '杜比视界'] },
    { value: '125', label: 'HDR', aliases: ['hdr', '真彩 hdr'] },
    { value: '120', label: '4K', aliases: ['4k', '超清 4k'] },
    { value: '116', label: '1080P60', aliases: ['1080p60', '高帧率 1080p60', '60帧'] },
    { value: '112', label: '1080P+', aliases: ['1080p+', '1080p 高码率', '高码率'] },
    { value: '80', label: '1080P', aliases: ['1080p', '高清 1080p'] },
    { value: '74', label: '720P60', aliases: ['720p60', '高帧率 720p60'] },
    { value: '64', label: '720P', aliases: ['720p', '高清 720p'] },
    { value: '32', label: '480P', aliases: ['480p', '清晰 480p'] },
    { value: '16', label: '360P', aliases: ['360p', '流畅 360p'] }
];

export const DEFAULT_BILIBILI_TARGET_QUALITY = '80';
export const DEFAULT_BILIBILI_CUSTOM_DEFAULT_QUALITY = '64';

const QUALITY_OPTION_SET = new Set(BILIBILI_QUALITY_OPTIONS.map((item) => item.value));

export function normalizeBilibiliQualityValue(
    value: string | number | null | undefined,
    fallback: string
): string {
    const normalized = typeof value === 'number'
        ? String(value)
        : (typeof value === 'string' ? value.trim() : '');
    return QUALITY_OPTION_SET.has(normalized) ? normalized : fallback;
}

export function getBilibiliQualityLabel(value: string): string {
    return BILIBILI_QUALITY_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function getBilibiliQualityAliases(value: string): string[] {
    const option = BILIBILI_QUALITY_OPTIONS.find((item) => item.value === value);
    if (!option) return [];

    return [option.label, ...option.aliases].map((item) => item.toLowerCase());
}

export function getBilibiliQualityRank(value: string): number {
    return BILIBILI_QUALITY_ORDER.indexOf(value as typeof BILIBILI_QUALITY_ORDER[number]);
}

export function pickBilibiliQualityAtOrBelow(
    availableValues: string[],
    desiredValue: string | null | undefined
): string | null {
    const normalizedValues = [...new Set(
        availableValues.filter((value) => QUALITY_OPTION_SET.has(value))
    )];
    if (normalizedValues.length === 0) return null;

    const desiredRank = desiredValue ? getBilibiliQualityRank(desiredValue) : -1;
    if (desiredRank < 0) return normalizedValues[0] ?? null;

    const candidates = normalizedValues
        .map((value) => ({ value, rank: getBilibiliQualityRank(value) }))
        .filter((item) => item.rank >= 0)
        .sort((a, b) => a.rank - b.rank);

    const exact = candidates.find((item) => item.value === desiredValue);
    if (exact) return exact.value;

    const lowerOrEqual = candidates.find((item) => item.rank >= desiredRank);
    if (lowerOrEqual) return lowerOrEqual.value;

    return candidates[0]?.value ?? null;
}
