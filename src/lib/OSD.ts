export class OSD {
    private static instance: OSD;
    private element: HTMLDivElement;
    private timer: number | null = null;
    private currentContainer: HTMLElement | null = null;

    private constructor() {
        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: absolute;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            font-weight: 700;
            line-height: 1;
            padding: 3px 6px;
            background: rgba(12, 14, 18, 0.62);
            border: 1px solid rgba(255, 255, 255, 0.14);
            color: #fff;
            top: 15px;
            left: 15px;
            transition: opacity 0.3s ease, margin-top 0.3s ease;
            opacity: 0;
            border-radius: 12px;
            width: max-content;
            pointer-events: none;
            backdrop-filter: blur(6px) saturate(115%);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16), 0 1px 2px rgba(0, 0, 0, 0.12);
            text-shadow: none;
            display: none;
        `;
    }

    public static getInstance(): OSD {
        if (!OSD.instance) {
            OSD.instance = new OSD();
        }
        return OSD.instance;
    }

    public show(text: string, referenceVideo?: HTMLVideoElement) {
        // 1. Determine container (Fullscreen element OR Video's parent)
        // Original logic: tipsDiv.style.top = rect.top;
        // BUT if we append to body, we need absolute page coords.
        // If we in fullscreen, we MUST append to fullscreen element.

        const webkitFullscreenElement = (document as Document & {
            webkitFullscreenElement?: Element | null;
        }).webkitFullscreenElement;
        const fsElement = document.fullscreenElement || webkitFullscreenElement;

        let container = document.body;
        let diffTop = 0;
        let diffLeft = 0;

        // If fullscreen, the container IS the fs element.
        if (fsElement && fsElement instanceof HTMLElement) {
            container = fsElement;
        }

        if (!container) return; // Safety check

        try {
            // Mount if needed
            if (this.element.parentNode !== container) {
                container.appendChild(this.element);
                this.currentContainer = container;
            }
        } catch (e) {
            console.warn('[VideoTools] OSD Mount Failed:', e);
            return;
        }

        // Positioning
        if (referenceVideo) {
            const rect = referenceVideo.getBoundingClientRect();

            // If we are in fullscreen, the coords of the video might be relative to viewport
            // but our container is also the fullscreen element.
            // Usually in FS, top/left of video is 0,0 or close to it.

            // If NOT in fullscreen, we might be appending to BODY.
            // In that case, we need pageX/pageY (scrollY + rect.top).

            let top = 0;
            let left = 0;

            if (fsElement) {
                // Determine video position RELATIVE to fsElement
                // If fsElement is the video itself, then 0,0
                if (fsElement === referenceVideo) {
                    top = 0;
                    left = 0;
                } else {
                    const cRect = container.getBoundingClientRect();
                    top = rect.top - cRect.top;
                    left = rect.left - cRect.left;
                }
            } else {
                // Absolute positioning on body
                top = window.scrollY + rect.top;
                left = window.scrollX + rect.left;
            }

            // Clamp to 0
            this.element.style.top = `${Math.max(0, top)}px`;
            this.element.style.left = `${Math.max(0, left)}px`;
        }

        this.element.innerText = text;
        this.element.style.display = 'block';

        // Animate
        requestAnimationFrame(() => {
            this.element.style.opacity = '1';
        });

        if (this.timer) clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            this.element.style.opacity = '0';
            this.timer = window.setTimeout(() => {
                this.element.style.display = 'none';
            }, 300);
        }, 800);
    }
}
