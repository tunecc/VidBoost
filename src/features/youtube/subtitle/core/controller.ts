import { SubtitleFetcher } from './fetcher';
import type { SubtitleResult } from './fetcher';
import type { CaptionTrack, SubtitleFragment } from '../utils/types';

export type ControllerState = 'idle' | 'loading' | 'ready' | 'error';

export type ControllerEvents = {
  stateChange: (state: ControllerState) => void;
  trackChange: (track: CaptionTrack | null) => void;
  fragmentChange: (fragment: SubtitleFragment | null) => void;
  error: (error: Error) => void;
};

/**
 * Main subtitle controller - coordinates fetcher, cache, and state
 */
export class SubtitleController {
  private fetcher: SubtitleFetcher;
  private state: ControllerState = 'idle';
  private currentTrack: CaptionTrack | null = null;
  private fragments: SubtitleFragment[] = [];
  private currentTime: number = 0;
  private currentFragmentIndex: number = -1;
  private videoId: string = '';
  private playerData: any = null;
  private listeners = new Map<keyof ControllerEvents, Set<Function>>();

  constructor(fetcher?: SubtitleFetcher) {
    this.fetcher = fetcher || new SubtitleFetcher();
  }

  /**
   * Initialize controller with video context
   */
  async initialize(videoId: string, playerData?: any): Promise<void> {
    this.videoId = videoId;
    this.playerData = playerData;
    this.setState('idle');
  }

  /**
   * Set and load new track
   */
  async setTrack(track: CaptionTrack | null): Promise<void> {
    if (!track) {
      this.clearTrack();
      return;
    }

    // Skip if same track
    if (this.currentTrack?.vssId === track.vssId) {
      return;
    }

    this.setState('loading');
    this.currentTrack = track;
    this.emit('trackChange', track);

    try {
      const result = await this.fetcher.fetchWithFallback(
        this.videoId,
        track,
        this.playerData
      );

      this.fragments = result.fragments;
      this.currentFragmentIndex = -1;
      this.setState('ready');

      // Update fragment for current time
      this.updateTime(this.currentTime);
    } catch (error) {
      this.setState('error');
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update current time and find active fragment
   */
  updateTime(timeMs: number): void {
    this.currentTime = timeMs;

    if (this.state !== 'ready' || this.fragments.length === 0) {
      return;
    }

    const index = this.findFragmentIndex(timeMs);

    if (index !== this.currentFragmentIndex) {
      this.currentFragmentIndex = index;
      const fragment = index >= 0 ? this.fragments[index] : null;
      this.emit('fragmentChange', fragment);
    }
  }

  /**
   * Get current fragment at current time
   */
  getCurrentFragment(): SubtitleFragment | null {
    if (this.currentFragmentIndex < 0 || this.currentFragmentIndex >= this.fragments.length) {
      return null;
    }
    return this.fragments[this.currentFragmentIndex];
  }

  /**
   * Get fragment at specific time
   */
  getFragmentAt(timeMs: number): SubtitleFragment | null {
    const index = this.findFragmentIndex(timeMs);
    return index >= 0 ? this.fragments[index] : null;
  }

  /**
   * Binary search for fragment index at given time
   */
  private findFragmentIndex(timeMs: number): number {
    if (this.fragments.length === 0) {
      return -1;
    }

    let left = 0;
    let right = this.fragments.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const fragment = this.fragments[mid];

      if (timeMs >= fragment.start && timeMs < fragment.end) {
        return mid;
      }

      if (timeMs < fragment.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
        // Track last fragment we've passed
        if (timeMs >= fragment.start) {
          result = mid;
        }
      }
    }

    // Return last valid fragment if we're past it
    return result;
  }

  /**
   * Get all fragments
   */
  getFragments(): SubtitleFragment[] {
    return this.fragments;
  }

  /**
   * Get current track
   */
  getCurrentTrack(): CaptionTrack | null {
    return this.currentTrack;
  }

  /**
   * Get current state
   */
  getState(): ControllerState {
    return this.state;
  }

  /**
   * Get current time
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Clear current track and fragments
   */
  clearTrack(): void {
    this.currentTrack = null;
    this.fragments = [];
    this.currentFragmentIndex = -1;
    this.setState('idle');
    this.emit('trackChange', null);
    this.emit('fragmentChange', null);
  }

  /**
   * Event listener management
   */
  on<K extends keyof ControllerEvents>(event: K, listener: ControllerEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof ControllerEvents>(event: K, listener: ControllerEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  private emit<K extends keyof ControllerEvents>(
    event: K,
    ...args: Parameters<ControllerEvents[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach(listener => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Update state and emit event
   */
  private setState(state: ControllerState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }

  /**
   * Clean up and destroy controller
   */
  destroy(): void {
    this.clearTrack();
    this.listeners.clear();
    this.fetcher.clearCache();
    this.videoId = '';
    this.playerData = null;
  }
}
