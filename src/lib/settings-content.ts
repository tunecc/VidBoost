export {
    DEFAULT_SETTINGS,
    CONTENT_SETTINGS_KEYS,
    POPUP_SETTINGS_KEYS,
    YT_MEMBER_BLOCK_SETTINGS_KEYS,
    resolveSettings,
    getSettings,
    setSettings,
    onSettingsChanged,
    onStorageKeysChanged
} from './settings';

export type {
    Settings,
    SettingsKey,
    H5Config,
    YTConfig,
    AutoPauseSites,
    YTMemberBlockMode
} from './settings';
