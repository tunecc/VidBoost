/**
 * Subtitle renderer - integrates UI components with controller and storage
 * Manages Shadow DOM lifecycle and config synchronization
 */

import SubtitleContainer from '../components/SubtitleContainer.svelte';
import { ShadowHostBuilder } from '../components/shadow-host';
import type { SubtitleFragment } from '../utils/types';
import type { SubtitleController } from './controller';
import type { SubtitleConfig } from './storage';
import themeCSS from '../styles/theme.css?inline';

export type RendererOptions = {
  controller: SubtitleController;
  videoElement: HTMLVideoElement;
  config: SubtitleConfig;
};

/**
 * Main subtitle renderer - manages Svelte component in Shadow DOM
 */
export class SubtitleRenderer {
  private hostElement: HTMLElement | null = null;
  private shadowBuilder: ShadowHostBuilder | null = null;
  private controller: SubtitleController;
  private videoElement: HTMLVideoElement;
  private config: SubtitleConfig;
  private updateTimer: number | null = null;
  private isDestroyed = false;

  constructor(options: RendererOptions) {
    this.controller = options.controller;
    this.videoElement = options.videoElement;
    this.config = options.config;
  }

  /**
   * Render subtitles - create Shadow DOM and mount Svelte component
   */
  render(): void {
    if (this.isDestroyed) {
      throw new Error('Cannot render destroyed renderer');
    }

    if (this.hostElement) {
      console.warn('[SubtitleRenderer] Already rendered');
      return;
    }

    // Create host element
    this.hostElement = this.createHostElement();

    // Create Shadow DOM and mount component
    this.shadowBuilder = ShadowHostBuilder.create();

    this.shadowBuilder
      .mount(
        SubtitleContainer,
        this.buildComponentProps(),
        this.hostElement
      )
      .withStyles(themeCSS);

    // Start syncing with video
    this.startSync();

    console.log('[SubtitleRenderer] Rendered');
  }

  /**
   * Update component with new config or fragments
   */
  update(changes?: Partial<SubtitleConfig>): void {
    if (this.isDestroyed || !this.shadowBuilder) {
      return;
    }

    // Merge config changes
    if (changes) {
      this.config = { ...this.config, ...changes };
    }

    // Update Svelte component props
    const component = this.shadowBuilder.getComponent();
    if (component) {
      const props = this.buildComponentProps();
      component.$set(props);
    }
  }

  /**
   * Destroy renderer and clean up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.stopSync();

    if (this.shadowBuilder) {
      this.shadowBuilder.destroy();
      this.shadowBuilder = null;
    }

    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
      this.hostElement = null;
    }

    this.isDestroyed = true;
    console.log('[SubtitleRenderer] Destroyed');
  }

  /**
   * Check if renderer is active
   */
  isActive(): boolean {
    return !this.isDestroyed && this.hostElement !== null;
  }

  /**
   * Get current fragments from controller
   */
  getFragments(): SubtitleFragment[] {
    return this.controller.getFragments();
  }

  /**
   * Create host element for Shadow DOM
   */
  private createHostElement(): HTMLElement {
    const host = document.createElement('div');
    host.id = 'vidboost-subtitle-host';
    host.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    `;

    // Insert into video container
    const container = this.findVideoContainer();
    if (container) {
      container.appendChild(host);
    } else {
      throw new Error('Video container not found');
    }

    return host;
  }

  /**
   * Find video container for inserting subtitle overlay
   */
  private findVideoContainer(): HTMLElement | null {
    // Try YouTube-specific selectors
    const ytSelectors = [
      '.html5-video-container',
      '.ytp-player-content',
      '#movie_player'
    ];

    for (const selector of ytSelectors) {
      const container = document.querySelector(selector) as HTMLElement;
      if (container) {
        return container;
      }
    }

    // Fallback to video parent
    return this.videoElement.parentElement;
  }

  /**
   * Build component props from current state
   */
  private buildComponentProps() {
    const fragments = this.controller.getFragments();
    const currentTime = this.controller.getCurrentTime();

    return {
      fragments,
      currentTime,
      position: {
        anchor: 'bottom' as const,
        percent: this.config.position
      },
      fontSize: this.scaleFont(this.config.fontSize),
      color: this.config.color,
      backgroundColor: this.config.backgroundColor,
      opacity: this.config.opacity / 100,
      outlined: this.config.outlined,
      dragEnabled: true
    };
  }

  /**
   * Scale font size from config (0-200) to actual pixels (16-64)
   */
  private scaleFont(configSize: number): number {
    // Config range: 0-200, default 100
    // Output range: 16-64, default 32
    const min = 16;
    const max = 64;
    const normalized = configSize / 100; // 100 -> 1.0
    return min + (max - min) * (normalized / 2); // 100 -> 32
  }

  /**
   * Start syncing with video currentTime
   */
  private startSync(): void {
    this.stopSync();

    const sync = () => {
      if (this.isDestroyed) {
        return;
      }

      const currentTime = this.videoElement.currentTime * 1000; // Convert to ms
      this.controller.updateTime(currentTime);

      // Update component with new currentTime
      const component = this.shadowBuilder?.getComponent();
      if (component) {
        component.$set({ currentTime });
      }

      this.updateTimer = requestAnimationFrame(sync) as unknown as number;
    };

    this.updateTimer = requestAnimationFrame(sync) as unknown as number;
  }

  /**
   * Stop syncing with video
   */
  private stopSync(): void {
    if (this.updateTimer !== null) {
      cancelAnimationFrame(this.updateTimer);
      this.updateTimer = null;
    }
  }
}
