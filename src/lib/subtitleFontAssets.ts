import type { YTSubtitleStyle } from './settings';

const SUBTITLE_FONT_DB_NAME = 'vidboost-subtitle-font-assets';
const SUBTITLE_FONT_DB_VERSION = 1;
const SUBTITLE_FONT_STORE_NAME = 'yt-subtitle-fonts';
const SUBTITLE_FONT_CAPABILITY_ANALYSIS_VERSION = 1;

const SUPPORTED_FONT_EXTENSIONS = new Set(['ttf', 'otf', 'woff', 'woff2']);
const SUPPORTED_FONT_MIME_TYPES = new Set([
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    'application/font-sfnt',
    'application/font-woff',
    'application/font-woff2',
    'application/x-font-ttf',
    'application/x-font-opentype',
    'application/x-font-woff'
]);

export const SUBTITLE_FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2';

export const DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif';

export const DEFAULT_YT_SUBTITLE_IMPORTED_FONT_FALLBACK =
    '"PingFang SC", "Hiragino Sans GB", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export type SubtitleFontWeightRange = {
    min: number;
    max: number;
    default: number;
    step: number;
};

export type SubtitleFontAssetCapabilities = {
    analysisVersion: number;
    fullName: string;
    weightRange: SubtitleFontWeightRange | null;
    supportsCjk: boolean | null;
};

export type SubtitleFontAssetRecord = {
    id: string;
    displayName: string;
    fileName: string;
    mimeType: string;
    buffer: ArrayBuffer;
    size: number;
    createdAt: number;
    updatedAt: number;
    capabilities: SubtitleFontAssetCapabilities | null;
};

export type SubtitleFontAssetSummary = {
    id: string;
    displayName: string;
    fileName: string;
    mimeType: string;
    size: number;
    createdAt: number;
    updatedAt: number;
    capabilities: SubtitleFontAssetCapabilities | null;
};

export type SubtitleFontAssetTransport = {
    id: string;
    displayName: string;
    mimeType: string;
    size: number;
    bufferBase64: string;
    capabilities: SubtitleFontAssetCapabilities | null;
};

export type SubtitleFontAssetGetResponse =
    | {
        ok: true;
        font: SubtitleFontAssetTransport;
    }
    | {
        ok: false;
        error: string;
    };

let subtitleFontDbPromise: Promise<IDBDatabase> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function requestToPromise<T>(request: IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('idb_request_failed'));
    });
}

function getFileExtension(fileName: string) {
    const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] ?? '';
}

function sanitizeDisplayName(fileName: string) {
    const withoutExtension = fileName.replace(/\.[^.]+$/, '').trim();
    const normalized = withoutExtension.replace(/\s+/g, ' ').trim();
    return normalized || 'Imported Font';
}

function createSubtitleFontAssetId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `font_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function inferMimeType(fileName: string, mimeType: string | null | undefined) {
    const normalizedType = (mimeType || '').trim().toLowerCase();
    if (SUPPORTED_FONT_MIME_TYPES.has(normalizedType) && normalizedType !== 'application/octet-stream') {
        return normalizedType;
    }

    switch (getFileExtension(fileName)) {
        case 'ttf':
            return 'font/ttf';
        case 'otf':
            return 'font/otf';
        case 'woff':
            return 'font/woff';
        case 'woff2':
            return 'font/woff2';
        default:
            return normalizedType || 'application/octet-stream';
    }
}

function toArrayBuffer(value: unknown) {
    if (value instanceof ArrayBuffer) {
        return value;
    }

    if (ArrayBuffer.isView(value)) {
        const view = value as ArrayBufferView;
        const copy = new Uint8Array(view.byteLength);
        copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        return copy.buffer;
    }

    return null;
}

function sanitizeFontMetaText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function clampSubtitleFontWeight(weight: number, min = 1, max = 1000) {
    return Math.min(max, Math.max(min, Math.round(weight)));
}

function normalizeSubtitleFontWeightRange(value: unknown): SubtitleFontWeightRange | null {
    if (!isRecord(value)) return null;

    const min = clampSubtitleFontWeight(
        typeof value.min === 'number' ? value.min : 100,
        1,
        1000
    );
    const max = clampSubtitleFontWeight(
        typeof value.max === 'number' ? value.max : 900,
        min,
        1000
    );
    const defaultWeight = clampSubtitleFontWeight(
        typeof value.default === 'number' ? value.default : 400,
        min,
        max
    );
    const step = clampSubtitleFontWeight(
        typeof value.step === 'number' ? value.step : 10,
        1,
        100
    );

    return {
        min,
        max,
        default: defaultWeight,
        step
    };
}

function normalizeSubtitleFontAssetCapabilities(value: unknown): SubtitleFontAssetCapabilities | null {
    if (!isRecord(value)) return null;

    const weightRange = normalizeSubtitleFontWeightRange(value.weightRange);

    return {
        analysisVersion: typeof value.analysisVersion === 'number'
            ? Math.max(1, Math.round(value.analysisVersion))
            : SUBTITLE_FONT_CAPABILITY_ANALYSIS_VERSION,
        fullName: sanitizeFontMetaText(value.fullName),
        weightRange,
        supportsCjk: typeof value.supportsCjk === 'boolean' ? value.supportsCjk : null
    };
}

function createUnknownSubtitleFontCapabilities(): SubtitleFontAssetCapabilities {
    return {
        analysisVersion: SUBTITLE_FONT_CAPABILITY_ANALYSIS_VERSION,
        fullName: '',
        weightRange: null,
        supportsCjk: null
    };
}

async function detectSubtitleFontCapabilities(buffer: ArrayBuffer): Promise<SubtitleFontAssetCapabilities> {
    try {
        const fontkitModule = await import('fontkit');
        const createFont = fontkitModule.create ?? fontkitModule.default?.create;
        if (typeof createFont !== 'function') {
            return createUnknownSubtitleFontCapabilities();
        }

        const createdFont = createFont(new Uint8Array(buffer));
        const primaryFont = isRecord(createdFont) && Array.isArray(createdFont.fonts)
            ? createdFont.fonts.find((font) => isRecord(font)) ?? null
            : createdFont;

        if (!isRecord(primaryFont)) {
            return createUnknownSubtitleFontCapabilities();
        }

        const variationAxes = isRecord(primaryFont.variationAxes)
            ? primaryFont.variationAxes
            : null;
        const rawWeightAxis = variationAxes && isRecord(variationAxes.wght)
            ? variationAxes.wght
            : null;
        const weightRange = rawWeightAxis
            ? normalizeSubtitleFontWeightRange({
                min: rawWeightAxis.min,
                max: rawWeightAxis.max,
                default: rawWeightAxis.default,
                step: 10
            })
            : null;

        let supportsCjk: boolean | null = null;
        if (typeof primaryFont.hasGlyphForCodePoint === 'function') {
            const sampleCodePoints = ['中', '文', '字', '幕'].map((char) => char.codePointAt(0) ?? 0);
            supportsCjk = sampleCodePoints.some((codePoint) => {
                try {
                    return primaryFont.hasGlyphForCodePoint?.(codePoint) === true;
                } catch {
                    return false;
                }
            });
        }

        const capabilities = normalizeSubtitleFontAssetCapabilities({
            analysisVersion: SUBTITLE_FONT_CAPABILITY_ANALYSIS_VERSION,
            fullName: sanitizeFontMetaText(primaryFont.fullName),
            weightRange,
            supportsCjk
        });

        return capabilities ?? createUnknownSubtitleFontCapabilities();
    } catch {
        return createUnknownSubtitleFontCapabilities();
    }
}

function normalizeSubtitleFontAssetRecord(value: unknown): SubtitleFontAssetRecord | null {
    if (!isRecord(value)) return null;

    const buffer = toArrayBuffer(value.buffer);
    if (!buffer) return null;

    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const fileName = typeof value.fileName === 'string' ? value.fileName.trim() : '';
    const displayName = typeof value.displayName === 'string'
        ? value.displayName.trim()
        : sanitizeDisplayName(fileName);
    const size = typeof value.size === 'number' && value.size > 0 ? value.size : buffer.byteLength;
    const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now();
    const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : createdAt;
    const capabilities = normalizeSubtitleFontAssetCapabilities(value.capabilities);

    if (!id || !fileName) return null;

    return {
        id,
        displayName: displayName || sanitizeDisplayName(fileName),
        fileName,
        mimeType: inferMimeType(fileName, typeof value.mimeType === 'string' ? value.mimeType : ''),
        buffer,
        size,
        createdAt,
        updatedAt,
        capabilities
    };
}

function toSummary(record: SubtitleFontAssetRecord): SubtitleFontAssetSummary {
    return {
        id: record.id,
        displayName: record.displayName,
        fileName: record.fileName,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        capabilities: record.capabilities
    };
}

async function openSubtitleFontDb() {
    if (subtitleFontDbPromise) {
        return subtitleFontDbPromise;
    }

    if (typeof indexedDB === 'undefined') {
        throw new Error('indexeddb_unavailable');
    }

    subtitleFontDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(SUBTITLE_FONT_DB_NAME, SUBTITLE_FONT_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(SUBTITLE_FONT_STORE_NAME)) {
                db.createObjectStore(SUBTITLE_FONT_STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                subtitleFontDbPromise = null;
            };
            resolve(db);
        };

        request.onerror = () => {
            subtitleFontDbPromise = null;
            reject(request.error ?? new Error('subtitle_font_db_open_failed'));
        };

        request.onblocked = () => {
            subtitleFontDbPromise = null;
            reject(new Error('subtitle_font_db_blocked'));
        };
    });

    return subtitleFontDbPromise;
}

export function canUseSubtitleFontAssetStore() {
    return typeof indexedDB !== 'undefined';
}

export function isSupportedSubtitleFontFile(fileName: string, mimeType = '') {
    const extension = getFileExtension(fileName);
    const normalizedType = mimeType.trim().toLowerCase();
    return SUPPORTED_FONT_EXTENSIONS.has(extension) || SUPPORTED_FONT_MIME_TYPES.has(normalizedType);
}

export async function createSubtitleFontAssetFromFile(file: File): Promise<SubtitleFontAssetRecord> {
    const fileName = file.name?.trim() || 'font';
    if (!isSupportedSubtitleFontFile(fileName, file.type)) {
        throw new Error('unsupported_font_file');
    }

    const buffer = await file.arrayBuffer();
    const now = Date.now();
    const capabilities = await detectSubtitleFontCapabilities(buffer);
    const detectedDisplayName = capabilities.fullName || sanitizeDisplayName(fileName);

    return {
        id: createSubtitleFontAssetId(),
        displayName: detectedDisplayName,
        fileName,
        mimeType: inferMimeType(fileName, file.type),
        buffer,
        size: buffer.byteLength || file.size || 0,
        createdAt: now,
        updatedAt: now,
        capabilities
    };
}

export async function listSubtitleFontAssetSummaries(): Promise<SubtitleFontAssetSummary[]> {
    const db = await openSubtitleFontDb();
    const tx = db.transaction(SUBTITLE_FONT_STORE_NAME, 'readonly');
    const store = tx.objectStore(SUBTITLE_FONT_STORE_NAME);
    const result = await requestToPromise(store.getAll()) as unknown[];
    return result
        .map((value) => normalizeSubtitleFontAssetRecord(value))
        .filter((value): value is SubtitleFontAssetRecord => Boolean(value))
        .map((value) => toSummary(value))
        .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function getSubtitleFontAsset(id: string): Promise<SubtitleFontAssetRecord | null> {
    const normalizedId = id.trim();
    if (!normalizedId) return null;

    const db = await openSubtitleFontDb();
    const tx = db.transaction(SUBTITLE_FONT_STORE_NAME, 'readonly');
    const store = tx.objectStore(SUBTITLE_FONT_STORE_NAME);
    const result = await requestToPromise(store.get(normalizedId));
    return normalizeSubtitleFontAssetRecord(result);
}

export async function putSubtitleFontAsset(record: SubtitleFontAssetRecord): Promise<SubtitleFontAssetSummary> {
    const db = await openSubtitleFontDb();
    const tx = db.transaction(SUBTITLE_FONT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SUBTITLE_FONT_STORE_NAME);
    const now = Date.now();
    const fileName = record.fileName.trim() || 'font';
    const nextRecord: SubtitleFontAssetRecord = {
        ...record,
        displayName: record.displayName.trim()
            || record.capabilities?.fullName
            || sanitizeDisplayName(record.fileName),
        fileName,
        mimeType: inferMimeType(fileName, record.mimeType),
        size: record.size > 0 ? record.size : record.buffer.byteLength,
        createdAt: record.createdAt || now,
        updatedAt: now,
        capabilities: normalizeSubtitleFontAssetCapabilities(record.capabilities)
    };

    await requestToPromise(store.put(nextRecord));
    return toSummary(nextRecord);
}

export async function deleteSubtitleFontAsset(id: string) {
    const normalizedId = id.trim();
    if (!normalizedId) return;

    const db = await openSubtitleFontDb();
    const tx = db.transaction(SUBTITLE_FONT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SUBTITLE_FONT_STORE_NAME);
    await requestToPromise(store.delete(normalizedId));
}

export function buildSubtitleImportedFontFaceName(fontId: string) {
    const normalizedId = fontId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return normalizedId ? `VBYTSubtitleFont_${normalizedId}` : '';
}

export function buildSubtitleImportedFontFamily(fontId: string) {
    const faceName = buildSubtitleImportedFontFaceName(fontId);
    if (!faceName) {
        return DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY;
    }

    return `"${faceName}", ${DEFAULT_YT_SUBTITLE_IMPORTED_FONT_FALLBACK}`;
}

export function resolveYTSubtitleFontFamily(
    style: Pick<YTSubtitleStyle, 'fontFamilyPreset' | 'importedFontId' | 'customFontFamily'>
) {
    switch (style.fontFamilyPreset) {
        case 'system-sans':
        case 'default':
            return DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY;
        case 'system-serif':
            return 'ui-serif, Georgia, Cambria, "Times New Roman", serif';
        case 'rounded':
            return '"Arial Rounded MT Bold", "SF Pro Rounded", "Hiragino Maru Gothic ProN", sans-serif';
        case 'monospace-sans':
            return '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
        case 'monospace-serif':
            return '"Courier New", Courier, monospace';
        case 'casual':
            return '"Comic Sans MS", "Chalkboard SE", cursive';
        case 'cursive':
            return '"Snell Roundhand", "Segoe Script", cursive';
        case 'small-caps':
            return DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY;
        case 'imported':
            return buildSubtitleImportedFontFamily(style.importedFontId);
        case 'custom':
            return style.customFontFamily.trim() || DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY;
        default:
            return DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY;
    }
}

export function buildSubtitleFontFaceDescriptors(capabilities: SubtitleFontAssetCapabilities | null | undefined) {
    const normalizedCapabilities = capabilities ?? null;
    if (normalizedCapabilities?.weightRange) {
        return {
            weight: `${normalizedCapabilities.weightRange.min} ${normalizedCapabilities.weightRange.max}`
        } satisfies FontFaceDescriptors;
    }

    return undefined;
}

export function buildSubtitleFontVariationSettings(
    capabilities: SubtitleFontAssetCapabilities | null | undefined,
    fontWeight: number
) {
    if (!capabilities?.weightRange) {
        return 'normal';
    }

    const normalizedWeight = clampSubtitleFontWeight(
        fontWeight,
        capabilities.weightRange.min,
        capabilities.weightRange.max
    );

    return `"wght" ${normalizedWeight}`;
}

export function normalizeSubtitleFontWeightForCapabilities(
    fontWeight: number,
    capabilities: SubtitleFontAssetCapabilities | null | undefined
) {
    if (capabilities?.weightRange) {
        return clampSubtitleFontWeight(
            fontWeight,
            capabilities.weightRange.min,
            capabilities.weightRange.max
        );
    }

    return clampSubtitleFontWeight(fontWeight, 100, 900);
}

export async function ensureSubtitleFontAssetCapabilities(id: string) {
    const record = await getSubtitleFontAsset(id);
    if (!record) return null;

    if (record.capabilities?.analysisVersion === SUBTITLE_FONT_CAPABILITY_ANALYSIS_VERSION) {
        return toSummary(record);
    }

    const capabilities = await detectSubtitleFontCapabilities(record.buffer);
    return await putSubtitleFontAsset({
        ...record,
        displayName: record.displayName.trim() || capabilities.fullName || sanitizeDisplayName(record.fileName),
        capabilities
    });
}

export function subtitleFontBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x2000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const slice = bytes.subarray(index, index + chunkSize);
        let chunk = '';
        for (let offset = 0; offset < slice.length; offset += 1) {
            chunk += String.fromCharCode(slice[offset] ?? 0);
        }
        binary += chunk;
    }

    return btoa(binary);
}

export function subtitleFontBase64ToArrayBuffer(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
}
