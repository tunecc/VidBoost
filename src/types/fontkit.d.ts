declare module 'fontkit' {
    export type FontkitVariationAxis = {
        name?: string;
        min?: number;
        default?: number;
        max?: number;
    };

    export type FontkitFont = {
        fullName?: string | null;
        familyName?: string | null;
        subfamilyName?: string | null;
        variationAxes?: Record<string, FontkitVariationAxis>;
        fonts?: FontkitFont[];
        hasGlyphForCodePoint?(codePoint: number): boolean;
        ['OS/2']?: {
            usWeightClass?: number;
        };
    };

    export function create(
        buffer: ArrayBuffer | ArrayBufferView,
        postscriptName?: string | null
    ): FontkitFont;

    const fontkit: {
        create: typeof create;
    };

    export default fontkit;
}
