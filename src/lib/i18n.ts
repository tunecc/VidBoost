type Lang = 'auto' | 'en' | 'zh';

const strings = {
    en: {
        title: "VidBoost",
        subtitle: "Professional",
        enhancer_title: "h5player",
        enhancer_desc: "Speed control (C/X/Z) & advanced playback.",
        autopause_title: "Auto Pause",
        autopause_desc: "Smartly pause video when you switch tabs.",
        bilibili_title: "Bilibili Pro",
        bilibili_desc: "No double-click & fast pause logic.",
        footer: "VideoTools Pro v2.2",

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

        // Fast Pause Settings
        fast_pause_title: "Fast Pause Settings",
        fast_pause_master: "Fast Pause & Anti-touch",
        fast_pause_desc: "Prevent double-click fullscreen & fast pause.",
        platforms: "Platforms",

        // General
        language: "Language",
        lang_auto: "Auto",
        lang_en: "English",
        lang_zh: "Chinese"
    },
    zh: {
        title: "VideoTools",
        subtitle: "专业版",
        enhancer_title: "h5player",
        enhancer_desc: "倍速控制 (C/X/Z) 与高级播放功能",
        autopause_title: "自动暂停",
        autopause_desc: "切换标签页时智能暂停视频",
        bilibili_title: "B站优化",
        bilibili_desc: "防误触全屏与极速暂停",
        footer: "VideoTools Pro v2.2",

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

        // Fast Pause Settings
        fast_pause_title: "极速暂停设置",
        fast_pause_master: "极速暂停与防误触",
        fast_pause_desc: "防止双击全屏与极速响应暂停",
        platforms: "生效平台",

        // General
        language: "语言设置",
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
