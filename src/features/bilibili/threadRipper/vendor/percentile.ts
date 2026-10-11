// Ported from Make-Bilibili-Great-Than-Ever-Before (MIT, Copyright (c) 2024 Sukka), commit a31eea9 (node_modules/fast-percentile/dist/index.mjs).
//
// Inlined `fast-percentile@1.0.0` (MIT, Copyright (c) SukkaW): nearest-rank percentile over an
// unsorted array via quickselect. `p(0)` is a linear-scan minimum, `p(100)` a linear-scan maximum;
// for any other percentile the k-th smallest element with `k = ceil(percentile * length / 100)` is
// selected on a copy of the samples, so the input array is never mutated. Empty samples and
// non-integer percentiles in [0, 100] throw a `RangeError`.

const EMPTY_SAMPLES_ERROR = RangeError('samples must not be empty');

export function p(percentile: number): (samples: number[]) => number {
    if (percentile < 0 || percentile > 100 || (percentile | 0) !== percentile) {
        throw RangeError('percentile must be an integer in [0, 100]');
    }
    if (percentile === 0) {
        return (samples: number[]) => {
            const length = samples.length;
            if (length === 0) throw EMPTY_SAMPLES_ERROR;
            let min = samples[0];
            for (let i = 1; i < length; i++) {
                if (samples[i] < min) min = samples[i];
            }
            return min;
        };
    }
    if (percentile === 100) {
        return (samples: number[]) => {
            const length = samples.length;
            if (length === 0) throw EMPTY_SAMPLES_ERROR;
            let max = samples[0];
            for (let i = 1; i < length; i++) {
                if (samples[i] > max) max = samples[i];
            }
            return max;
        };
    }
    return (samples: number[]) => {
        const length = samples.length;
        if (length === 0) throw EMPTY_SAMPLES_ERROR;
        const rank = Math.ceil((percentile * length) / 100);
        return quickselect(samples.slice(), rank, length);
    };
}

/** Hoare-style quickselect: partitions around a pivot until the `rank`-th smallest element sits at its boundary */
function quickselect(arr: number[], rank: number, high: number): number {
    let low = 0;
    for (;;) {
        const pivot = arr[low];
        if (low >= high - 1) return pivot;
        let i = low;
        let j = high - 1;
        while (i < j) {
            while (i < j && arr[i] < pivot) i++;
            while (i < j && arr[j] >= pivot) j--;
            if (i < j) {
                const tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
        }
        if (rank <= i) {
            high = i;
            continue;
        }
        i = low = i;
        j = high - 1;
        while (i < j) {
            while (i < j && arr[i] === pivot) i++;
            while (i < j && arr[j] !== pivot) j--;
            if (i < j) {
                const tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
        }
        if (rank <= i) return pivot;
        low = i;
    }
}

export const p50: (samples: number[]) => number = p(50);
