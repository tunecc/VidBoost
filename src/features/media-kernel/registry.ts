import { pickPrimaryVideo, type PrimaryVideoCandidate } from './pickPrimary';

const MIN_VISIBLE_EDGE = 16;

function isHtmlVideo(node: unknown): node is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && node instanceof HTMLVideoElement;
}

function isElementVisibleSize(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > MIN_VISIBLE_EDGE && rect.height > MIN_VISIBLE_EDGE;
}

function isVideoVisible(video: HTMLVideoElement): boolean {
  if (!video.isConnected) return false;
  if (!isElementVisibleSize(video)) return false;

  const checkVisibility = (
    video as HTMLElement & {
      checkVisibility?: (options?: {
        checkOpacity?: boolean;
        checkVisibilityCSS?: boolean;
      }) => boolean;
    }
  ).checkVisibility;

  if (typeof checkVisibility === 'function') {
    try {
      return checkVisibility.call(video, {
        checkOpacity: true,
        checkVisibilityCSS: true
      });
    } catch {
      // Some engines throw on detached or restricted nodes — fall through.
    }
  }

  return true;
}

/**
 * MAIN-world media registry: discover videos (open shadow only), pick primary.
 */
export class MediaRegistry {
  private videos = new Set<HTMLVideoElement>();
  private focusedBoost = new WeakMap<HTMLVideoElement, number>();
  private ids = new WeakMap<HTMLVideoElement, string>();
  private nextId = 0;

  private started = false;
  private mutationObserver: MutationObserver | null = null;
  private scanScheduled = false;

  private readonly onMediaEvent = (event: Event) => {
    const target = event.target;
    if (isHtmlVideo(target)) {
      this.register(target);
    }
  };

  private readonly onMutation = () => {
    this.scheduleScan();
  };

  start(): void {
    if (this.started) return;
    this.started = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('play', this.onMediaEvent, true);
      window.addEventListener('playing', this.onMediaEvent, true);
      window.addEventListener('loadedmetadata', this.onMediaEvent, true);
    }

    if (typeof document !== 'undefined' && document.documentElement) {
      try {
        this.mutationObserver = new MutationObserver(this.onMutation);
        this.mutationObserver.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
      } catch {
        this.mutationObserver = null;
      }
    }

    this.scanDocument();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('play', this.onMediaEvent, true);
      window.removeEventListener('playing', this.onMediaEvent, true);
      window.removeEventListener('loadedmetadata', this.onMediaEvent, true);
    }

    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.scanScheduled = false;
    this.videos.clear();
  }

  register(el: HTMLVideoElement): void {
    if (!isHtmlVideo(el)) return;
    this.videos.add(el);
    this.ensureId(el);
  }

  getPrimary(): HTMLVideoElement | null {
    this.pruneDisconnected();

    const candidates: PrimaryVideoCandidate[] = [];
    const byId = new Map<string, HTMLVideoElement>();

    for (const video of this.videos) {
      if (!video.isConnected) continue;
      const id = this.ensureId(video);
      const rect = video.getBoundingClientRect();
      const candidate: PrimaryVideoCandidate = {
        id,
        width: rect.width,
        height: rect.height,
        paused: Boolean(video.paused),
        ended: Boolean(video.ended),
        visible: isVideoVisible(video),
        focusedBoost: this.focusedBoost.get(video) ?? 0
      };
      candidates.push(candidate);
      byId.set(id, video);
    }

    // If registry empty, attempt a live scan (SPA / late mount).
    if (candidates.length === 0) {
      this.scanDocument();
      for (const video of this.videos) {
        if (!video.isConnected) continue;
        const id = this.ensureId(video);
        if (byId.has(id)) continue;
        const rect = video.getBoundingClientRect();
        candidates.push({
          id,
          width: rect.width,
          height: rect.height,
          paused: Boolean(video.paused),
          ended: Boolean(video.ended),
          visible: isVideoVisible(video),
          focusedBoost: this.focusedBoost.get(video) ?? 0
        });
        byId.set(id, video);
      }
    }

    const picked = pickPrimaryVideo(candidates);
    if (!picked) return null;
    return byId.get(picked.id) ?? null;
  }

  /**
   * Boost a video near the focused / interacted element so pickPrimary prefers it.
   */
  noteUserFocus(el: Element | null): void {
    if (!el || typeof Element === 'undefined' || !(el instanceof Element)) return;

    // Direct video target (or video ancestor — rare but cheap).
    let node: Element | null = el;
    while (node) {
      if (isHtmlVideo(node)) {
        this.boost(node);
        return;
      }
      node = node.parentElement;
    }

    // Prefer a registered video that contains the focus target or shares a host.
    let host: Element | null = el;
    while (host) {
      for (const video of this.videos) {
        if (!video.isConnected) continue;
        try {
          if (video === host || video.contains(el) || host.contains(video)) {
            this.boost(video);
            return;
          }
        } catch {
          // Cross-root contains can throw in odd trees — skip.
        }
      }
      host = host.parentElement;
    }

    // Last resort: scan open shadow + light DOM under focus root for a video.
    const root = el.getRootNode?.() ?? document;
    const found = this.collectVideosFromNode(root instanceof Node ? root : document);
    if (found.length === 1) {
      this.boost(found[0]!);
    } else if (found.length > 1) {
      // Prefer closest common ancestor path: largest visible near focus.
      let best: HTMLVideoElement | null = null;
      let bestArea = -1;
      for (const video of found) {
        const rect = video.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = video;
        }
      }
      if (best) this.boost(best);
    }
  }

  private boost(video: HTMLVideoElement): void {
    this.register(video);
    const prev = this.focusedBoost.get(video) ?? 0;
    this.focusedBoost.set(video, prev + 1);
  }

  private ensureId(video: HTMLVideoElement): string {
    let id = this.ids.get(video);
    if (!id) {
      this.nextId += 1;
      id = `v${this.nextId}`;
      this.ids.set(video, id);
    }
    return id;
  }

  private pruneDisconnected(): void {
    for (const video of [...this.videos]) {
      if (!video.isConnected) {
        this.videos.delete(video);
      }
    }
  }

  private scheduleScan(): void {
    if (this.scanScheduled) return;
    this.scanScheduled = true;
    const run = () => {
      this.scanScheduled = false;
      this.scanDocument();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  private scanDocument(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement ?? document;
    for (const video of this.collectVideosFromNode(root)) {
      this.register(video);
    }
    this.pruneDisconnected();
  }

  /** Open-shadow-aware video walk (no attachShadow monkey-patch). */
  private collectVideosFromNode(root: Node): HTMLVideoElement[] {
    const visited = new Set<Node>();
    const out: HTMLVideoElement[] = [];
    const stack: Node[] = [root];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);

      if (isHtmlVideo(node)) {
        out.push(node);
      }

      if (node instanceof Element && node.shadowRoot) {
        stack.push(node.shadowRoot);
      }

      const children = node.childNodes;
      for (let i = 0; i < children.length; i += 1) {
        stack.push(children[i]!);
      }
    }

    return out;
  }
}
