/**
 * Isolated-world bridge to MAIN media-kernel via window.postMessage.
 * Never hangs: every request times out and resolves null.
 */

import {
  buildIsolatedMessage,
  isMediaKernelEnvelope,
  MEDIA_KERNEL_PAGE_SOURCE,
  type MediaKernelCommandType,
  type MediaKernelConfigurePayload,
  type MediaKernelStatePayload,
  normalizeH5CompatMode
} from '../features/media-kernel/protocol';

const DEFAULT_TIMEOUT_MS = 50;
const ENSURE_READY_TIMEOUT_MS = 80;
const CONFIGURE_TIMEOUT_MS = 100;
const COMMAND_TIMEOUT_MS = 80;

type PendingEntry = {
  resolve: (value: Record<string, unknown> | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export class MediaBridge {
  private static instance: MediaBridge | null = null;

  private pending = new Map<string, PendingEntry>();
  private kernelReady = false;
  private lastState: MediaKernelStatePayload | null = null;
  private lastConfigure: MediaKernelConfigurePayload | null = null;
  private listenerInstalled = false;

  private constructor() {
    this.installListener();
  }

  static getInstance(): MediaBridge {
    if (!MediaBridge.instance) {
      MediaBridge.instance = new MediaBridge();
    }
    return MediaBridge.instance;
  }

  get hasKernel(): boolean {
    return this.kernelReady;
  }

  get cachedState(): MediaKernelStatePayload | null {
    return this.lastState;
  }

  private installListener(): void {
    if (typeof window === 'undefined') return;
    if (this.listenerInstalled) return;
    window.addEventListener('message', this.onMessage);
    this.listenerInstalled = true;
  }

  private parseStatePayload(payload: Record<string, unknown> | null): MediaKernelStatePayload | null {
    if (!payload) return null;
    if (typeof payload.hasVideo !== 'boolean') return null;
    if (typeof payload.rate !== 'number' || !Number.isFinite(payload.rate)) return null;

    // pong may omit escalated/mode — fill defaults so presence/rate hints still work.
    const escalated = typeof payload.escalated === 'boolean' ? payload.escalated : false;
    const modeFallback = this.lastConfigure?.mode ?? 'compat';
    const mode = normalizeH5CompatMode(payload.mode, modeFallback);

    return {
      hasVideo: payload.hasVideo,
      rate: payload.rate,
      escalated,
      mode
    };
  }

  private reconfigureIfCached(): void {
    if (!this.lastConfigure) return;
    void this.request(
      'configure',
      this.lastConfigure as unknown as Record<string, unknown>,
      CONFIGURE_TIMEOUT_MS
    );
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    if (!isMediaKernelEnvelope(event.data, MEDIA_KERNEL_PAGE_SOURCE)) return;

    const data = event.data as {
      type: string;
      reqId?: string;
      payload?: Record<string, unknown>;
    };
    const type = data.type;
    const reqId = typeof data.reqId === 'string' ? data.reqId : undefined;
    const payload = isRecord(data.payload) ? data.payload : {};

    if (type === 'kernel-ready' || type === 'pong') {
      const wasReady = this.kernelReady;
      this.kernelReady = true;
      // Late boot: mount may have timed out before kernel was alive — re-push config.
      // Also re-push when first readiness arrives via pong (kernel-ready missed).
      if (type === 'kernel-ready' || !wasReady) {
        this.reconfigureIfCached();
      }
    }

    if (type === 'state' || type === 'pong') {
      const state = this.parseStatePayload(payload);
      if (state) this.lastState = state;
    }

    if (!reqId) return;
    const pending = this.pending.get(reqId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(reqId);
    pending.resolve(payload);
  };

  private request(
    type: MediaKernelCommandType,
    payload: Record<string, unknown> = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<Record<string, unknown> | null> {
    if (typeof window === 'undefined') {
      return Promise.resolve(null);
    }

    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const message = buildIsolatedMessage(type, reqId, payload);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        resolve(null);
      }, timeoutMs);

      this.pending.set(reqId, { resolve, timer });

      try {
        const origin =
          typeof window.location?.origin === 'string' && window.location.origin === 'null'
            ? '*'
            : window.location.origin;
        window.postMessage(message, origin);
      } catch {
        try {
          window.postMessage(message, '*');
        } catch {
          clearTimeout(timer);
          this.pending.delete(reqId);
          resolve(null);
        }
      }
    });
  }

  /**
   * Promote-only ready: never clear kernelReady after a successful ready
   * (kernel-ready / pong may race with a later ping timeout).
   */
  async ensureReady(timeoutMs: number = ENSURE_READY_TIMEOUT_MS): Promise<boolean> {
    if (this.kernelReady) return true;
    const res = await this.request('ping', {}, timeoutMs);
    if (res) this.kernelReady = true;
    return this.kernelReady;
  }

  configure(payload: MediaKernelConfigurePayload): void {
    this.lastConfigure = payload;
    void this.request(
      'configure',
      payload as unknown as Record<string, unknown>,
      CONFIGURE_TIMEOUT_MS
    );
  }

  async setPlaybackRate(rate: number): Promise<boolean> {
    const res = await this.request('setPlaybackRate', { rate }, COMMAND_TIMEOUT_MS);
    return Boolean(res && res.ok === true);
  }

  async seek(deltaSec: number): Promise<boolean> {
    const res = await this.request('seek', { deltaSec }, COMMAND_TIMEOUT_MS);
    return Boolean(res && res.ok === true);
  }

  async getState(): Promise<MediaKernelStatePayload | null> {
    const res = await this.request('getState', {}, COMMAND_TIMEOUT_MS);
    const state = this.parseStatePayload(res);
    if (state) this.lastState = state;
    return state;
  }
}
