export function normalizeDomain(input: string): string | null {
    let domain = input.trim().toLowerCase();
    if (!domain) return null;

    if (domain.startsWith('*.')) {
        domain = domain.slice(2);
    }

    domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    domain = domain.replace(/^\/\//, '');

    const atIndex = domain.lastIndexOf('@');
    if (atIndex !== -1) {
        domain = domain.slice(atIndex + 1);
    }

    domain = domain.split(/[/?#]/)[0] || '';
    if (!domain) return null;

    if (domain.startsWith('[')) {
        const end = domain.indexOf(']');
        if (end === -1) return null;
        const ipv6 = domain.slice(0, end + 1);
        const rest = domain.slice(end + 1);
        if (rest && !rest.startsWith(':')) return null;
        domain = ipv6;
    } else {
        domain = domain.split(':')[0];
    }

    domain = domain.replace(/^\.+|\.+$/g, '');
    if (!domain) return null;

    if (domain === 'localhost') return domain;

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) {
        const ok = domain
            .split('.')
            .map(Number)
            .every((n) => n >= 0 && n <= 255);
        return ok ? domain : null;
    }

    if (!/^[a-z0-9.-]+$/.test(domain)) return null;
    if (domain.includes('..') || !domain.includes('.')) return null;

    const labels = domain.split('.');
    const labelsValid = labels.every((label) => {
        return (
            !!label &&
            label.length <= 63 &&
            !label.startsWith('-') &&
            !label.endsWith('-')
        );
    });

    return labelsValid ? domain : null;
}

export function normalizeDomainList(inputs: string[]): string[] {
    const unique = new Set<string>();
    inputs.forEach((item) => {
        const normalized = normalizeDomain(item);
        if (normalized) unique.add(normalized);
    });
    return Array.from(unique);
}
