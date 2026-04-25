import type { Feature } from './Feature';
import { isSiteHost } from '../lib/siteProfiles';
import { i18n, type I18nLang } from '../lib/i18n';
import {
    cloneYTSubtitleConfig,
    DEFAULT_SETTINGS,
    setSettings,
    type Settings,
    type YTSubtitleConfig,
    type YTSubtitleStyle
} from '../lib/settings';
import { runtimeSendMessage } from '../lib/webext';
import { OSD } from '../lib/OSD';
import { VideoController } from '../lib/VideoController';
import { markInteractionRoot } from '../lib/pointerTargets';
import {
    buildSubtitleImportedFontFaceName,
    buildSubtitleImportedFontFamily,
    DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY,
    subtitleFontBase64ToArrayBuffer,
    type SubtitleFontAssetGetResponse
} from '../lib/subtitleFontAssets';
import {
    ensureYouTubeSubtitleOverlayScriptInjected,
    installYouTubeSubtitleOverlayBridge,
    requestYouTubeSubtitleEnsureEnabled,
    requestYouTubeSubtitlePlayerData
} from './youtube/subtitleOverlay';
import {
    type YouTubeSubtitleAudioCaptionTrack,
    type YouTubeSubtitleCaptionTrack,
    type YouTubeSubtitlePlayerData,
    type YouTubeTimedText
} from './youtube/subtitleOverlay.shared';
import {
    parseYouTubeSubtitleEvents,
    type SubtitleFragment
} from './youtube/subtitleOverlayParser';

type PotToken = {
    pot: string | null;
    potc: string | null;
};

type DragState = {
    startClientY: number;
    startPercent: number;
    height: number;
    anchor: 'bottom' | 'top';
};

const OVERLAY_ROOT_ID = 'vb-yt-subtitle-overlay-root';
const NATIVE_STYLE_ID = 'vb-yt-subtitle-native-hide';
const ROUTE_POLL_MS = 400;
const TRACK_POLL_MS = 1200;
const FETCH_RETRY_DELAY_MS = 250;
const FETCH_RETRY_ATTEMPTS = 6;
const MIN_POSITION_PERCENT = 4;
const MAX_POSITION_PERCENT = 72;
const BASE_FONT_SIZE_PX = 22;

const DEVICE_PARAM_KEYS = [
    'cbrand',
    'cbr',
    'cbrver',
    'cos',
    'cosver',
    'cplatform'
] as const;

const FIXED_TIMEDTEXT_PARAMS = {
    fmt: 'json3',
    xorb: '2',
    xobt: '3',
    xovt: '3',
    c: 'WEB',
    cplayer: 'UNIPLAYER'
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string | null | undefined) {
    const normalized = (value || '').trim();
    const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
    if (!match) return null;

    const hex = match[1];
    return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16)
    };
}

function toRgbaColor(value: string | null | undefined, alpha: number, fallback: string) {
    const color = parseHexColor(value) || parseHexColor(fallback) || { r: 255, g: 255, b: 255 };
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp(alpha, 0, 1).toFixed(2)})`;
}

function resolveSubtitleFontFamily(style: YTSubtitleStyle) {
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
            return style.customFontFamily.trim()
                || DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY;
        default:
            return DEFAULT_YT_SUBTITLE_SYSTEM_FONT_FAMILY;
    }
}

function buildOutlineTextShadow(width: number, color: string) {
    const offsets = [
        [-width, 0],
        [width, 0],
        [0, -width],
        [0, width],
        [-width, -width],
        [-width, width],
        [width, -width],
        [width, width]
    ];

    return offsets
        .map(([x, y]) => `${x}px ${y}px 0 ${color}`)
        .join(', ');
}

function buildSubtitleTextShadow(style: YTSubtitleStyle) {
    const shadowStrength = clamp(style.shadowStrength, 0, 100) / 100;
    const outlineWidth = clamp(style.outlineWidth, 0, 6);

    switch (style.edgeStyle) {
        case 'none':
            return 'none';
        case 'outline': {
            if (outlineWidth <= 0) return 'none';
            const outlineColor = toRgbaColor('#000000', 0.55 + shadowStrength * 0.35, '#000000');
            return buildOutlineTextShadow(outlineWidth, outlineColor);
        }
        case 'raised': {
            if (shadowStrength <= 0) return 'none';
            const distance = Math.max(1, outlineWidth || 1);
            const light = `rgba(255, 255, 255, ${(0.16 + shadowStrength * 0.32).toFixed(2)})`;
            const dark = `rgba(0, 0, 0, ${(0.32 + shadowStrength * 0.45).toFixed(2)})`;
            return `0 -${distance}px 0 ${light}, 0 ${distance}px 0 ${dark}`;
        }
        case 'depressed': {
            if (shadowStrength <= 0) return 'none';
            const distance = Math.max(1, outlineWidth || 1);
            const light = `rgba(255, 255, 255, ${(0.12 + shadowStrength * 0.24).toFixed(2)})`;
            const dark = `rgba(0, 0, 0, ${(0.35 + shadowStrength * 0.45).toFixed(2)})`;
            return `0 ${distance}px 0 ${light}, 0 -${distance}px 0 ${dark}`;
        }
        case 'drop-shadow':
        default: {
            if (shadowStrength <= 0) return 'none';
            const liftBlur = (1 + shadowStrength * 2).toFixed(1);
            const spreadBlur = (2 + shadowStrength * 6).toFixed(1);
            const primary = `rgba(0, 0, 0, ${(0.48 + shadowStrength * 0.34).toFixed(2)})`;
            const secondary = `rgba(0, 0, 0, ${(0.22 + shadowStrength * 0.32).toFixed(2)})`;
            return `0 1px ${liftBlur}px ${primary}, 0 0 ${spreadBlur}px ${secondary}`;
        }
    }
}

function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError';
}

function isHttpStatusError(error: unknown, status: number) {
    return error instanceof Error && error.message === `http:${status}`;
}

function buildTrackKey(videoId: string, track: YouTubeSubtitleCaptionTrack) {
    return `${videoId}:${track.languageCode}:${track.kind ?? ''}:${track.vssId}`;
}

function extractPotToken(
    selectedTrack: YouTubeSubtitleCaptionTrack,
    playerData: YouTubeSubtitlePlayerData
): PotToken {
    const { audioCaptionTracks, cachedTimedtextUrl } = playerData;

    if (audioCaptionTracks.length > 0) {
        let matchedTrack: YouTubeSubtitleAudioCaptionTrack | undefined = audioCaptionTracks.find(
            (track) => track.vssId === selectedTrack.vssId
        );

        if (!matchedTrack) {
            matchedTrack = audioCaptionTracks.find((track) =>
                track.languageCode === selectedTrack.languageCode
                && track.kind === selectedTrack.kind
            );
        }

        if (!matchedTrack) {
            matchedTrack = audioCaptionTracks.find(
                (track) => track.languageCode === selectedTrack.languageCode
            );
        }

        if (!matchedTrack) {
            matchedTrack = audioCaptionTracks[0];
        }

        if (matchedTrack?.url) {
            try {
                const url = new URL(matchedTrack.url);
                const pot = url.searchParams.get('pot');
                const potc = url.searchParams.get('potc');
                if (pot) {
                    return { pot, potc };
                }
            } catch {
                // ignore invalid urls
            }
        }
    }

    if (cachedTimedtextUrl) {
        try {
            const url = new URL(cachedTimedtextUrl);
            const pot = url.searchParams.get('pot');
            const potc = url.searchParams.get('potc');
            if (pot) {
                return { pot, potc };
            }
        } catch {
            // ignore invalid urls
        }
    }

    return { pot: null, potc: null };
}

function buildSubtitleUrl(
    track: YouTubeSubtitleCaptionTrack,
    playerData: YouTubeSubtitlePlayerData,
    potToken: PotToken
) {
    const url = new URL(track.baseUrl);

    Object.entries(FIXED_TIMEDTEXT_PARAMS).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    if (playerData.device) {
        const deviceParams = new URLSearchParams(playerData.device);
        DEVICE_PARAM_KEYS.forEach((key) => {
            const value = deviceParams.get(key);
            if (value) {
                url.searchParams.set(key, value);
            }
        });
    }

    if (playerData.cver) {
        url.searchParams.set('cver', playerData.cver);
    }

    if (potToken.pot) {
        url.searchParams.set('pot', potToken.pot);
    }

    if (potToken.potc) {
        url.searchParams.set('potc', potToken.potc);
    }

    return url.toString();
}

function selectTrack(playerData: YouTubeSubtitlePlayerData) {
    const tracks = playerData.captionTracks;
    if (tracks.length === 0) return null;

    if (playerData.selectedTrack.vssId) {
        const selectedById = tracks.find((track) => track.vssId === playerData.selectedTrack.vssId);
        if (selectedById) return selectedById;
    }

    if (playerData.selectedTrack.languageCode && playerData.selectedTrack.kind) {
        const selectedByLanguageAndKind = tracks.find((track) =>
            track.languageCode === playerData.selectedTrack.languageCode
            && (track.kind ?? null) === playerData.selectedTrack.kind
        );
        if (selectedByLanguageAndKind) return selectedByLanguageAndKind;
    }

    if (playerData.selectedTrack.languageCode) {
        const selectedByLanguage = tracks.find(
            (track) => track.languageCode === playerData.selectedTrack.languageCode
        );
        if (selectedByLanguage) return selectedByLanguage;
    }

    const humanExact = tracks.find((track) => track.kind !== 'asr' && !track.name?.simpleText);
    if (humanExact) return humanExact;

    const humanTrack = tracks.find((track) => track.kind !== 'asr');
    if (humanTrack) return humanTrack;

    const asrTrack = tracks.find((track) => track.kind === 'asr');
    if (asrTrack) return asrTrack;

    return tracks[0];
}

async function fetchTimedTextEvents(url: string, signal: AbortSignal) {
    const response = await fetch(url, {
        signal,
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error(`http:${response.status}`);
    }

    const payload = await response.json() as { events?: unknown };
    if (!isRecord(payload) || !Array.isArray(payload.events)) {
        return [];
    }

    return payload.events as YouTubeTimedText[];
}

export class YouTubeSubtitleOverlay implements Feature {
    private enabled = false;
    private config: YTSubtitleConfig = cloneYTSubtitleConfig(DEFAULT_SETTINGS.yt_subtitle);
    private language: I18nLang = DEFAULT_SETTINGS.language;

    private readonly videoCtrl = VideoController.getInstance();
    private readonly osd = OSD.getInstance();

    private syncTimer: number | null = null;
    private routePollTimer: number | null = null;
    private trackPollTimer: number | null = null;
    private rafId: number | null = null;
    private loadAbortController: AbortController | null = null;
    private loadSerial = 0;

    private currentVideoId = '';
    private currentTrackKey = '';
    private currentFragments: SubtitleFragment[] = [];
    private currentIndex = -1;
    private routeKey = '';
    private lastFallbackNoticeKey = '';

    private boundVideo: HTMLVideoElement | null = null;
    private unsubscribeVideo: (() => void) | null = null;

    private overlayRoot: HTMLDivElement | null = null;
    private overlayPositioner: HTMLDivElement | null = null;
    private overlayBox: HTMLDivElement | null = null;
    private overlayText: HTMLDivElement | null = null;
    private dragHandle: HTMLButtonElement | null = null;
    private nativeHidden = false;

    private dragState: DragState | null = null;
    private readonly importedFontLoadCache = new Map<string, Promise<boolean>>();
    private readonly importedFontFailureCache = new Set<string>();

    private readonly handleNavigationStart = () => {
        this.abortPendingLoad();
        this.stopRenderer();
        this.clearSubtitleState();
        this.renderSubtitleText('');
        this.showNativeSubtitles();
    };

    private readonly handleNavigationFinish = () => {
        this.scheduleSync(250);
    };

    private readonly handleVideoMutation = () => {
        this.renderAtCurrentTime(true);
        if (this.boundVideo && !this.boundVideo.paused) {
            this.startRenderer();
        }
    };

    private readonly handleVideoPlay = () => {
        this.renderAtCurrentTime(true);
        this.startRenderer();
    };

    private readonly handleVideoPause = () => {
        this.renderAtCurrentTime(true);
        this.stopRenderer();
    };

    private readonly handleDragMove = (event: MouseEvent) => {
        if (!this.dragState) return;

        const { startClientY, startPercent, height, anchor } = this.dragState;
        const deltaY = event.clientY - startClientY;
        const deltaPercent = (deltaY / Math.max(1, height)) * 100;
        const nextPercent = clamp(
            anchor === 'bottom' ? startPercent - deltaPercent : startPercent + deltaPercent,
            MIN_POSITION_PERCENT,
            MAX_POSITION_PERCENT
        );

        this.config = cloneYTSubtitleConfig({
            ...this.config,
            position: {
                ...this.config.position,
                percent: nextPercent
            }
        });
        this.applyOverlayPosition();
    };

    private readonly handleDragEnd = () => {
        if (!this.dragState) return;
        this.dragState = null;
        window.removeEventListener('mousemove', this.handleDragMove, true);
        window.removeEventListener('mouseup', this.handleDragEnd, true);
        void setSettings({
            yt_subtitle: cloneYTSubtitleConfig(this.config)
        });
    };

    mount() {
        if (!isSiteHost('youtube')) return;
        if (this.enabled) return;

        this.enabled = true;
        this.routeKey = this.getRouteKey();

        installYouTubeSubtitleOverlayBridge();
        this.unsubscribeVideo = this.videoCtrl.subscribe(() => {
            if (!this.enabled) return;
            this.rebindVideo(this.videoCtrl.video);
            this.scheduleSync(150);
        });

        window.addEventListener('popstate', this.handleNavigationFinish);
        document.addEventListener('yt-navigate-start', this.handleNavigationStart, true);
        document.addEventListener('yt-navigate-finish', this.handleNavigationFinish, true);

        this.routePollTimer = window.setInterval(() => {
            const nextRouteKey = this.getRouteKey();
            if (nextRouteKey === this.routeKey) return;
            this.routeKey = nextRouteKey;
            this.handleNavigationStart();
            this.scheduleSync(0);
        }, ROUTE_POLL_MS);

        this.trackPollTimer = window.setInterval(() => {
            void this.pollTrackChange();
        }, TRACK_POLL_MS);

        this.scheduleSync(0);
    }

    unmount() {
        this.enabled = false;

        if (this.syncTimer != null) {
            window.clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        if (this.routePollTimer != null) {
            window.clearInterval(this.routePollTimer);
            this.routePollTimer = null;
        }
        if (this.trackPollTimer != null) {
            window.clearInterval(this.trackPollTimer);
            this.trackPollTimer = null;
        }

        window.removeEventListener('popstate', this.handleNavigationFinish);
        document.removeEventListener('yt-navigate-start', this.handleNavigationStart, true);
        document.removeEventListener('yt-navigate-finish', this.handleNavigationFinish, true);

        this.abortPendingLoad();
        this.stopRenderer();
        this.rebindVideo(null);
        this.unsubscribeVideo?.();
        this.unsubscribeVideo = null;
        this.destroyOverlay();
        this.showNativeSubtitles();
        this.clearSubtitleState();
        this.loadSerial += 1;
        this.lastFallbackNoticeKey = '';
        this.routeKey = '';
    }

    updateSettings(settings: unknown) {
        const record = settings as Partial<Settings> | undefined;
        if (!record) return;

        if (record.yt_subtitle) {
            this.config = cloneYTSubtitleConfig(record.yt_subtitle);
        }

        if (typeof record.language === 'string') {
            this.language = record.language;
        }

        this.applyOverlayStyles();
        this.applyOverlayPosition();

        if (this.enabled) {
            this.scheduleSync(0);
        }
    }

    private scheduleSync(delay: number) {
        if (!this.enabled || !isSiteHost('youtube')) return;

        if (this.syncTimer != null) {
            window.clearTimeout(this.syncTimer);
        }

        this.syncTimer = window.setTimeout(() => {
            this.syncTimer = null;
            this.syncCurrentPage();
        }, delay);
    }

    private syncCurrentPage() {
        if (!this.enabled || !isSiteHost('youtube')) return;

        if (!this.isSupportedPage()) {
            this.handleNavigationStart();
            return;
        }

        installYouTubeSubtitleOverlayBridge();
        ensureYouTubeSubtitleOverlayScriptInjected();
        this.rebindVideo(this.videoCtrl.video);

        if (!this.ensureOverlayMounted()) {
            this.scheduleSync(250);
            return;
        }

        this.applyOverlayStyles();
        this.applyOverlayPosition();
        void this.loadSubtitlesForCurrentPage();
    }

    private async loadSubtitlesForCurrentPage(preloadedData?: YouTubeSubtitlePlayerData) {
        const expectedVideoId = this.getCurrentUrlVideoId();
        if (!expectedVideoId || !this.enabled || !this.isSupportedPage()) return;

        const video = this.videoCtrl.video;
        if (!video) {
            this.scheduleSync(250);
            return;
        }
        this.rebindVideo(video);

        const loadId = ++this.loadSerial;
        this.abortPendingLoad();
        const abortController = new AbortController();
        this.loadAbortController = abortController;

        try {
            let playerData: YouTubeSubtitlePlayerData | null = preloadedData ?? null;
            if (!playerData || playerData.videoId !== expectedVideoId) {
                playerData = await this.requestPlayerDataWithRetries(expectedVideoId, abortController.signal);
            }

            if (!playerData || !this.isLoadActive(loadId, abortController)) {
                return;
            }

            const missingSelection = !playerData.selectedTrack.languageCode && !playerData.selectedTrack.vssId;
            if (missingSelection && playerData.captionTracks.length > 0) {
                const ensuredData = await this.ensureSubtitlesEnabled(expectedVideoId, abortController.signal);
                if (ensuredData) {
                    playerData = ensuredData;
                }
            }

            let track = selectTrack(playerData);
            if (!track) {
                this.fallbackToNative(true);
                return;
            }

            const loaded = await this.fetchTrackWithFallback(track, playerData, abortController.signal);
            if (!this.isLoadActive(loadId, abortController)) {
                return;
            }

            track = loaded.track;
            playerData = loaded.playerData;

            if (loaded.fragments.length === 0) {
                this.fallbackToNative(true);
                return;
            }

            this.currentVideoId = playerData.videoId;
            this.currentTrackKey = buildTrackKey(playerData.videoId, track);
            this.currentFragments = loaded.fragments;
            this.currentIndex = -1;

            this.ensureOverlayMounted();
            this.hideNativeSubtitles();
            this.renderAtCurrentTime(true);
            this.startRenderer();
        } catch (error) {
            if (isAbortError(error)) return;
            this.fallbackToNative(true);
        } finally {
            if (this.loadAbortController === abortController) {
                this.loadAbortController = null;
            }
        }
    }

    private async fetchTrackWithFallback(
        track: YouTubeSubtitleCaptionTrack,
        playerData: YouTubeSubtitlePlayerData,
        signal: AbortSignal
    ) {
        try {
            return {
                track,
                playerData,
                fragments: await this.fetchTrackFragments(track, playerData, signal)
            };
        } catch (error) {
            if (!isHttpStatusError(error, 403)) {
                throw error;
            }

            const ensuredData = await this.ensureSubtitlesEnabled(playerData.videoId, signal);
            if (!ensuredData) {
                throw error;
            }

            const ensuredTrack = selectTrack(ensuredData);
            if (!ensuredTrack) {
                throw error;
            }

            return {
                track: ensuredTrack,
                playerData: ensuredData,
                fragments: await this.fetchTrackFragments(ensuredTrack, ensuredData, signal)
            };
        }
    }

    private async fetchTrackFragments(
        track: YouTubeSubtitleCaptionTrack,
        playerData: YouTubeSubtitlePlayerData,
        signal: AbortSignal
    ) {
        const url = buildSubtitleUrl(track, playerData, extractPotToken(track, playerData));
        const events = await fetchTimedTextEvents(url, signal);
        return parseYouTubeSubtitleEvents(events, track.languageCode);
    }

    private async requestPlayerDataWithRetries(expectedVideoId: string, signal: AbortSignal) {
        for (let attempt = 0; attempt < FETCH_RETRY_ATTEMPTS; attempt += 1) {
            if (signal.aborted) return null;

            const response = await requestYouTubeSubtitlePlayerData(expectedVideoId);
            if (response?.success && response.data?.videoId === expectedVideoId) {
                return response.data;
            }

            await sleep(FETCH_RETRY_DELAY_MS);
        }

        return null;
    }

    private async ensureSubtitlesEnabled(expectedVideoId: string, signal: AbortSignal) {
        if (signal.aborted) return null;

        await requestYouTubeSubtitleEnsureEnabled();
        return await this.requestPlayerDataWithRetries(expectedVideoId, signal);
    }

    private async pollTrackChange() {
        if (!this.enabled || !this.isSupportedPage()) return;
        if (this.loadAbortController) return;

        this.ensureOverlayMounted();
        this.applyOverlayPosition();

        const expectedVideoId = this.getCurrentUrlVideoId();
        if (!expectedVideoId) return;

        const response = await requestYouTubeSubtitlePlayerData(expectedVideoId);
        if (!response?.success || !response.data) return;

        const track = selectTrack(response.data);
        const nextTrackKey = track ? buildTrackKey(response.data.videoId, track) : '';

        if (
            response.data.videoId !== this.currentVideoId
            || nextTrackKey !== this.currentTrackKey
            || this.currentFragments.length === 0
        ) {
            void this.loadSubtitlesForCurrentPage(response.data);
        }
    }

    private startRenderer() {
        if (this.rafId != null) return;
        if (!this.boundVideo || this.boundVideo.paused || this.boundVideo.ended) return;

        const tick = () => {
            this.rafId = null;
            if (!this.enabled || !this.isSupportedPage()) return;

            this.renderAtCurrentTime();
            if (this.boundVideo && !this.boundVideo.paused && !this.boundVideo.ended) {
                this.rafId = window.requestAnimationFrame(tick);
            }
        };

        this.rafId = window.requestAnimationFrame(tick);
    }

    private stopRenderer() {
        if (this.rafId == null) return;
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
    }

    private renderAtCurrentTime(force = false) {
        if (!this.overlayText) return;
        if (!this.boundVideo || this.currentFragments.length === 0) {
            this.renderSubtitleText('');
            return;
        }

        const timeMs = this.boundVideo.currentTime * 1000;
        const nextIndex = this.resolveSubtitleIndexAt(timeMs);
        if (!force && nextIndex === this.currentIndex) return;

        this.currentIndex = nextIndex;
        const nextText = nextIndex >= 0 ? this.currentFragments[nextIndex].text : '';
        this.renderSubtitleText(nextText);
    }

    private resolveSubtitleIndexAt(timeMs: number) {
        const current = this.currentFragments[this.currentIndex];
        if (current && current.start <= timeMs && current.end > timeMs) {
            return this.currentIndex;
        }

        const next = this.currentFragments[this.currentIndex + 1];
        if (next && next.start <= timeMs && next.end > timeMs) {
            return this.currentIndex + 1;
        }

        const previous = this.currentFragments[this.currentIndex - 1];
        if (previous && previous.start <= timeMs && previous.end > timeMs) {
            return this.currentIndex - 1;
        }

        let left = 0;
        let right = this.currentFragments.length - 1;

        while (left <= right) {
            const middle = Math.floor((left + right) / 2);
            const fragment = this.currentFragments[middle];

            if (fragment.start <= timeMs && fragment.end > timeMs) {
                return middle;
            }

            if (fragment.start > timeMs) {
                right = middle - 1;
            } else {
                left = middle + 1;
            }
        }

        return -1;
    }

    private renderSubtitleText(text: string) {
        if (!this.overlayBox || !this.overlayText || !this.dragHandle) return;

        const shouldShow = Boolean(text.trim());
        this.overlayBox.style.display = shouldShow ? 'block' : 'none';
        this.dragHandle.style.display = shouldShow ? 'inline-flex' : 'none';

        if (this.overlayText.textContent !== text) {
            this.overlayText.textContent = text;
        }
    }

    private ensureOverlayMounted() {
        const player = this.playerRoot();
        if (!player) return null;

        if (window.getComputedStyle(player).position === 'static') {
            player.style.position = 'relative';
        }

        if (this.overlayRoot?.parentElement === player) {
            return this.overlayRoot;
        }

        this.destroyOverlay();

        const root = document.createElement('div');
        root.id = OVERLAY_ROOT_ID;
        root.dataset.vbYtSubtitleOverlay = '';
        root.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 9998;
            overflow: hidden;
        `;

        const positioner = document.createElement('div');
        positioner.style.cssText = `
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            width: min(86%, 960px);
            pointer-events: none;
        `;

        const handle = document.createElement('button');
        handle.type = 'button';
        handle.dataset.vbYtSubtitleDragHandle = '';
        handle.setAttribute('aria-label', 'Drag subtitle position');
        handle.textContent = '⋯';
        handle.style.cssText = `
            display: none;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 20px;
            margin-bottom: 4px;
            border: 0;
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.72);
            color: rgba(255, 255, 255, 0.92);
            font-size: 14px;
            line-height: 1;
            cursor: grab;
            pointer-events: auto;
            user-select: none;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        `;
        handle.addEventListener('mousedown', (event) => this.handleDragStart(event));

        const box = document.createElement('div');
        box.style.cssText = `
            display: none;
            max-width: 100%;
            padding: 6px 10px;
            border-radius: 10px;
            pointer-events: auto;
            user-select: text;
            cursor: text;
            box-sizing: border-box;
            text-align: center;
            white-space: pre-wrap;
            word-break: break-word;
        `;
        box.dir = 'auto';

        const text = document.createElement('div');
        text.style.cssText = `
            white-space: pre-wrap;
            word-break: break-word;
        `;

        box.appendChild(text);
        positioner.appendChild(handle);
        positioner.appendChild(box);
        root.appendChild(positioner);
        player.appendChild(root);

        markInteractionRoot(positioner);
        this.overlayRoot = root;
        this.overlayPositioner = positioner;
        this.overlayBox = box;
        this.overlayText = text;
        this.dragHandle = handle;
        this.applyOverlayStyles();
        this.applyOverlayPosition();
        this.renderSubtitleText('');
        return root;
    }

    private destroyOverlay() {
        if (this.dragState) {
            this.handleDragEnd();
        }

        this.overlayRoot?.remove();
        this.overlayRoot = null;
        this.overlayPositioner = null;
        this.overlayBox = null;
        this.overlayText = null;
        this.dragHandle = null;
    }

    private async ensureImportedFontLoaded(fontId: string) {
        const normalizedId = fontId.trim();
        if (!normalizedId || this.importedFontFailureCache.has(normalizedId)) {
            return false;
        }

        const faceName = buildSubtitleImportedFontFaceName(normalizedId);
        if (!faceName || typeof FontFace !== 'function' || !document.fonts) {
            return false;
        }

        let loadPromise = this.importedFontLoadCache.get(normalizedId);
        if (!loadPromise) {
            loadPromise = runtimeSendMessage<SubtitleFontAssetGetResponse>({
                type: 'VB_YT_SUBTITLE_FONT_GET',
                fontId: normalizedId
            }).then(async (response) => {
                if (!response?.ok) {
                    throw new Error(response?.error || 'font_unavailable');
                }

                const face = new FontFace(
                    faceName,
                    subtitleFontBase64ToArrayBuffer(response.font.bufferBase64)
                );
                await face.load();
                document.fonts.add(face);
                return true;
            }).catch(() => {
                this.importedFontFailureCache.add(normalizedId);
                return false;
            });

            this.importedFontLoadCache.set(normalizedId, loadPromise);
        }

        const loaded = await loadPromise;
        if (!loaded) return false;
        if (!this.overlayBox) return false;
        if (this.config.style.fontFamilyPreset !== 'imported') return true;
        if (this.config.style.importedFontId !== normalizedId) return true;

        this.overlayBox.style.fontFamily = buildSubtitleImportedFontFamily(normalizedId);
        return true;
    }

    private applyOverlayStyles() {
        if (!this.overlayBox || !this.overlayText || !this.dragHandle) return;

        const style = this.config.style;
        const fontScale = Math.max(40, style.fontScale);
        const fontSize = Math.max(16, Math.round((BASE_FONT_SIZE_PX * fontScale) / 100));
        const fontWeight = clamp(style.fontWeight, 100, 900);
        const textOpacity = clamp(style.textOpacity, 0, 100) / 100;
        const backgroundOpacity = clamp(style.backgroundOpacity, 0, 100) / 100;
        const borderRadius = clamp(style.borderRadius, 0, 20);
        const fontFamily = resolveSubtitleFontFamily(style);

        this.overlayBox.style.background = toRgbaColor(
            style.backgroundColor,
            backgroundOpacity,
            DEFAULT_SETTINGS.yt_subtitle.style.backgroundColor
        );
        this.overlayBox.style.fontSize = `${fontSize}px`;
        this.overlayBox.style.fontFamily = fontFamily;
        this.overlayBox.style.lineHeight = '1.35';
        this.overlayBox.style.borderRadius = `${borderRadius}px`;
        this.overlayBox.style.backdropFilter = backgroundOpacity > 0 ? 'blur(2px)' : 'none';
        this.overlayText.style.color = toRgbaColor(
            style.color,
            textOpacity,
            DEFAULT_SETTINGS.yt_subtitle.style.color
        );
        this.overlayText.style.textShadow = buildSubtitleTextShadow(style);
        this.overlayText.style.fontWeight = `${fontWeight}`;
        this.overlayText.style.fontVariantCaps =
            style.fontFamilyPreset === 'small-caps' ? 'small-caps' : 'normal';
        this.overlayText.style.letterSpacing =
            style.fontFamilyPreset === 'small-caps' ? '0.04em' : 'normal';
        this.dragHandle.style.background = `rgba(0, 0, 0, ${Math.max(0.52, backgroundOpacity).toFixed(2)})`;

        if (style.fontFamilyPreset === 'imported' && style.importedFontId) {
            void this.ensureImportedFontLoaded(style.importedFontId);
        }
    }

    private applyOverlayPosition() {
        if (!this.overlayPositioner) return;

        const percent = clamp(this.config.position.percent, MIN_POSITION_PERCENT, MAX_POSITION_PERCENT);
        if (this.config.position.anchor === 'top') {
            this.overlayPositioner.style.top = `${percent}%`;
            this.overlayPositioner.style.bottom = '';
        } else {
            this.overlayPositioner.style.bottom = `${percent}%`;
            this.overlayPositioner.style.top = '';
        }
    }

    private hideNativeSubtitles() {
        if (this.nativeHidden) return;
        if (document.getElementById(NATIVE_STYLE_ID)) {
            this.nativeHidden = true;
            return;
        }

        const style = document.createElement('style');
        style.id = NATIVE_STYLE_ID;
        style.textContent = `
            .ytp-caption-window-container,
            .ytp-caption-window-container * {
                display: none !important;
                opacity: 0 !important;
                visibility: hidden !important;
            }
        `;
        document.head.appendChild(style);
        this.nativeHidden = true;
    }

    private showNativeSubtitles() {
        if (!this.nativeHidden) return;
        document.getElementById(NATIVE_STYLE_ID)?.remove();
        this.nativeHidden = false;
    }

    private handleDragStart(event: MouseEvent) {
        if (!this.overlayPositioner) return;

        const player = this.playerRoot();
        if (!player) return;

        event.preventDefault();
        const rect = player.getBoundingClientRect();
        this.dragState = {
            startClientY: event.clientY,
            startPercent: clamp(this.config.position.percent, MIN_POSITION_PERCENT, MAX_POSITION_PERCENT),
            height: rect.height,
            anchor: this.config.position.anchor
        };

        window.addEventListener('mousemove', this.handleDragMove, true);
        window.addEventListener('mouseup', this.handleDragEnd, true);
    }

    private rebindVideo(video: HTMLVideoElement | null) {
        if (this.boundVideo === video) return;

        if (this.boundVideo) {
            this.boundVideo.removeEventListener('play', this.handleVideoPlay);
            this.boundVideo.removeEventListener('pause', this.handleVideoPause);
            this.boundVideo.removeEventListener('seeking', this.handleVideoMutation);
            this.boundVideo.removeEventListener('seeked', this.handleVideoMutation);
            this.boundVideo.removeEventListener('ratechange', this.handleVideoMutation);
            this.boundVideo.removeEventListener('timeupdate', this.handleVideoMutation);
        }

        this.boundVideo = video;
        if (!this.boundVideo) return;

        this.boundVideo.addEventListener('play', this.handleVideoPlay);
        this.boundVideo.addEventListener('pause', this.handleVideoPause);
        this.boundVideo.addEventListener('seeking', this.handleVideoMutation);
        this.boundVideo.addEventListener('seeked', this.handleVideoMutation);
        this.boundVideo.addEventListener('ratechange', this.handleVideoMutation);
        this.boundVideo.addEventListener('timeupdate', this.handleVideoMutation);
    }

    private isLoadActive(loadId: number, controller: AbortController) {
        return this.enabled && this.loadSerial === loadId && this.loadAbortController === controller && !controller.signal.aborted;
    }

    private abortPendingLoad() {
        this.loadAbortController?.abort();
        this.loadAbortController = null;
    }

    private fallbackToNative(showNotice: boolean) {
        this.stopRenderer();
        this.clearSubtitleState();
        this.renderSubtitleText('');
        this.showNativeSubtitles();

        if (!showNotice) return;

        const noticeKey = `${this.getRouteKey()}|${this.getCurrentUrlVideoId()}`;
        if (noticeKey === this.lastFallbackNoticeKey) return;

        this.lastFallbackNoticeKey = noticeKey;
        this.osd.show(i18n('yt_subtitle_native_fallback', this.language), this.videoCtrl.video || undefined);
    }

    private clearSubtitleState() {
        this.currentVideoId = '';
        this.currentTrackKey = '';
        this.currentFragments = [];
        this.currentIndex = -1;
    }

    private isSupportedPage() {
        return window.location.pathname === '/watch' && Boolean(this.getCurrentUrlVideoId());
    }

    private getCurrentUrlVideoId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('v')?.trim() || '';
    }

    private getRouteKey() {
        return `${window.location.pathname}|${window.location.search}`;
    }

    private playerRoot() {
        return document.getElementById('movie_player')
            || document.querySelector<HTMLElement>('ytd-player #movie_player')
            || document.querySelector<HTMLElement>('#movie_player');
    }
}
