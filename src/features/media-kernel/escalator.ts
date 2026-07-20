import type { H5CompatMode } from './protocol';
import { normalizeH5CompatMode } from './protocol';
import type { RateController } from './rateController';

/**
 * L2 escalator: continuous sticky while mode is strict and ownsRate.
 * Does not install Object.defineProperty hooks (L3 out of scope).
 *
 * | mode   | sticky                                      |
 * |--------|---------------------------------------------|
 * | safe   | MAIN rate lock disabled (page / controller) |
 * | compat | stickyMs window via RateController          |
 * | strict | continuous until user change / disable / gone |
 *
 * Sticky lifecycle ends (control lost, video gone, primary switch, reconcile cap)
 * must call `disarm()` so `armed` and RateController sticky stay in sync.
 */
export class Escalator {
  private mode: H5CompatMode = 'compat';
  private armed = false;
  private lastUserRate: number | null = null;

  constructor(private readonly rateController: RateController) {}

  setMode(mode: H5CompatMode): void {
    const next = normalizeH5CompatMode(mode);
    const prev = this.mode;
    this.mode = next;

    if (next !== 'strict') {
      // Leaving strict always clears L2 arm.
      this.armed = false;
      // RateController owns the compat window; only clear continuous arm fully when control is lost.
      if (prev === 'strict') {
        if (
          next === 'safe' ||
          !this.rateController.getOwnsRate() ||
          !this.rateController.getEnabled()
        ) {
          this.rateController.clearSticky();
        }
      }
      return;
    }

    // Entering strict with an existing user target can re-arm if already sticky.
    if (this.armed && this.rateController.canControlRate()) {
      this.rateController.armContinuousSticky();
    }
  }

  /**
   * Unified disarm: clear L2 arm AND sticky window/continuous.
   * Used when control is lost, primary switches, video gone, or reconcile cap hits.
   */
  disarm(): void {
    this.armed = false;
    this.rateController.clearSticky();
  }

  /**
   * Called after a successful user-driven setPlaybackRate.
   */
  onUserSetRate(rate: number): void {
    if (!Number.isFinite(rate)) return;
    this.lastUserRate = rate;

    if (this.mode !== 'strict') {
      this.armed = false;
      return;
    }

    if (!this.rateController.canControlRate()) {
      this.armed = false;
      return;
    }

    this.armed = true;
    this.rateController.armContinuousSticky();
  }

  onVideoGone(): void {
    this.disarm();
  }

  /**
   * strict → true after user set until cleared (mode leave / video gone / disable).
   */
  shouldStaySticky(): boolean {
    if (this.mode !== 'strict') return false;
    if (!this.armed) return false;
    if (!this.rateController.canControlRate()) return false;
    return true;
  }

  getLastUserRate(): number | null {
    return this.lastUserRate;
  }

  /** Escalated signal for state payload (strict continuous sticky active). */
  isEscalated(): boolean {
    return this.shouldStaySticky();
  }
}
