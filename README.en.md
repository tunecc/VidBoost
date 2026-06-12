# VidBoost

<p align="center">
  <a href="./README.md">简体中文</a> | <strong>English</strong>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/vidboost/bjehghokgbfmceggcbpjgmahgjgpgbia?authuser=0&hl=zh-CN">
    <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat&logo=googlechrome&logoColor=white" />
  </a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/pkfejgamamjcgcbdhejojieenlchbgod">
    <img alt="Edge Add-ons" src="https://img.shields.io/badge/Edge-Add--ons-0078D7?style=flat&logo=microsoftedge&logoColor=white" />
  </a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/vidboost-video-toolkit/">
    <img alt="Firefox Extension" src="https://img.shields.io/badge/Firefox-Extension-FF7139?style=flat&logo=firefoxbrowser&logoColor=white" />
  </a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3">
    <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-MV3-FFB300?style=flat&logo=googlechrome&logoColor=white" />
  </a>
  <a href="https://svelte.dev/">
    <img alt="Svelte" src="https://img.shields.io/badge/Svelte-F1413D?style=flat&logo=svelte&logoColor=white" />
  </a>
  <a href="https://www.typescriptlang.org/">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white" />
  </a>
  <a href="https://vite.dev/">
    <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" />
  </a>
</p>

VidBoost brings the video features I find useful from separate scripts and extensions into one browser extension.

## Installation

| Channel | Download | Current Version | Users / Downloads |
| :------ | :-------: | :-------------: | :----------------: |
| Chrome | [Chrome Web Store - VidBoost](https://chromewebstore.google.com/detail/vidboost/bjehghokgbfmceggcbpjgmahgjgpgbia?authuser=0&hl=zh-CN) | [![Chrome version](https://img.shields.io/chrome-web-store/v/bjehghokgbfmceggcbpjgmahgjgpgbia?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/vidboost/bjehghokgbfmceggcbpjgmahgjgpgbia?authuser=0&hl=zh-CN) | [![Chrome users](https://img.shields.io/chrome-web-store/users/bjehghokgbfmceggcbpjgmahgjgpgbia?label=Chrome%20Users&style=flat)](https://chromewebstore.google.com/detail/vidboost/bjehghokgbfmceggcbpjgmahgjgpgbia?authuser=0&hl=zh-CN) |
| Microsoft Edge | [Microsoft Edge Add-ons - VidBoost](https://microsoftedge.microsoft.com/addons/detail/pkfejgamamjcgcbdhejojieenlchbgod) | [![Edge version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpkfejgamamjcgcbdhejojieenlchbgod&query=%24.version&label=Edge&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pkfejgamamjcgcbdhejojieenlchbgod) | [![Edge users](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpkfejgamamjcgcbdhejojieenlchbgod&query=%24.activeInstallCount&label=Edge%20Users&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pkfejgamamjcgcbdhejojieenlchbgod) |
| Firefox | [Firefox Browser Add-ons - VidBoost Video Toolkit](https://addons.mozilla.org/en-US/firefox/addon/vidboost-video-toolkit/) | [![Firefox version](https://img.shields.io/amo/v/vidboost-video-toolkit?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/en-US/firefox/addon/vidboost-video-toolkit/) | [![Firefox users](https://img.shields.io/amo/users/vidboost-video-toolkit?label=Firefox%20Users&style=flat)](https://addons.mozilla.org/en-US/firefox/addon/vidboost-video-toolkit/) |
| GitHub Release | [GitHub Releases](https://github.com/tunecc/VidBoost/releases) | [![GitHub version](https://img.shields.io/github/v/release/tunecc/VidBoost?label=GitHub&logo=github&style=flat)](https://github.com/tunecc/VidBoost/releases) | [![GitHub downloads](https://img.shields.io/github/downloads/tunecc/VidBoost/total?label=Downloads&style=flat)](https://github.com/tunecc/VidBoost/releases) |

## Preview

<p align="center">
  <img src="./assets/light_mode.png" width="48%" alt="VidBoost main interface in light mode" />
  &nbsp;
  <img src="./assets/dark_mode.png" width="48%" alt="VidBoost main interface in dark mode" />
</p>

## Feature Overview

### General Enhancements

#### 1. h5player Keyboard Speed Controls

Reference: based on [xxxily/h5player](https://github.com/xxxily/h5player), with my own slimmed-down [tunecc/h5player](https://github.com/tunecc/h5player) integrated.

Works on most HTML5 video sites, not just YouTube or Bilibili. The core idea is a consistent set of comfortable hotkeys, so you do not have to relearn every site's player.

- `1-6` switches directly to 1x-6x
- `C / X / Z` speeds up, slows down, toggles, or resets playback speed
- `Enter` enters fullscreen
- `Left / Right` rewinds and fast-forwards
- Custom speed step, maximum speed, and seek interval

I mainly use it for YouTube, Bilibili, and online courses, and it also works on many common HTML5 video sites.

Compatibility optimization:

- Douyin high-speed guard. On Douyin, playback speeds above `3x` are often reset by page logic. VidBoost tries to keep the current speed after you switch to a high speed.

<p align="center">
  <img src="./assets/h5_setting.png" width="56%" alt="h5player settings screenshot" />
</p>

#### 2. Auto Pause

Reference: inspired by `Enhancer for YouTube`'s `Automatically pause videos opened in background tabs` feature, and expanded from my own [tunecc/video-auto-pause](https://github.com/tunecc/video-auto-pause).

When you switch to another tab or the browser window loses focus, the playing video pauses automatically; when you come back, it continues.

Usage:

- Apply globally
- Apply only to selected sites
- Add custom domains
- Allow background playback for music or long audio

<p align="center">
  <img src="./assets/auto_pause.png" width="56%" alt="Auto Pause settings screenshot" />
</p>

#### 3. Fast Pause / Disable Double-click Fullscreen

Reference: https://greasyfork.org/zh-CN/scripts/448770-%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E5%8F%96%E6%B6%88%E5%8F%8C%E5%87%BB%E5%85%A8%E5%B1%8F

This feature solves a small but common annoyance: you want to click once to pause, but a double click sends the video fullscreen.

It does two things:

- Disables double-click fullscreen in the video area
- Tries to make play / pause respond earlier, so repeated clicks are more stable

It is currently adapted mainly for high-click-frequency scenarios on YouTube and Bilibili.

<p align="center">
  <img src="./assets/fastPause.png" width="62%" alt="Fast Pause settings screenshot" />
</p>

#### 4. Stats Panel Bandwidth Conversion

Reference: https://greasyfork.org/zh-CN/scripts/560641-youtube-%E7%BD%91%E9%80%9F%E5%8D%95%E4%BD%8D%E8%BD%AC%E6%8D%A2%E5%99%A8

In YouTube and Bilibili stats panels, sites usually show only `Kbps`. When enabled, VidBoost adds an `MB/s` conversion after it, making bandwidth easier to read.

Currently supported:

- YouTube `Connection Speed` in `Stats for nerds`
- Bilibili `Video Speed / Audio Speed` in the stats panel

### YouTube-specific Enhancements

<p align="center">
  <img src="./assets/youtube.png" width="56%" alt="YouTube-specific enhancement settings screenshot" />
</p>

#### 1. Block Native Number-key Seeking

YouTube's native `0-9` number keys seek through the video, which conflicts with the speed shortcuts above.

When enabled, VidBoost blocks that behavior, so trying to switch to `3x` does not jump the video directly to `30%`.

#### 2. Always Use Original Audio

Reference: https://github.com/insin/control-panel-for-youtube

When a YouTube video has multiple audio tracks, VidBoost automatically switches to the track labeled `Original / 原始 / 原声`. This is useful when you do not want automatic dubbing or translated audio tracks to interrupt the original audio.

- Supports regular watch pages
- Supports Shorts
- Only acts when multiple audio tracks exist on the page

#### 3. Show Current CDN Country

Reference: https://www.nodeseek.com/post-573621-1

While YouTube is playing, VidBoost identifies the `googlevideo` playback route hit by the current video chunks and displays the corresponding country directly in the player control bar.

- Supports regular watch pages
- Supports Shorts
- Country names follow VidBoost's current language
- Shows the CDN country reached by the current playback route, not the video's upload region

This feature is mainly for inspecting routes, not switching CDN.

It is useful for scenarios such as:

- Which country your current proxy / egress actually lands in
- Whether the CDN changes during playback
- Node scheduling differences across networks or proxy routes

#### 4. Self-rendered Subtitles

Reference: bilingual subtitles from https://github.com/mengxi-ream/read-frog

When enabled, VidBoost hides YouTube's native subtitle layer and re-renders subtitles into the player based on the current playback time and playback speed. This mainly solves native subtitle desync at high h5player speeds.

Currently supported:

- Follows the YouTube player's subtitle toggle
- Custom font family, font size, weight, color, opacity, background, and border radius
- Combines multiple outline / shadow / embossed effects
- Imports custom subtitle fonts
- Keeps subtitle timing as synchronized as possible at high playback speeds

<p align="center">
    <img src="./assets/yt_subtitle_overlay.png" width="50%" alt="YouTube self-rendered subtitles" />
  </p>

#### 5. Remember YouTube Subtitle State

Reference: https://github.com/xlch88/YouTubeTweak

YouTube's native subtitle toggle state is not very stable by default. After switching videos or channels, you often have to click CC again.

When enabled, VidBoost remembers the native CC subtitle button state in the YouTube player and restores it automatically when you open a new video.

Two memory scopes are supported:

- Per channel: the default mode. Each channel saves its own subtitle state, with the global state as fallback when no channel record exists
- Shared by all videos: all YouTube videos use the same subtitle toggle preference

This feature can be used independently and does not require the self-rendered subtitle feature above.

#### 6. Progress Bar Below the Video

Reference: https://github.com/xlch88/YouTubeTweak

When enabled, VidBoost adds a compact progress bar below the video.

Current behavior:

- Shows only after YouTube's native control bar auto-hides
- Hides automatically when the native control bar appears again
- Supports adjusting progress bar thickness
- Hides automatically for live streams to avoid conflicts with live UI

<p align="center">
  <img src="./assets/yt_bottom_progress.png" width="72%" alt="YouTube progress bar" />
</p>

#### 7. Hide Members-only Videos

Reference: https://github.com/insin/control-panel-for-youtube

YouTube home pages, subscription feeds, and similar feeds often include channel members-only videos.

Three modes are supported:

- Hide all
- Blacklist mode: only hide members-only videos from channels you specify
- Whitelist mode: hide by default, and keep only channels you allow

<p align="center">
  <img src="./assets/youtube_filter.png" width="72%" alt="YouTube members-only filter settings screenshot" />
</p>

### Bilibili-specific Enhancements

<p align="center">
  <img src="./assets/bilibili.png" width="72%" alt="Bilibili-specific enhancement settings screenshot" />
</p>

#### 1. Automatically Open Chinese Subtitles

Reference: https://greasyfork.org/zh-CN/scripts/551509-%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E8%87%AA%E5%8A%A8%E6%89%93%E5%BC%80%E4%B8%AD%E6%96%87%E5%AD%97%E5%B9%95

After entering a Bilibili video page, if the site provides Chinese subtitles, VidBoost opens them automatically and prefers AI Chinese subtitles.

Usage:

- Apply to all videos
- Apply only to specified creators
- Supports UID, profile links, or nicknames
- Add the current video's creator to the whitelist with one click

Regular videos, Bangumi / series pages, favorites, and Watch Later pages are covered.

<p align="center">
  <img src="./assets/bilibili_auto_subtitle.png" width="50%" alt="Automatically open Chinese subtitles" />
</p>

#### 2. Block Spacebar Page Scrolling

On Bilibili, you may press Space expecting pause or resume, but the page sometimes scrolls down instead. This feature blocks that specific behavior.

#### 3. CDN Switching and Speed Tests

Reference: [PiliPlus](https://github.com/bggRGjQaUbCoE/PiliPlus), https://github.com/Kanda-Akihito-Kun/ccb

When Bilibili's default CDN is unstable, slow, or performs poorly on overseas networks, you can manually switch to other nodes.

Currently supported:

- Manually switch Bilibili CDN nodes
- Run real speed tests for available nodes
- Test overseas / Hong Kong nodes
- Automatically select the fastest node after speed testing
- Sort by speed test results
- Bangumi enhancement mode

<p align="center">
  <img src="./assets/bilibili_cdn.png" width="72%" alt="Bilibili CDN feature screenshot" />
</p>

<details>
  <summary>Show the full Bilibili settings panel screenshot</summary>
  <p align="center">
    <img src="./assets/bilibili_cdnset.png" width="72%" alt="Bilibili full settings screenshot" />
  </p>
</details>

## Supported Scenarios

- General HTML5 video sites, including YouTube, Bilibili, online course platforms, and most standard `<video>` player sites
- Site-specific features: YouTube, Bilibili, Douyin
- Additional partial fullscreen adaptations: iQIYI, Youku, Tencent Video, and more

Main permissions and purposes:

- `storage`: saves feature toggles and custom settings
- `activeTab`: interacts with the current tab, such as reading page information or triggering current-page features
- Limited network host permissions: used for the YouTube CDN country display feature. VidBoost accesses DoH / GeoIP APIs and resolves the actual `googlevideo` host into country information

The extension also injects content scripts into pages; without that, it cannot interact with players or implement site-level adaptations.

### Source Installation

```bash
git clone https://github.com/tunecc/VidBoost.git
cd VidBoost
npm install

# Chrome / Edge
npm run build

# Firefox
npm run build:firefox
```

After the build finishes:

- Chrome / Edge: load the `dist` directory on the extensions management page
- Firefox: temporarily load `dist-firefox/manifest.json` from `about:debugging`

For daily use, it is recommended to install the official store versions above first. The store versions and stats in this README update automatically through badges.

## Development

```bash
npm run check
npm run build
```

Built with:

- TypeScript
- Svelte
- Vite
- Tailwind CSS
- Manifest V3

## Feedback and Contributions

If you have similar video usage scenarios, issues, suggestions, and PRs are welcome.

- Issues: [https://github.com/tunecc/VidBoost/issues](https://github.com/tunecc/VidBoost/issues)
- Repository: [https://github.com/tunecc/VidBoost](https://github.com/tunecc/VidBoost)
