/**
 * Persistent storage for subtitle configuration
 * Uses chrome.storage.sync for cross-device synchronization
 */

export type SubtitleConfig = {
  enabled: boolean;
  position: number;
  fontSize: number;
  color: string;
  backgroundColor: string;
  opacity: number;
  outlined: boolean;
};

export type SubtitleConfigKey = keyof SubtitleConfig;

const STORAGE_KEY = 'vb_subtitle_config';

const DEFAULT_CONFIG: SubtitleConfig = {
  enabled: false,
  position: 10,
  fontSize: 100,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  opacity: 75,
  outlined: true
};

/**
 * Load subtitle configuration from storage
 */
export async function load(): Promise<SubtitleConfig> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      return { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] };
    }
    return { ...DEFAULT_CONFIG };
  } catch (error) {
    console.error('[SubtitleStorage] Failed to load config:', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save subtitle configuration to storage
 */
export async function save(config: Partial<SubtitleConfig>): Promise<void> {
  try {
    const current = await load();
    const updated = { ...current, ...config };
    await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
  } catch (error) {
    console.error('[SubtitleStorage] Failed to save config:', error);
    throw error;
  }
}

/**
 * Reset configuration to defaults
 */
export async function reset(): Promise<void> {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: { ...DEFAULT_CONFIG } });
  } catch (error) {
    console.error('[SubtitleStorage] Failed to reset config:', error);
    throw error;
  }
}

/**
 * Watch for configuration changes
 */
export function watch(
  callback: (changes: Partial<SubtitleConfig>) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === 'sync' && changes[STORAGE_KEY]) {
      const newValue = changes[STORAGE_KEY].newValue as SubtitleConfig | undefined;
      const oldValue = changes[STORAGE_KEY].oldValue as SubtitleConfig | undefined;

      if (newValue) {
        const changedKeys: Partial<SubtitleConfig> = {};
        (Object.keys(newValue) as SubtitleConfigKey[]).forEach((key) => {
          if (!oldValue || newValue[key] !== oldValue[key]) {
            changedKeys[key] = newValue[key];
          }
        });

        if (Object.keys(changedKeys).length > 0) {
          callback(changedKeys);
        }
      }
    }
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
