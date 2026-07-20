/**
 * MAIN-world media kernel entry (IIFE side-effect).
 * Responds to isolated-world commands via window.postMessage.
 */
import {
  buildPageMessage,
  isMediaKernelEnvelope,
  MEDIA_KERNEL_ISOLATED_SOURCE,
  MEDIA_KERNEL_PROTOCOL_VERSION,
  normalizeH5CompatMode,
  type H5CompatMode,
  type MediaKernelConfigurePayload,
  type MediaKernelStatePayload
} from './protocol';
import {
  DEFAULT_RATE_EPSILON,
  DEFAULT_STICKY_MS
} from './stickyPolicy';
import { Escalator } from './escalator';
import { MediaRegistry } from './registry';
import { RateController } from './rateController';

const DEFAULT_MAX_RATE = 16;

function postToIsolated(msg: ReturnType<typeof buildPageMessage>): void {
  try {
    const origin =
      typeof window.location?.origin === 'string' && window.location.origin === 'null'
        ? '*'
        : window.location.origin;
    window.postMessage(msg, origin);
  } catch {
    window.postMessage(msg, '*');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function parseConfigure(payload: Record<string, unknown> | undefined): MediaKernelConfigurePayload {
  const src = payload ?? {};
  return {
    mode: normalizeH5CompatMode(src.mode),
    stickyMs:
      typeof src.stickyMs === 'number' && Number.isFinite(src.stickyMs)
        ? src.stickyMs
        : DEFAULT_STICKY_MS,
    maxRate:
      typeof src.maxRate === 'number' && Number.isFinite(src.maxRate) && src.maxRate > 0
        ? src.maxRate
        : DEFAULT_MAX_RATE,
    rateEpsilon:
      typeof src.rateEpsilon === 'number' && Number.isFinite(src.rateEpsilon)
        ? src.rateEpsilon
        : DEFAULT_RATE_EPSILON,
    ownsRate: src.ownsRate !== false,
    enabled: src.enabled !== false
  };
}

function readRate(payload: Record<string, unknown> | undefined): number | null {
  if (!payload) return null;
  const rate = payload.rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  return rate;
}

function readDeltaSec(payload: Record<string, unknown> | undefined): number | null {
  if (!payload) return null;
  const delta = payload.deltaSec;
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null;
  return delta;
}

(() => {
  const g = window as unknown as Record<string, unknown>;
  const BOOT = '__VB_MEDIA_KERNEL__';
  if (g[BOOT]) return;
  g[BOOT] = true;

  const registry = new MediaRegistry();
  const rateController = new RateController();
  const escalator = new Escalator(rateController);
  registry.start();

  const buildState = (): MediaKernelStatePayload => {
    const primary = registry.getPrimary();
    if (!primary) {
      if (escalator.shouldStaySticky()) {
        escalator.onVideoGone();
      }
      return {
        hasVideo: false,
        rate: 1,
        escalated: false,
        mode: rateController.getMode()
      };
    }
    return {
      hasVideo: true,
      rate: rateController.getNativeRate(primary),
      escalated: escalator.isEscalated(),
      mode: rateController.getMode()
    };
  };

  // Capture ratechange for L1 reconcile (no prototype hook).
  window.addEventListener(
    'ratechange',
    (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLVideoElement) {
        rateController.onRateChange(target);
      }
    },
    true
  );

  // Soft focus boost: pointerdown / focusin near a video.
  const noteFocus = (event: Event) => {
    const target = event.target;
    if (target instanceof Element) {
      registry.noteUserFocus(target);
    }
  };
  window.addEventListener('pointerdown', noteFocus, true);
  window.addEventListener('focusin', noteFocus, true);

  postToIsolated(
    buildPageMessage('kernel-ready', undefined, {
      version: MEDIA_KERNEL_PROTOCOL_VERSION
    })
  );

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isMediaKernelEnvelope(event.data, MEDIA_KERNEL_ISOLATED_SOURCE)) return;

    const data = event.data as {
      type: string;
      reqId?: string;
      payload?: Record<string, unknown>;
    };
    const type = data.type;
    const reqId = typeof data.reqId === 'string' ? data.reqId : undefined;
    const payload = isRecord(data.payload) ? data.payload : undefined;

    switch (type) {
      case 'ping': {
        const state = buildState();
        postToIsolated(
          buildPageMessage('pong', reqId, {
            hasVideo: state.hasVideo,
            rate: state.rate,
            ok: true
          })
        );
        return;
      }

      case 'configure': {
        const cfg = parseConfigure(payload);
        rateController.applyConfigure(cfg);
        escalator.setMode(cfg.mode);
        if (!cfg.enabled || !cfg.ownsRate || cfg.mode === 'safe') {
          rateController.clearSticky();
        }
        postToIsolated(
          buildPageMessage('ack', reqId, {
            ok: true,
            mode: cfg.mode,
            ownsRate: cfg.ownsRate,
            enabled: cfg.enabled
          })
        );
        return;
      }

      case 'setPlaybackRate': {
        const mode: H5CompatMode = rateController.getMode();
        if (!rateController.getOwnsRate()) {
          postToIsolated(
            buildPageMessage('ack', reqId, {
              ok: false,
              reason: 'owns-rate-false'
            })
          );
          return;
        }
        if (mode === 'safe' || !rateController.getEnabled()) {
          postToIsolated(
            buildPageMessage('ack', reqId, {
              ok: false,
              reason: mode === 'safe' ? 'mode-safe' : 'disabled'
            })
          );
          return;
        }

        const rate = readRate(payload);
        if (rate === null) {
          postToIsolated(
            buildPageMessage('ack', reqId, {
              ok: false,
              reason: 'invalid-rate'
            })
          );
          return;
        }

        const primary = registry.getPrimary();
        if (!primary) {
          escalator.onVideoGone();
          postToIsolated(
            buildPageMessage('ack', reqId, {
              ok: false,
              reason: 'no-video'
            })
          );
          return;
        }

        const ok = rateController.setPlaybackRate(primary, rate);
        if (ok) {
          escalator.onUserSetRate(rate);
        }
        postToIsolated(
          buildPageMessage('ack', reqId, {
            ok,
            reason: ok ? undefined : 'set-failed',
            rate: ok ? rateController.getNativeRate(primary) : undefined
          })
        );
        return;
      }

      case 'seek': {
        const deltaSec = readDeltaSec(payload);
        if (deltaSec === null) {
          postToIsolated(
            buildPageMessage('ack', reqId, {
              ok: false,
              reason: 'invalid-delta'
            })
          );
          return;
        }

        const primary = registry.getPrimary();
        if (!primary) {
          postToIsolated(
            buildPageMessage('ack', reqId, {
              ok: false,
              reason: 'no-video'
            })
          );
          return;
        }

        const ok = rateController.seek(primary, deltaSec);
        postToIsolated(
          buildPageMessage('ack', reqId, {
            ok,
            reason: ok ? undefined : 'seek-failed'
          })
        );
        return;
      }

      case 'getState': {
        const state = buildState();
        postToIsolated(buildPageMessage('state', reqId, { ...state }));
        return;
      }

      default: {
        postToIsolated(
          buildPageMessage('ack', reqId, {
            ok: false,
            reason: 'unknown-type'
          })
        );
      }
    }
  });
})();
