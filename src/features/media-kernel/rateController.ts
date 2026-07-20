import type { H5CompatMode, MediaKernelConfigurePayload } from './protocol';
import { normalizeH5CompatMode } from './protocol';
import {
  clampReconcileCount,
  DEFAULT_RATE_EPSILON,
  DEFAULT_RECONCILE_CAP,
  DEFAULT_STICKY_MS,
  shouldReconcileRate
} from './stickyPolicy';

const DEFAULT_MAX_RATE = 16;
const MIN_RATE = 0.0625;

type PropDesc = PropertyDescriptor | undefined;

function clampRate(rate: number, maxRate: number): number {
  if (!Number.isFinite(rate)) return 1;
  const hi = Number.isFinite(maxRate) && maxRate > 0 ? maxRate : DEFAULT_MAX_RATE;
  return Math.min(hi, Math.max(MIN_RATE, rate));
}

/**
 * MAIN-world rate control: write via captured native descriptors + L1 sticky.
 * Does not install Object.defineProperty hooks (L3 out of scope).
 *
 * Sticky lifecycle end reasons (video gone, primary switch, reconcile cap, control lost)
 * invoke `stickyEndHandler` (typically Escalator.disarm) so L2 arm stays in sync.
 * Strategy for primary change: end sticky + disarm (换片 ends L2); do not retarget.
 */
export class RateController {
  private readonly playbackRateDesc: PropDesc;
  private readonly defaultPlaybackRateDesc: PropDesc;
  private readonly currentTimeDesc: PropDesc;

  private targetRate = 1;
  private stickyUntil = 0;
  private continuousSticky = false;
  private reconcileCount = 0;
  private mode: H5CompatMode = 'compat';
  private ownsRate = true;
  private enabled = true;
  private stickyMs = DEFAULT_STICKY_MS;
  private epsilon = DEFAULT_RATE_EPSILON;
  private maxRate = DEFAULT_MAX_RATE;
  private reconcileCap = DEFAULT_RECONCILE_CAP;

  private activeVideo: HTMLVideoElement | null = null;
  private applyingDepth = 0;
  private tickHandle = 0;

  /** Resolves current registry primary (for sticky primary-switch detection). */
  private primaryResolver: (() => HTMLVideoElement | null) | null = null;
  /**
   * Called when sticky lifecycle ends for control-loss reasons.
   * Wired to Escalator.disarm (armed=false + clearSticky).
   * Must be idempotent and safe if it re-enters clearSticky.
   */
  private stickyEndHandler: (() => void) | null = null;

  constructor() {
    const proto =
      typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : null;
    this.playbackRateDesc = proto
      ? Object.getOwnPropertyDescriptor(proto, 'playbackRate')
      : undefined;
    this.defaultPlaybackRateDesc = proto
      ? Object.getOwnPropertyDescriptor(proto, 'defaultPlaybackRate')
      : undefined;
    this.currentTimeDesc = proto
      ? Object.getOwnPropertyDescriptor(proto, 'currentTime')
      : undefined;
  }

  /**
   * Wire primary resolver + sticky-end handler (Escalator.disarm).
   * Called once from page boot.
   */
  wireLifecycle(options: {
    resolvePrimary?: () => HTMLVideoElement | null;
    onStickyEnd?: () => void;
  }): void {
    this.primaryResolver = options.resolvePrimary ?? null;
    this.stickyEndHandler = options.onStickyEnd ?? null;
  }

  applyConfigure(cfg: MediaKernelConfigurePayload): void {
    this.mode = normalizeH5CompatMode(cfg.mode);
    this.stickyMs =
      typeof cfg.stickyMs === 'number' && Number.isFinite(cfg.stickyMs) && cfg.stickyMs >= 0
        ? cfg.stickyMs
        : DEFAULT_STICKY_MS;
    this.maxRate =
      typeof cfg.maxRate === 'number' && Number.isFinite(cfg.maxRate) && cfg.maxRate > 0
        ? cfg.maxRate
        : DEFAULT_MAX_RATE;
    this.epsilon =
      typeof cfg.rateEpsilon === 'number' &&
      Number.isFinite(cfg.rateEpsilon) &&
      cfg.rateEpsilon >= 0
        ? cfg.rateEpsilon
        : DEFAULT_RATE_EPSILON;
    this.ownsRate = Boolean(cfg.ownsRate);
    this.enabled = Boolean(cfg.enabled);

    if (!this.canControlRate()) {
      // Control lost: clear sticky locally; page also calls Escalator.disarm.
      this.clearSticky();
    } else if (this.mode === 'compat' && this.continuousSticky) {
      // Leaving continuous arm when mode is no longer strict.
      this.continuousSticky = false;
      if (this.stickyUntil === Number.POSITIVE_INFINITY) {
        this.stickyUntil = Date.now() + this.stickyMs;
      }
    } else if (this.mode !== 'strict') {
      this.continuousSticky = false;
    }
  }

  /** Whether MAIN kernel is allowed to own playbackRate. */
  canControlRate(): boolean {
    return this.enabled && this.ownsRate && this.mode !== 'safe';
  }

  getMode(): H5CompatMode {
    return this.mode;
  }

  getOwnsRate(): boolean {
    return this.ownsRate;
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  getTargetRate(): number {
    return this.targetRate;
  }

  getReconcileCount(): number {
    return this.reconcileCount;
  }

  /** Active sticky target video (for primary-switch checks). */
  getActiveVideo(): HTMLVideoElement | null {
    return this.activeVideo;
  }

  isStickyActive(): boolean {
    if (!this.canControlRate()) return false;
    if (this.continuousSticky) return true;
    return Date.now() < this.stickyUntil;
  }

  /**
   * Arm continuous sticky (strict / Escalator). No-op when ownsRate is false.
   */
  armContinuousSticky(): void {
    if (!this.canControlRate()) return;
    this.continuousSticky = true;
    this.stickyUntil = Number.POSITIVE_INFINITY;
    this.scheduleTick();
  }

  setPlaybackRate(video: HTMLVideoElement, rate: number): boolean {
    if (!this.canControlRate()) return false;
    if (!video || typeof HTMLVideoElement === 'undefined' || !(video instanceof HTMLVideoElement)) {
      return false;
    }
    if (!this.playbackRateDesc?.set) return false;

    const clamped = clampRate(rate, this.maxRate);
    try {
      this.applyingDepth += 1;
      try {
        this.defaultPlaybackRateDesc?.set?.call(video, clamped);
      } catch {
        // defaultPlaybackRate is best-effort
      }
      this.playbackRateDesc.set.call(video, clamped);
      this.targetRate = clamped;
      this.activeVideo = video;
      this.reconcileCount = 0;

      if (this.mode === 'strict') {
        this.continuousSticky = true;
        this.stickyUntil = Number.POSITIVE_INFINITY;
      } else if (this.mode === 'compat') {
        this.continuousSticky = false;
        this.stickyUntil = Date.now() + this.stickyMs;
      } else {
        this.clearSticky();
        return true;
      }

      this.scheduleTick();
      return true;
    } catch {
      return false;
    } finally {
      this.applyingDepth -= 1;
    }
  }

  seek(video: HTMLVideoElement, deltaSec: number): boolean {
    if (!video || typeof HTMLVideoElement === 'undefined' || !(video instanceof HTMLVideoElement)) {
      return false;
    }
    if (!Number.isFinite(deltaSec)) return false;

    try {
      const current =
        typeof this.currentTimeDesc?.get === 'function'
          ? Number(this.currentTimeDesc.get.call(video))
          : Number(video.currentTime);
      const base = Number.isFinite(current) ? current : 0;
      const next = Math.max(0, base + deltaSec);

      if (typeof this.currentTimeDesc?.set === 'function') {
        this.currentTimeDesc.set.call(video, next);
      } else {
        video.currentTime = next;
      }
      return true;
    } catch {
      return false;
    }
  }

  getNativeRate(video: HTMLVideoElement): number {
    if (!video) return 1;
    try {
      if (typeof this.playbackRateDesc?.get === 'function') {
        const value = Number(this.playbackRateDesc.get.call(video));
        return Number.isFinite(value) ? value : 1;
      }
      const value = Number(video.playbackRate);
      return Number.isFinite(value) ? value : 1;
    } catch {
      return 1;
    }
  }

  /**
   * L1 reconcile on ratechange when sticky window (or continuous) is active.
   */
  onRateChange(video: HTMLVideoElement): void {
    if (this.applyingDepth > 0) return;
    if (!this.isStickyActive()) return;
    if (!video || this.activeVideo !== video) return;
    this.reconcileVideo(video);
  }

  /**
   * Optional rAF/interval reconcile while sticky is active.
   * Ends sticky + notifies Escalator on detach or primary switch (换片).
   */
  tick(): void {
    if (!this.isStickyActive()) {
      this.stopTick();
      return;
    }

    const video = this.activeVideo;
    if (!video || !video.isConnected) {
      this.endStickyLifecycle();
      return;
    }

    // Primary switched while sticky on old video → end sticky + disarm (do not retarget).
    if (this.primaryResolver) {
      try {
        const primary = this.primaryResolver();
        if (primary && primary !== video) {
          this.endStickyLifecycle();
          return;
        }
      } catch {
        // Resolver failures should not keep a stale sticky loop running forever.
      }
    }

    this.reconcileVideo(video);
  }

  clearSticky(): void {
    this.stickyUntil = 0;
    this.continuousSticky = false;
    this.reconcileCount = 0;
    this.stopTick();
  }

  /**
   * End sticky and notify Escalator (disarm armed).
   * Handler is expected to call clearSticky (idempotent).
   */
  private endStickyLifecycle(): void {
    if (this.stickyEndHandler) {
      try {
        this.stickyEndHandler();
      } catch {
        this.clearSticky();
      }
    } else {
      this.clearSticky();
    }
  }

  private reconcileVideo(video: HTMLVideoElement): void {
    if (!this.canControlRate()) return;
    if (!this.playbackRateDesc?.set) return;

    const actual = this.getNativeRate(video);
    if (!shouldReconcileRate(actual, this.targetRate, this.epsilon)) return;

    const nextCount = clampReconcileCount(this.reconcileCount + 1, this.reconcileCap);
    if (nextCount <= this.reconcileCount) {
      // Hit cap — stop sticky and disarm Escalator to avoid a death loop.
      this.endStickyLifecycle();
      return;
    }
    this.reconcileCount = nextCount;

    try {
      this.applyingDepth += 1;
      try {
        this.defaultPlaybackRateDesc?.set?.call(video, this.targetRate);
      } catch {
        // best-effort
      }
      this.playbackRateDesc.set.call(video, this.targetRate);
    } catch {
      // ignore write failures; sticky may expire naturally
    } finally {
      this.applyingDepth -= 1;
    }
  }

  private scheduleTick(): void {
    if (this.tickHandle) return;

    // Throttled reconcile: continuous (strict) ~100ms, windowed sticky ~50ms + ratechange.
    const intervalMs = this.continuousSticky ? 100 : 50;
    const step = () => {
      this.tickHandle = 0;
      this.tick();
      if (this.isStickyActive()) {
        this.tickHandle = setTimeout(step, intervalMs) as unknown as number;
      }
    };
    this.tickHandle = setTimeout(step, intervalMs) as unknown as number;
  }

  private stopTick(): void {
    if (!this.tickHandle) return;
    clearTimeout(this.tickHandle);
    this.tickHandle = 0;
  }
}
