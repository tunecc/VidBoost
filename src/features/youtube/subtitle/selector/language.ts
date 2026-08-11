const HANS_REGIONS = new Set(['CN', 'SG', 'MY']);
const HANT_REGIONS = new Set(['TW', 'HK', 'MO']);

export function canonicalizeLanguageCode(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';

    try {
        return Intl.getCanonicalLocales(trimmed)[0] || trimmed;
    } catch {
        return trimmed;
    }
}

function localeParts(value: string) {
    try {
        const locale = new Intl.Locale(value);
        return {
            language: locale.language.toLowerCase(),
            script: locale.script?.toLowerCase() || '',
            region: locale.region?.toUpperCase() || ''
        };
    } catch {
        return null;
    }
}

function chineseScriptGroup(script: string, region: string): 'hans' | 'hant' | null {
    if (script.toLowerCase() === 'hans') return 'hans';
    if (script.toLowerCase() === 'hant') return 'hant';
    if (HANS_REGIONS.has(region.toUpperCase())) return 'hans';
    if (HANT_REGIONS.has(region.toUpperCase())) return 'hant';
    return null;
}

export function areTargetLanguagesCompatible(left: string, right: string): boolean {
    const a = canonicalizeLanguageCode(left);
    const b = canonicalizeLanguageCode(right);
    if (!a || !b) return false;
    if (a === b) return true;

    const leftParts = localeParts(a);
    const rightParts = localeParts(b);
    if (!leftParts || !rightParts || leftParts.language !== rightParts.language) return false;

    if (leftParts.language === 'zh') {
        if ((!leftParts.script && !leftParts.region) || (!rightParts.script && !rightParts.region)) {
            return false;
        }
        const leftGroup = chineseScriptGroup(leftParts.script, leftParts.region);
        const rightGroup = chineseScriptGroup(rightParts.script, rightParts.region);
        return leftGroup !== null && leftGroup === rightGroup;
    }

    const leftIsGeneric = !leftParts.script && !leftParts.region;
    const rightIsGeneric = !rightParts.script && !rightParts.region;
    return leftIsGeneric !== rightIsGeneric;
}
