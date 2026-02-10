/**
 * Video Controller & Detector
 * Encapsulates the logic for finding and controlling video elements.
 * Handles Shadow DOM traversal.
 */

import { getFullscreenSelectorForHost } from './siteProfiles';

export class VideoController {
    private static instance: VideoController;
    private currentVideo: HTMLVideoElement | null = null;
    private observer: MutationObserver | null = null;
    private readyObserver: MutationObserver | null = null;

    // Callbacks
    private onVideoFound: ((video: HTMLVideoElement) => void)[] = [];

    private constructor() {
        this.init();
    }

    public static getInstance(): VideoController {
        if (!VideoController.instance) {
            VideoController.instance = new VideoController();
        }
        return VideoController.instance;
    }

    private init() {
        if (typeof window === 'undefined') return;

        // Use capture phase playback detection to catch videos that start playing
        window.addEventListener('play', this.handlePlay.bind(this), { capture: true });

        // Also listen for other events that might indicate a new active video
        window.addEventListener('timeupdate', this.handlePlay.bind(this), { capture: true });

        this.startScanWhenReady();
    }

    private isVisibleVideo(v: HTMLVideoElement): boolean {
        const rect = v.getBoundingClientRect();
        return rect.width > 10 && rect.height > 10;
    }

    private pickBestVideo(videos: HTMLVideoElement[]): HTMLVideoElement | null {
        const visible = videos.filter(v => this.isVisibleVideo(v));
        if (visible.length === 0) return null;

        const playing = visible.filter(v => !v.paused && !v.ended);
        const pool = playing.length > 0 ? playing : visible;

        return pool.reduce((best, v) => {
            const b = best.getBoundingClientRect();
            const r = v.getBoundingClientRect();
            const bArea = b.width * b.height;
            const vArea = r.width * r.height;
            return vArea > bArea ? v : best;
        });
    }

    private startScanWhenReady() {
        if (document.body) {
            this.scan();
            return;
        }

        if (this.readyObserver) return;
        this.readyObserver = new MutationObserver(() => {
            if (!document.body) return;
            this.readyObserver?.disconnect();
            this.readyObserver = null;
            this.scan();
        });

        this.readyObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    private collectVideosFromNode(root: Node): HTMLVideoElement[] {
        const visited = new Set<Node>();
        const out: HTMLVideoElement[] = [];
        const stack: Node[] = [root];

        while (stack.length > 0) {
            const node = stack.pop()!;
            if (visited.has(node)) continue;
            visited.add(node);

            if (node instanceof HTMLVideoElement) {
                out.push(node);
            }

            if (node instanceof Element && node.shadowRoot) {
                stack.push(node.shadowRoot);
            }

            node.childNodes.forEach((child) => stack.push(child));
        }

        return Array.from(new Set(out));
    }

    private handlePlay(e: Event) {
        const target = e.target;
        if (target instanceof HTMLVideoElement) {
            this.setVideo(target);
        }
    }

    private scan() {
        if (!document.body) return;

        const list = this.collectVideosFromNode(document.body);
        const best = this.pickBestVideo(list);
        if (best) this.setVideo(best);

        // Start observing for SPA changes or lazy loadings
        if (!this.observer) {
            this.observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    // Check added nodes
                    for (const node of mutation.addedNodes) {
                        const candidates = this.collectVideosFromNode(node);

                        if (candidates.length > 0) {
                            const best = this.pickBestVideo(candidates);
                            if (best) this.setVideo(best);
                        }
                    }
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    private setVideo(video: HTMLVideoElement) {
        if (this.currentVideo === video) return;

        // console.log('[VideoController] Target video acquired', video);
        this.currentVideo = video;

        // Notify subscribers
        this.onVideoFound.forEach(cb => cb(video));
    }

    public subscribe(callback: (video: HTMLVideoElement) => void) {
        this.onVideoFound.push(callback);
        if (this.currentVideo) {
            callback(this.currentVideo);
        }
    }

    /**
     * Get the active video element.
     * Includes logic to recovery from stale references.
     */
    public get video(): HTMLVideoElement | null {
        // 1. If we have a video and it's connected, return it.
        if (this.currentVideo && this.currentVideo.isConnected) {
            return this.currentVideo;
        }

        // 2. If valid but not connected, try to find a new one immediately.
        // Fallback: Find the best visible video (prefer playing, then largest)
        if (!document.body) return null;
        const allVideos = this.collectVideosFromNode(document.body);
        const best = this.pickBestVideo(allVideos);
        if (best) {
            this.setVideo(best);
            return best;
        }

        // 3. No video found
        return null;
    }

    public togglePlay() {
        const v = this.video;
        if (!v) return;
        if (v.paused) this.swallowPromise(v.play());
        else v.pause();
    }

    public setSpeed(rate: number) {
        const v = this.video;
        if (!v) return;
        v.playbackRate = rate;
    }

    public seek(seconds: number) {
        const v = this.video;
        if (!v) return false;
        v.currentTime += seconds;
        return true;
    }

    private swallowPromise(result: void | Promise<unknown>) {
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
            (result as Promise<unknown>).catch(() => {
                // Ignore expected gesture-gated or transient promise rejections.
            });
        }
    }

    public toggleFullscreen() {
        const v = this.video;
        if (!v) return;

        // 1. Try Site-Specific Controls First (Parity with original script)
        if (this.trySiteSpecificFullscreen()) return;

        // 2. Standard Logic
        if (document.fullscreenElement) {
            this.swallowPromise(document.exitFullscreen());
        } else {
            // Try container first (better UI preservation)
            const container = this.getContainer(v);
            if (container.requestFullscreen) {
                try {
                    this.swallowPromise(container.requestFullscreen());
                } catch {
                    // Ignore sync failures from unsupported or blocked fullscreen requests.
                }
            } else {
                const webkitVideo = v as HTMLVideoElement & {
                    webkitEnterFullscreen?: () => void;
                };
                if (webkitVideo.webkitEnterFullscreen) {
                    try {
                        webkitVideo.webkitEnterFullscreen();
                    } catch {
                        // Ignore legacy fullscreen errors.
                    }
                }
            }
        }
    }

    /**
     * Smart Container Detection (from original script logic-ish)
     * Finds a parent that roughly matches video aspect ratio/size to include controls.
     */
    private getContainer(player: HTMLVideoElement): HTMLElement {
        let container: HTMLElement = player;
        let parent = player.parentElement;

        // Scan up to 3 levels
        for (let i = 0; i < 3; i++) {
            if (!parent || parent.tagName === 'BODY') break;
            const pRect = parent.getBoundingClientRect();
            const vRect = player.getBoundingClientRect();

            // If parent is not drastically larger than video (e.g. wrapper), use it.
            // Original logic: width <= vRect.width * 1.5
            if (pRect.width <= vRect.width * 1.5 && pRect.height <= vRect.height * 1.5) {
                container = parent;
            }
            parent = parent.parentElement;
        }
        return container;
    }

    private trySiteSpecificFullscreen(): boolean {
        const selector = getFullscreenSelectorForHost(window.location.host);

        if (selector) {
            const btn = document.querySelector(selector) as HTMLElement;
            if (btn) {
                btn.click();
                return true;
            }
        }
        return false;
    }
}
