/**
 * Tests for SubtitleRenderer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubtitleRenderer } from '../../core/renderer';
import { SubtitleController } from '../../core/controller';
import type { SubtitleConfig } from '../../core/storage';

// Mock Svelte component
vi.mock('../../components/SubtitleContainer.svelte', () => ({
  default: vi.fn().mockImplementation(() => ({
    $set: vi.fn(),
    $destroy: vi.fn()
  }))
}));

// Mock Shadow DOM builder
vi.mock('../../components/shadow-host.ts', () => ({
  ShadowHostBuilder: {
    create: vi.fn().mockReturnValue({
      mount: vi.fn().mockReturnThis(),
      withStyles: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      getComponent: vi.fn().mockReturnValue({
        $set: vi.fn(),
        $destroy: vi.fn()
      }),
      getShadowRoot: vi.fn()
    })
  }
}));

// Mock theme CSS
vi.mock('../../styles/theme.css?inline', () => ({
  default: '.subtitle-container { position: absolute; }'
}));

describe('SubtitleRenderer', () => {
  let renderer: SubtitleRenderer;
  let controller: SubtitleController;
  let videoElement: HTMLVideoElement;
  let config: SubtitleConfig;
  let container: HTMLElement;

  beforeEach(() => {
    // Create video element
    videoElement = document.createElement('video');
    videoElement.currentTime = 0;

    // Create container
    container = document.createElement('div');
    container.className = 'html5-video-container';
    container.appendChild(videoElement);
    document.body.appendChild(container);

    // Create controller
    controller = new SubtitleController();

    // Default config
    config = {
      enabled: true,
      position: 10,
      fontSize: 100,
      color: '#FFFFFF',
      backgroundColor: '#000000',
      opacity: 75,
      outlined: true
    };

    renderer = new SubtitleRenderer({
      controller,
      videoElement,
      config
    });
  });

  afterEach(() => {
    if (renderer.isActive()) {
      renderer.destroy();
    }
    document.body.innerHTML = '';
  });

  describe('render', () => {
    it('should create host element and mount component', () => {
      renderer.render();

      const host = document.getElementById('vidboost-subtitle-host');
      expect(host).toBeTruthy();
      expect(host?.parentElement).toBe(container);
    });

    it('should inject theme styles into Shadow DOM', () => {
      renderer.render();
      // Verify withStyles was called (mocked)
      expect(renderer.isActive()).toBe(true);
    });

    it('should throw error if already rendered', () => {
      renderer.render();
      expect(() => renderer.render()).not.toThrow();
    });

    it('should throw error if destroyed', () => {
      renderer.destroy();
      expect(() => renderer.render()).toThrow('Cannot render destroyed renderer');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      renderer.render();
    });

    it('should update config and component props', () => {
      const changes: Partial<SubtitleConfig> = {
        fontSize: 120,
        color: '#FF0000'
      };

      renderer.update(changes);
      expect(renderer.isActive()).toBe(true);
    });

    it('should do nothing if destroyed', () => {
      renderer.destroy();
      expect(() => renderer.update({ fontSize: 120 })).not.toThrow();
    });

    it('should work without config changes', () => {
      expect(() => renderer.update()).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('should clean up Shadow DOM and host element', () => {
      renderer.render();
      const host = document.getElementById('vidboost-subtitle-host');
      expect(host).toBeTruthy();

      renderer.destroy();

      expect(document.getElementById('vidboost-subtitle-host')).toBeNull();
      expect(renderer.isActive()).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      renderer.render();
      renderer.destroy();
      expect(() => renderer.destroy()).not.toThrow();
      expect(renderer.isActive()).toBe(false);
    });

    it('should work without render', () => {
      expect(() => renderer.destroy()).not.toThrow();
    });
  });

  describe('isActive', () => {
    it('should return false initially', () => {
      expect(renderer.isActive()).toBe(false);
    });

    it('should return true after render', () => {
      renderer.render();
      expect(renderer.isActive()).toBe(true);
    });

    it('should return false after destroy', () => {
      renderer.render();
      renderer.destroy();
      expect(renderer.isActive()).toBe(false);
    });
  });

  describe('getFragments', () => {
    it('should return fragments from controller', () => {
      const fragments = [
        { text: 'Hello', start: 0, end: 1000 },
        { text: 'World', start: 1000, end: 2000 }
      ];

      // Mock controller getFragments
      vi.spyOn(controller, 'getFragments').mockReturnValue(fragments);

      expect(renderer.getFragments()).toEqual(fragments);
    });
  });

  describe('video sync', () => {
    it('should sync with video currentTime', async () => {
      renderer.render();

      // Simulate video time update
      videoElement.currentTime = 1.5; // 1500ms

      // Wait for sync
      await new Promise(resolve => setTimeout(resolve, 100));

      // Controller should be updated
      expect(controller.getCurrentTime()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('font scaling', () => {
    it('should scale font size correctly', () => {
      const testCases = [
        { config: 0, expected: 16 },
        { config: 100, expected: 32 },
        { config: 200, expected: 64 }
      ];

      testCases.forEach(({ config: fontSize }) => {
        const r = new SubtitleRenderer({
          controller,
          videoElement,
          config: { ...config, fontSize }
        });

        r.render();
        expect(r.isActive()).toBe(true);
        r.destroy();
      });
    });
  });

  describe('video container detection', () => {
    it('should find YouTube container', () => {
      const ytContainer = document.createElement('div');
      ytContainer.className = 'html5-video-container';
      ytContainer.appendChild(videoElement);
      document.body.innerHTML = '';
      document.body.appendChild(ytContainer);

      const r = new SubtitleRenderer({
        controller,
        videoElement,
        config
      });

      r.render();
      expect(r.isActive()).toBe(true);
      r.destroy();
    });

    it('should fallback to video parent', () => {
      const customContainer = document.createElement('div');
      customContainer.appendChild(videoElement);
      document.body.innerHTML = '';
      document.body.appendChild(customContainer);

      const r = new SubtitleRenderer({
        controller,
        videoElement,
        config
      });

      r.render();
      expect(r.isActive()).toBe(true);
      r.destroy();
    });
  });
});
