import { describe, it, expect, beforeEach, vi } from 'vitest';
import { load, save, reset, watch } from '../../core/storage';

describe('SubtitleStorage', () => {
  beforeEach(() => {
    // Mock chrome.storage.sync
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn()
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn()
        }
      }
    } as any;
  });

  describe('load', () => {
    it('should return default config when storage is empty', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({});

      const config = await load();

      expect(config).toEqual({
        enabled: false,
        position: 10,
        fontSize: 100,
        color: '#FFFFFF',
        backgroundColor: '#000000',
        opacity: 75,
        outlined: true
      });
    });

    it('should merge stored config with defaults', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        vb_subtitle_config: {
          enabled: true,
          fontSize: 120
        }
      });

      const config = await load();

      expect(config.enabled).toBe(true);
      expect(config.fontSize).toBe(120);
      expect(config.position).toBe(10); // default
    });

    it('should return defaults on error', async () => {
      vi.mocked(chrome.storage.sync.get).mockRejectedValue(new Error('Storage error'));

      const config = await load();

      expect(config).toEqual({
        enabled: false,
        position: 10,
        fontSize: 100,
        color: '#FFFFFF',
        backgroundColor: '#000000',
        opacity: 75,
        outlined: true
      });
    });
  });

  describe('save', () => {
    it('should merge partial config with existing values', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({
        vb_subtitle_config: {
          enabled: true,
          position: 20,
          fontSize: 100,
          color: '#FFFFFF',
          backgroundColor: '#000000',
          opacity: 75,
          outlined: true
        }
      });
      vi.mocked(chrome.storage.sync.set).mockResolvedValue(undefined);

      await save({ fontSize: 150, color: '#FF0000' });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        vb_subtitle_config: {
          enabled: true,
          position: 20,
          fontSize: 150,
          color: '#FF0000',
          backgroundColor: '#000000',
          opacity: 75,
          outlined: true
        }
      });
    });

    it('should throw error on storage failure', async () => {
      vi.mocked(chrome.storage.sync.get).mockResolvedValue({});
      vi.mocked(chrome.storage.sync.set).mockRejectedValue(new Error('Storage error'));

      await expect(save({ enabled: true })).rejects.toThrow('Storage error');
    });
  });

  describe('reset', () => {
    it('should restore default configuration', async () => {
      vi.mocked(chrome.storage.sync.set).mockResolvedValue(undefined);

      await reset();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        vb_subtitle_config: {
          enabled: false,
          position: 10,
          fontSize: 100,
          color: '#FFFFFF',
          backgroundColor: '#000000',
          opacity: 75,
          outlined: true
        }
      });
    });
  });

  describe('watch', () => {
    it('should call callback on config change', () => {
      const callback = vi.fn();
      const unwatch = watch(callback);

      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];

      listener(
        {
          vb_subtitle_config: {
            newValue: { enabled: true, fontSize: 120 },
            oldValue: { enabled: false, fontSize: 100 }
          }
        },
        'sync'
      );

      expect(callback).toHaveBeenCalledWith({
        enabled: true,
        fontSize: 120
      });

      unwatch();
      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
    });

    it('should only call callback for changed keys', () => {
      const callback = vi.fn();
      watch(callback);

      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];

      listener(
        {
          vb_subtitle_config: {
            newValue: { enabled: true, fontSize: 100, color: '#FFFFFF' },
            oldValue: { enabled: false, fontSize: 100, color: '#FFFFFF' }
          }
        },
        'sync'
      );

      expect(callback).toHaveBeenCalledWith({
        enabled: true
      });
    });

    it('should ignore changes from other storage areas', () => {
      const callback = vi.fn();
      watch(callback);

      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];

      listener(
        {
          vb_subtitle_config: {
            newValue: { enabled: true },
            oldValue: { enabled: false }
          }
        },
        'local'
      );

      expect(callback).not.toHaveBeenCalled();
    });

    it('should ignore changes to other keys', () => {
      const callback = vi.fn();
      watch(callback);

      const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];

      listener(
        {
          other_key: {
            newValue: { value: 'new' },
            oldValue: { value: 'old' }
          }
        },
        'sync'
      );

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
