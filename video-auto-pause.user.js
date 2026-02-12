// ==UserScript==
// @name         Auto Pause Background Video
// @namespace    https://github.com/tunecc/video-auto-pause
// @version      0.7
// @description  [ZH] 仅允许当前有焦点的页面继续播放 Bilibili / YouTube 视频，自动暂停其他后台或失焦标签页，防止刷新或切换窗口抢占播放。
// @description:en  Only allow the focused tab to keep playing videos on Bilibili / YouTube. Automatically pauses videos in background or unfocused tabs to prevent playback hijacking.
// @author       Tune (tunecc)
// @homepage     https://github.com/tunecc/video-auto-pause
// @source       https://github.com/tunecc/video-auto-pause
// @downloadURL  https://raw.githubusercontent.com/tunecc/video-auto-pause/refs/heads/main/video-auto-pause.user.js
// @downloadURL  https://raw.githubusercontent.com/tunecc/video-auto-pause/refs/heads/main/video-auto-pause.user.js
// @match        https://*.bilibili.com/*
// @match        https://*.youtube.com/*
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @run-at       document-start
// @license      MIT
// @icon         https://raw.githubusercontent.com/tunecc/video-auto-pause/master/logo.png
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_ID = `${Date.now()}-${Math.random()}`;
    const GM_CHANNEL_KEY = 'universalVideoControlChannel';
    const GM_LAST_FOCUSED_KEY = 'lastFocusedWindow'; // 记录最后获得焦点的窗口

    let currentVideo = null;

    // --- 辅助函数 ---

    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const el = document.querySelector(selector);
            if (el) {
                obs.disconnect();
                callback(el);
            }
        });

        observer. observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    /**
     * 检查自己是否是"最后活跃窗口"
     */
    function isLastFocusedWindow() {
        const lastFocused = GM_getValue(GM_LAST_FOCUSED_KEY, null);
        if (!lastFocused) return false;
        // 10秒内有效，防止记录过期
        if (Date.now() - lastFocused.timestamp > 10000) return false;
        return lastFocused.id === SCRIPT_ID;
    }

    /**
     * 记录自己为最后活跃窗口
     */
    function claimFocus() {
        GM_setValue(GM_LAST_FOCUSED_KEY, { id: SCRIPT_ID, timestamp: Date.now() });
    }

    // --- 核心逻辑 ---

    /**
     * 当视频尝试播放时触发
     */
    function onPlay() {
        // 1. 页面完全不可见（最小化或后台标签），强制暂停
        if (document.visibilityState !== 'visible') {
            this. pause();
            return;
        }

        // 2. 当前窗口有焦点 - 我是活跃窗口，通知其他窗口暂停
        if (document.hasFocus()) {
            claimFocus();
            GM_setValue(GM_CHANNEL_KEY, { sender: SCRIPT_ID, action: 'play_started', timestamp: Date.now() });
            return;
        }

        // 3. 当前窗口没有焦点（焦点可能在其他应用）
        //    检查自己是否是"最后活跃窗口"
        if (isLastFocusedWindow()) {
            // 我是最后活跃窗口，允许播放并通知其他窗口
            GM_setValue(GM_CHANNEL_KEY, { sender: SCRIPT_ID, action: 'play_started', timestamp: Date.now() });
            return;
        }

        // 4. 我既没有焦点，也不是最后活跃窗口 - 暂停自己
        this. pause();
    }

    /**
     * 接收来自其他标签页的消息
     */
    function onMessage(name, oldValue, newValue, remote) {
        if (!remote || !newValue || newValue.sender === SCRIPT_ID) return;

        if (newValue.action === 'play_started') {
            // 自我保护：如果我有焦点，忽略信号并重新声明
            if (document.hasFocus()) {
                claimFocus();
                return;
            }

            // 自我保护：如果我是最后活跃窗口且正在播放，忽略信号
            if (isLastFocusedWindow() && currentVideo && !currentVideo.paused) {
                return;
            }

            // 否则暂停
            if (currentVideo && !currentVideo. paused) {
                currentVideo.pause();
            }
        }
    }

    /**
     * 绑定视频事件
     */
    function setupVideo(videoElement) {
        if (videoElement === currentVideo) return;

        if (currentVideo) {
            currentVideo.removeEventListener('play', onPlay);
        }

        currentVideo = videoElement;

        if (currentVideo) {
            currentVideo.addEventListener('play', onPlay);
        }
    }

    // --- 网站适配层 ---
    const siteAdapters = {
        'bilibili.com': {
            playerContainerSelector: '#bilibili-player'
        },
        'youtube.com': {
            playerContainerSelector: '#movie_player'
        }
    };

    /**
     * 初始化脚本
     */
    function initialize() {
        const currentHostname = window.location.hostname;
        const adapterKey = Object.keys(siteAdapters).find(key => currentHostname.includes(key));

        if (! adapterKey) return;

        const adapter = siteAdapters[adapterKey];

        // 【关键】监听焦点事件，记录最后活跃窗口
        window.addEventListener('focus', claimFocus);
        // 用户点击页面也算获得焦点
        document. addEventListener('click', () => {
            if (document. hasFocus()) claimFocus();
        });
        // 如果页面加载时就有焦点，立即记录
        if (document.hasFocus()) {
            claimFocus();
        }

        waitForElement(adapter.playerContainerSelector, (playerContainer) => {
            const videoObserver = new MutationObserver(() => {
                const video = playerContainer. querySelector('video');
                if (video) setupVideo(video);
            });
            videoObserver. observe(playerContainer, { childList: true, subtree: true });

            const initialVideo = playerContainer.querySelector('video');
            if (initialVideo) {
                setupVideo(initialVideo);
            }
        });

        GM_addValueChangeListener(GM_CHANNEL_KEY, onMessage);
    }

    initialize();
})();