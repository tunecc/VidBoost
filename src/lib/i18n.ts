type Lang = 'auto' | 'en' | 'zh';

const strings = {
    en: {
        title: "VidBoost",
        subtitle: "",
        enhancer_title: "h5player",
        enhancer_desc: "Quick video speed adjustment",
        autopause_title: "Auto Pause",
        autopause_desc: "Smartly pause background and unfocused videos",
        autopause_settings: "Auto Pause Settings",
        autopause_scope: "Activation Scope",
        autopause_scope_all: "Enable on all sites",
        autopause_scope_all_desc: "Auto Pause is active on any site with videos",
        autopause_scope_selected: "Enable on selected sites",
        autopause_scope_selected_desc: "Only activate on specified platforms",
        autopause_sites: "Sites",
        autopause_site_youtube: "YouTube",
        autopause_site_bilibili: "Bilibili",
        autopause_custom_sites: "Custom Domains",
        autopause_custom_desc: "Works when the video container is a <video> element",
        autopause_custom_placeholder: "example.com\nvimeo.com\nnetflix.com",
        bilibili_title: "Bilibili Pro",
        bilibili_desc: "Disable double-click fullscreen",
        footer: "v1.0",

        // H5 Settings
        settings_title: "h5player Settings",
        speed_control: "Speed Control",
        step_interval: "Step Interval",
        step_desc: "Amount to change when pressing C/X.",
        max_speed: "Max Speed",
        seek_control: "Seek Control (Seconds)",
        seek_forward: "Forward (→)",
        seek_rewind: "Rewind (←)",
        yt_opt: "YouTube Optimization",
        block_seek: "Block Native Seek",
        block_seek_desc: "Disables '1-9' jumping playback info.",
        h5_shortcuts: "Shortcuts",
        h5_shortcuts_desc: "Use these keys when a video is focused.",
        h5_key_speed_up: "Speed up",
        h5_key_speed_down: "Speed down",
        h5_key_speed_reset: "Toggle/Reset speed",
        h5_key_fullscreen: "Fullscreen",
        h5_key_seek_forward: "Seek forward",
        h5_key_seek_back: "Seek back",

        // Fast Pause Settings
        fast_pause_title: "Fast Pause Settings",
        fast_pause_master: "Disable Double Click Fullscreen",
        fast_pause_desc: "Prevent double-click fullscreen & fast pause.",
        platforms: "Platforms",

        // General
        language: "Language",
        general: "General",
        lang_auto: "Auto",
        lang_en: "English",
        lang_zh: "Chinese"
    },
    zh: {
        title: "VidBoost",
        subtitle: "",
        enhancer_title: "h5player",
        enhancer_desc: "快捷的视频倍速调整",
        autopause_title: "自动暂停",
        autopause_desc: "智能暂停后台与非焦点视频",
        autopause_settings: "自动暂停设置",
        autopause_scope: "生效范围",
        autopause_scope_all: "全局启用",
        autopause_scope_all_desc: "在所有含视频的网站生效",
        autopause_scope_selected: "指定网站启用",
        autopause_scope_selected_desc: "仅在指定平台生效",
        autopause_sites: "网站列表",
        autopause_site_youtube: "YouTube",
        autopause_site_bilibili: "哔哩哔哩",
        autopause_custom_sites: "自定义域名",
        autopause_custom_desc: "只要页面里是真正的 HTML5 <video> 播放器即可生效",
        autopause_custom_placeholder: "example.com\nvimeo.com\nnetflix.com",
        bilibili_title: "B站优化",
        bilibili_desc: "禁用双击全屏",
        footer: "v1.0",

        // H5 Settings
        settings_title: "h5player 设置",
        speed_control: "倍速控制",
        step_interval: "调速步长",
        step_desc: "按 C/X 时的增减幅度",
        max_speed: "最大倍速",
        seek_control: "快进快退 (秒)",
        seek_forward: "快进 (→)",
        seek_rewind: "快退 (←)",
        yt_opt: "YouTube 优化",
        block_seek: "屏蔽原生跳转",
        block_seek_desc: "禁用自带的数字键 1-9 跳进度功能",
        h5_shortcuts: "快捷键说明",
        h5_shortcuts_desc: "在视频获得焦点时可使用以下按键。",
        h5_key_speed_up: "加速",
        h5_key_speed_down: "减速",
        h5_key_speed_reset: "切换/重置速度",
        h5_key_fullscreen: "全屏",
        h5_key_seek_forward: "快进",
        h5_key_seek_back: "快退",

        // Fast Pause Settings
        fast_pause_title: "极速暂停设置",
        fast_pause_master: "禁用双击全屏",
        fast_pause_desc: "防止双击全屏与极速响应暂停",
        platforms: "生效平台",

        // General
        language: "语言",
        general: "通用",
        lang_auto: "跟随系统",
        lang_en: "English",
        lang_zh: "简体中文"
    }
};

export const i18n = (key: keyof typeof strings.en, lang: Lang = 'auto'): string => {
    let targetLang = lang;
    if (targetLang === 'auto') {
        const sysLang = navigator.language.toLowerCase();
        targetLang = sysLang.startsWith('zh') ? 'zh' : 'en';
    }

    return (strings[targetLang] || strings.en)[key] || key;
}
