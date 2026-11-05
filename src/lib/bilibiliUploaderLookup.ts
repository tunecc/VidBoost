export type BilibiliUploaderInfo = {
    uid?: string | null;
    name?: string | null;
    profileUrl?: string | null;
};

export type BilibiliUploaderLookupReason = 'unsupported-page' | 'not-ready';

export type BilibiliUploaderLookupResponse = {
    uploader?: BilibiliUploaderInfo | null;
    reason?: BilibiliUploaderLookupReason;
};

export type BilibiliUploaderLookupResult = {
    uploader: BilibiliUploaderInfo | null;
    reason?: BilibiliUploaderLookupReason;
};

export const BB_UPLOADER_RETRY_DELAYS_MS = [300, 600];
export const BB_UPLOADER_SLOW_CALL_MS = 1000;
export const BB_UPLOADER_TOTAL_BUDGET_MS = 3000;

export function hasBilibiliUploaderInfo(
    uploader: BilibiliUploaderInfo | null | undefined
): uploader is BilibiliUploaderInfo {
    return Boolean(uploader?.uid || uploader?.name || uploader?.profileUrl);
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Sends `VB_BB_SUBTITLE_CURRENT_UPLOADER` to the active tab and retries a few
 * times while the content script is still resolving the uploader.
 *
 * The whole lookup is bounded: at most 3 calls, and no further retry once a
 * single call has already consumed the content-side budget (>=1s) or the total
 * elapsed time reaches 3s. An explicit "not a video page" answer stops at once.
 */
export async function lookupBilibiliUploader(
    sendMessage: (
        message: unknown
    ) => Promise<BilibiliUploaderLookupResponse | null | undefined>,
    options: {
        sleep?: (ms: number) => Promise<void>;
        now?: () => number;
        retryDelaysMs?: number[];
        slowCallMs?: number;
        totalBudgetMs?: number;
    } = {}
): Promise<BilibiliUploaderLookupResult> {
    const sleep = options.sleep ?? defaultSleep;
    const now = options.now ?? (() => Date.now());
    const retryDelaysMs = options.retryDelaysMs ?? BB_UPLOADER_RETRY_DELAYS_MS;
    const slowCallMs = options.slowCallMs ?? BB_UPLOADER_SLOW_CALL_MS;
    const totalBudgetMs = options.totalBudgetMs ?? BB_UPLOADER_TOTAL_BUDGET_MS;

    const startedAt = now();
    let reason: BilibiliUploaderLookupReason | undefined;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
        const callStartedAt = now();
        const response = await sendMessage({ type: 'VB_BB_SUBTITLE_CURRENT_UPLOADER' })
            .catch(() => null);
        const callDurationMs = now() - callStartedAt;

        if (hasBilibiliUploaderInfo(response?.uploader)) {
            return { uploader: response?.uploader ?? null, reason: response?.reason };
        }

        reason = response?.reason ?? 'not-ready';
        if (reason === 'unsupported-page') return { uploader: null, reason };

        // A slow call already spent the content-side budget; retrying would
        // make the user wait far longer than the promised ~3s.
        if (callDurationMs >= slowCallMs) break;
        if (now() - startedAt >= totalBudgetMs) break;

        const delay = retryDelaysMs[attempt];
        if (delay == null) break;
        await sleep(delay);
        if (now() - startedAt >= totalBudgetMs) break;
    }

    return { uploader: null, reason: reason ?? 'not-ready' };
}
