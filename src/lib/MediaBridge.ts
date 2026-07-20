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

function parseStatePayload(payload: Record<string, unknown> | null): MediaKernelStatePayload | null {
  if (!payload) return null;
  if (typeof payload.hasVideo !== 'boolean') return null;
  if (typeof payload.rate !== 'number' || !Number.isFinite(payload.rate)) return null;
  if (typeof payload.escalated !== 'boolean') return null;
  return {
    hasVideo: payload.hasVideo,
    rate: payload.rate,
    escalated: payload.escalated,
    mode: normalizeH5CompatMode(payload.mode)
  };
}

export class MediaBridge {
  private static instance: MediaBridge | null = null;

  private pending = new Map<string, PendingEntry>();
  private kernelReady = false;
  private lastState: MediaKernelStatePayload | null = null;
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
      this.kernelReady = true;
    }

    if (type === 'state' || type === 'pong') {
      const state = parseStatePayload(payload);
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

  async ensureReady(timeoutMs: number = ENSURE_READY_TIMEOUT_MS): Promise<boolean> {
    if (this.kernelReady) return true;
    const res = await this.request('ping', {}, timeoutMs);
    this.kernelReady = Boolean(res);
    return this.kernelReady;
  }

  configure(payload: MediaKernelConfigurePayload): void {
    void this.request(
      'configure',
      payload as unknown as Record<string, unknown>,
      CONFIGURE_TIMEOUT_MS
    );
  }

  async setPlaybackRate(rate: number): Promise<boolean> {
    const res = await this.request('setPlaybackRate', { rate }, COMMAND_TIMEOUT_MS);
    if (!res) return false;
    if (res.ok === false) return false;
    return true;
  }

  async seek(deltaSec: number): Promise<boolean> {
    const res = await this.request('seek', { deltaSec }, COMMAND_TIMEOUT_MS);
    if (!res) return false;
    if (res.ok === false) return false;
    return true;
  }

  async getState(): Promise<MediaKernelStatePayload | null> {
    const res = await this.request('getState', {}, COMMAND_TIMEOUT_MS);
    const state = parseStatePayload(res);
    if (state) this.lastState = state;
    return state;
  }
}
