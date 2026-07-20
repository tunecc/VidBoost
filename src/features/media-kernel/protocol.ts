export const MEDIA_KERNEL_CHANNEL = 'vidboost:media-kernel' as const;
export const MEDIA_KERNEL_ISOLATED_SOURCE = 'vidboost-media-kernel-isolated' as const;
export const MEDIA_KERNEL_PAGE_SOURCE = 'vidboost-media-kernel-page' as const;
export const MEDIA_KERNEL_PROTOCOL_VERSION = 1 as const;

export type H5CompatMode = 'safe' | 'compat' | 'strict';

export type MediaKernelCommandType =
  | 'ping'
  | 'configure'
  | 'setPlaybackRate'
  | 'seek'
  | 'getState';

export type MediaKernelEventType =
  | 'pong'
  | 'ack'
  | 'state'
  | 'kernel-ready';

export type MediaKernelConfigurePayload = {
  mode: H5CompatMode;
  stickyMs: number;
  maxRate: number;
  rateEpsilon: number;
  ownsRate: boolean;
  enabled: boolean;
};

export type MediaKernelStatePayload = {
  hasVideo: boolean;
  rate: number;
  escalated: boolean;
  mode: H5CompatMode;
};

export type MediaKernelToPage = {
  source: typeof MEDIA_KERNEL_ISOLATED_SOURCE;
  channel: typeof MEDIA_KERNEL_CHANNEL;
  version: typeof MEDIA_KERNEL_PROTOCOL_VERSION;
  type: MediaKernelCommandType;
  reqId?: string;
  payload?: Record<string, unknown>;
};

export type MediaKernelToIsolated = {
  source: typeof MEDIA_KERNEL_PAGE_SOURCE;
  channel: typeof MEDIA_KERNEL_CHANNEL;
  version: typeof MEDIA_KERNEL_PROTOCOL_VERSION;
  type: MediaKernelEventType;
  reqId?: string;
  payload?: Record<string, unknown>;
};

export function normalizeH5CompatMode(
  value: unknown,
  fallback: H5CompatMode = 'compat'
): H5CompatMode {
  if (value === 'safe' || value === 'compat' || value === 'strict') return value;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function isMediaKernelEnvelope(
  data: unknown,
  expectedSource: string
): data is Record<string, unknown> {
  if (!isRecord(data)) return false;
  if (data.source !== expectedSource) return false;
  if (data.channel !== MEDIA_KERNEL_CHANNEL) return false;
  if (data.version !== MEDIA_KERNEL_PROTOCOL_VERSION) return false;
  if (typeof data.type !== 'string' || !data.type) return false;
  return true;
}

export function buildIsolatedMessage(
  type: MediaKernelCommandType,
  reqId: string,
  payload?: Record<string, unknown>
) {
  return {
    source: MEDIA_KERNEL_ISOLATED_SOURCE,
    channel: MEDIA_KERNEL_CHANNEL,
    version: MEDIA_KERNEL_PROTOCOL_VERSION,
    type,
    reqId,
    payload: payload ?? {}
  };
}

export function buildPageMessage(
  type: MediaKernelEventType,
  reqId: string | undefined,
  payload?: Record<string, unknown>
) {
  return {
    source: MEDIA_KERNEL_PAGE_SOURCE,
    channel: MEDIA_KERNEL_CHANNEL,
    version: MEDIA_KERNEL_PROTOCOL_VERSION,
    type,
    reqId,
    payload: payload ?? {}
  };
}
