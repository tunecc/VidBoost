import { describe, expect, it } from 'vitest';
import {
    byteRangeLength,
    parseByteRangeSpec,
    parseContentRange,
    parseRangeHeader
} from '../player/range';

describe('threadRipper range parsing', () => {
    it('parses a single bounded Range request header', () => {
        expect(parseRangeHeader('bytes=0-1011')).toEqual({ start: 0, end: 1011 });
        expect(parseRangeHeader('  BYTES=0-1011 ')).toEqual({ start: 0, end: 1011 });
        expect(byteRangeLength({ start: 0, end: 1011 })).toBe(1012);
    });

    it('rejects open-ended, multi-range and malformed Range headers', () => {
        expect(parseRangeHeader('bytes=0-')).toBeNull();
        expect(parseRangeHeader('bytes=0-1011, 2000-3000')).toBeNull();
        expect(parseRangeHeader('bytes=a-b, c-d')).toBeNull();
        expect(parseRangeHeader('bytes=1011-0')).toBeNull();
        expect(parseRangeHeader('items=0-1011')).toBeNull();
        expect(parseRangeHeader('')).toBeNull();
    });

    it('parses a Content-Range response header', () => {
        expect(parseContentRange('bytes 0-1011/4536379')).toEqual({ start: 0, end: 1011, total: 4536379 });
        expect(parseContentRange(' bytes 100-199/4536379 ')).toEqual({ start: 100, end: 199, total: 4536379 });
    });

    it('treats an asterisk total as unknown and rejects inconsistent totals', () => {
        expect(parseContentRange('bytes 0-1011/*')).toEqual({ start: 0, end: 1011, total: null });
        expect(parseContentRange('bytes 0-1011/100')).toBeNull();
        expect(parseContentRange('bytes 5-5/5')).toBeNull();
    });

    it('returns null for a missing Content-Range or a malformed one', () => {
        expect(parseContentRange(null)).toBeNull();
        expect(parseContentRange('bytes 0-/100')).toBeNull();
        expect(parseContentRange('chunks 0-1/10')).toBeNull();
    });

    it('parses Bilibili DASH SegmentBase byte range specs', () => {
        expect(parseByteRangeSpec('0-1011')).toEqual({ start: 0, end: 1011 });
        expect(parseByteRangeSpec(' 1012-1500 ')).toEqual({ start: 1012, end: 1500 });
        expect(parseByteRangeSpec('0-')).toBeNull();
        expect(parseByteRangeSpec('1011-0')).toBeNull();
        expect(parseByteRangeSpec(42)).toBeNull();
        expect(parseByteRangeSpec(null)).toBeNull();
        expect(parseByteRangeSpec(undefined)).toBeNull();
    });
});
