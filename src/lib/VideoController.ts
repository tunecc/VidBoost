/**
 * Video Controller & Detector
 * Encapsulates the logic for finding and controlling video elements.
 * Handles Shadow DOM traversal.
 */

export class VideoController {
    private static instance: VideoController;
    private currentVideo: HTMLVideoElement | null = null;

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

        // Periodic check for existing videos (lazy check)
        this.scan();
    }

    /**
     * Recursively find video elements, penetrating Shadow DOMs.
     */
    private findVideoDeep(root: Node): HTMLVideoElement | null {
        if (root instanceof HTMLVideoElement) return root;

        // Check children
        if (root instanceof HTMLElement) {
            const v = root.querySelector('video');
            if (v) return v;
        }

        // Check Shadow Root
        if (root instanceof HTMLElement && root.shadowRoot) {
            const v = this.findVideoDeep(root.shadowRoot);
            if (v) return v;
        }

        return null;
    }

    private handlePlay(e: Event) {
        const target = e.target;
        if (target instanceof HTMLVideoElement) {
            this.setVideo(target);
        }
    }

    private observer: MutationObserver | null = null;

    private scan() {
        const v = this.findVideoDeep(document.body);
        if (v) this.setVideo(v);

        // Start observing for SPA changes or lazy loadings
        if (!this.observer) {
            this.observer = new MutationObserver((mutations) => {
                let found = false;
                for (const mutation of mutations) {
                    // Check added nodes
                    for (const node of mutation.addedNodes) {
                        const v = this.findVideoDeep(node);
                        if (v) {
                            this.setVideo(v);
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
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
        // Fallback: Find the largest visible video
        const allVideos = Array.from(document.querySelectorAll('video'));
        const visibleVideo = allVideos.find(v => {
            const rect = v.getBoundingClientRect();
            return rect.width > 10 && rect.height > 10;
        });

        if (visibleVideo) {
            this.setVideo(visibleVideo);
            return visibleVideo;
        }

        // 3. No video found
        return null;
    }

    public togglePlay() {
        const v = this.video;
        if (!v) return;
        if (v.paused) v.play();
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

    public toggleFullscreen() {
        const v = this.video;
        if (!v) return;

        // 1. Try Site-Specific Controls First (Parity with original script)
        if (this.trySiteSpecificFullscreen()) return;

        // 2. Standard Logic
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            // Try container first (better UI preservation)
            const container = this.getContainer(v);
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if ((v as any).webkitEnterFullscreen) {
                (v as any).webkitEnterFullscreen();
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
        const host = window.location.host;
        let selector = '';

        if (host.includes('bilibili.com')) selector = '.bpx-player-ctrl-full, .squirtle-video-fullscreen';
        else if (host.includes('youtube.com')) selector = '.ytp-fullscreen-button';
        else if (host.includes('iqiyi.com')) selector = '.iqp-btn-fullscreen';
        else if (host.includes('youku.com')) selector = '.control-fullscreen-icon';
        else if (host.includes('qq.com')) selector = 'txpdiv[data-report="window-fullscreen"]';

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
