# YouTube 字幕渲染与健壮性（完整目标规格）

本规格描述归档后 YouTube 字幕覆盖层在「字幕后处理、翻译路径、推荐预览隔离、菜单防误触、native toggle 重试、加载失败阈值、无字幕缓存、新视频默认开启、视频命中判定、插件翻译兼容」上的完整行为。仅列出本轮 change 改变的子能力，未列出的子能力保持上游现状不变。

## 1. 字幕后处理：ASR 精炼与翻译路径（#1 / #2 / #3）

### 1.1 句子切分的时间戳分配（#1）

`splitFragmentBySentencePunctuation(fragment, language)` 在按内部强标点切分一个含多句的 cue 后，按各部分文本长度按比例分配时长：

- `language` 为空或非 CJK 时：按词数（`wordCount`）加权，行为与改造前一致。
- `language` 为 CJK（`isCJKLanguage(language)` 为 true）时：按 `getTextLength(part, true)`（字符数）加权，避免「每句时长相同」的中文翻译错位。

不变量：
- 切分后所有片段的 `[start, end)` 区间首尾相接，总时长等于 `fragment.end - fragment.start`。
- 末条片段的 `end` 严格等于原 `fragment.end`。
- 相邻片段无重叠（由 `splitBySentencePunctuation` 末尾的 overlap fix 保证）。
- 每个非末条片段 `end - start >= 1ms`。

`splitBySentencePunctuation(fragments, language)` 将 `language` 透传给每个 `splitFragmentBySentencePunctuation` 调用。

### 1.2 保守精炼路径选择（#2）

新增 `shouldUseConservativeSubtitleRefine(option: SubtitleOption): boolean`：

- `option.kind === 'translated'`（用户在字幕选择器选了翻译语言）→ true
- `option.sourceTrack.kind === 'asr'`（自动生成字幕）→ true
- 其余 → false

`fetchOptionFragments` 在拿到 `fragments` 后：

- 若 `shouldUseConservativeSubtitleRefine(option)` 为 true → 调用 `refineAsrFragments(fragments, language, { maxMergedDurationMs })`。
- 否则 → 维持上游现状 `postProcessSubtitles(fragments, language)`（shape-gate）。

`language` 由 `getSubtitleOptionLanguage(option) || 'en'` 给出（已存在）。

### 1.3 tlang 注入（#2）

`buildSubtitleUrl(option, playerData, potToken)` 经现有 `applySubtitleOptionTarget(url, option)` 注入 `tlang`（translated kind 时 set，否则 delete）。不新增 URL 拼装逻辑。

### 1.4 仅 tlang 变化不强制重载（#2）

新增 `isTlangRemovedOnly(nextOptionKey, currentOptionKey): boolean`，判定「当前 option key 含翻译段、下一个 option key 不含翻译段、二者其余段相同」时返回 true。`pollTrackChange` / `loadSubtitlesForCurrentPage` 在仅 tlang 变化时跳过完整重载（保留现有片段或按现有 nextOptionKey 判定逻辑，不因 tlang 被移除而误判为轨道变更触发重新加载）。

### 1.5 asrMergeDurationMs 可配置与热重算（#3）

`YTSubtitleConfig.asrMergeDurationMs: number`，默认 `7000`，存储时 clamp 到 `[1000, 10000]`。

`refineAsrFragments(fragments, language, options?)` 的 `options.maxMergedDurationMs` 透传给 `mergeAsrFragments` → `canMergeByLimits(current, next, isCJK, maxMergedDurationMs)`，作为合并后总时长的上限（替代原硬编码 `MAX_MERGED_DURATION_MS`）。

热重算路径（`updateSettings` / `onSettingsChange`）：

- 记录变更前的 `previousMergeDurationMs`，应用新 config 后比较。
- 若 `mergeDurationChanged && currentUsesConservativeRefine && currentRawFragments.length > 0`：用 `refineAsrFragments(currentRawFragments, currentTrackLanguage, { maxMergedDurationMs })` 重算 `currentFragments`，`currentIndex = -1`，立即 `renderAtCurrentTime(true)`，不重新请求 timedtext。
- 否则不重算；若 `enabled && !mergeDurationChanged`，维持现有 `scheduleSync(0)` 行为。

新增内部状态：`currentRawFragments: SubtitleFragment[]`（保守精炼前的原始片段）、`currentTrackLanguage: string`、`currentUsesConservativeRefine: boolean`。

## 2. 推荐预览字幕隔离（#4）

新增私有方法：

```
playerRoot(): HTMLElement | null
  → document.getElementById('movie_player')
    || document.querySelector('ytd-player #movie_player')
    || document.querySelector('#movie_player')

youtubeMainVideo(): HTMLVideoElement | null
  → const player = playerRoot(); if (!player) return null;
    return player.querySelector('video.html5-main-video')
        || player.querySelector('video');
```

替换以下位置对 `this.videoCtrl.video` 的直接引用（字幕时钟绑定、OSD 定位锚点）：
- `rebindVideo` 的订阅回调触发处
- 主加载入口的 `video` 取值
- OSD / fallback 提示的锚点

不变量：字幕 overlay 永远跟随 `#movie_player` 内的主视频，不绑定推荐卡片的预览 `<video>`。`videoCtrl` 订阅仍保留用于倍速等场景。

## 3. 菜单打开时防误触切换字幕（#5）

`subtitleOverlay.page.ts` 新增 `isYoutubeMenuOpen(): boolean`，检测以下任一选择器命中的可见元素：
`.ytp-popup`、`.ytp-settings-menu`、`.ytp-contextmenu`、`ytd-menu-popup-renderer`、`tp-yt-iron-dropdown`、`.ytp-panel`。「可见」= `offsetWidth>0 && offsetHeight>0 && display!=='none' && visibility!=='hidden'`。

`setSubtitlesEnabled(enabled)` 在「当前状态 ≠ 目标」、即将调用 `player.toggleSubtitles()` / `button.click()` 之前，若 `isYoutubeMenuOpen()` 为 true，直接返回 `{ success: false, enabled: current }`，不点击。无弹层时行为不变。

## 4. native toggle restore 重试（#6）

常量：`NATIVE_TOGGLE_RESTORE_RETRY_DELAY_MS = 250`、`NATIVE_TOGGLE_RESTORE_MAX_RETRIES = 20`。

状态：`nativeToggleRestoreRetryKey: string`、`nativeToggleRestoreRetryCount: number`。

`scheduleNativeToggleRestoreRetry(expectedVideoId)`：
- 仅在 `alwaysEnableSubtitles === true` 且 `expectedVideoId === getCurrentUrlVideoId()` 时生效。
- 按 `${videoId}|global` 维护 retryKey，key 变更时重置计数。
- `count >= MAX_RETRIES` 时停止；否则 `count += 1` 并 `scheduleSync(DELAY_MS)`。

`resetNativeToggleRestoreRetry(restoreKey)`：key 匹配时清零。

调用点：`restoreNativeToggleForCurrentPage` 在 playerData 为空 / 按钮状态为 null / set 失败时调度重试；成功时 reset。

`alwaysEnableSubtitles === false` 时不启动重试（不改变上游现状）。

## 5. 加载失败阈值与无字幕缓存（#7 / #8）

### 5.1 失败阈值（#7）

常量 `FALLBACK_NOTICE_FAILURE_THRESHOLD = 3`。状态 `consecutiveLoadFailures: number`、`loadFailureVideoId: string`。

`handleSubtitleLoadFailure`：
- 若当前视频已有可用 overlay（`currentVideoId === expectedVideoId && currentFragments.length > 0`）→ 直接返回（不计数、不回退）。
- 换视频时重置 `loadFailureVideoId` 与计数。
- `consecutiveLoadFailures += 1`；若 `< THRESHOLD` → `scheduleSync(FETCH_RETRY_DELAY_MS)` 重试，不回退。
- 若 `>= THRESHOLD` → `fallbackToNative(true)`。
- 成功加载或换视频时计数归零。

### 5.2 无字幕缓存（#8）

状态 `subtitleUnavailableVideoId: string`。

`markSubtitleUnavailable(videoId)`：记录 id，`stopRenderer` / `clearSubtitleState` / `renderSubtitleText('')` / `showNativeSubtitles`。

在 `pollTrackChange`、`loadSubtitlesForCurrentPage` 入口及 `captionTracks.length === 0` 处：若 `subtitleUnavailableVideoId === getCurrentUrlVideoId()` → 提前返回，不请求 playerData。切换到其他视频时缓存自然失效（id 不匹配）。

## 6. alwaysEnableSubtitles（#9）

`YTConfig.alwaysEnableSubtitles?: boolean`，默认 `false`，归入 `yt_config`。

行为：
- `false`（默认）：上游 `rememberNativeToggle` / `rememberNativeToggleByChannel` 记忆机制完全不变。
- `true`：`restoreNativeToggleForCurrentPage` 的目标 `targetEnabled` 强制为 `true`，忽略记忆的关闭状态；`shouldRememberNativeToggle` 语义不变（仍由 `rememberNativeToggle` 控制），但恢复目标优先取 `alwaysEnableSubtitles`。

popup 新增 ToggleItem（i18n key `yt_subtitle_always_enable` / `yt_subtitle_always_enable_desc`）。

## 7. eventHitsAnyVideoSurface（#10 / 工具函数）

`pointerTargets.ts` 新增：

```
eventHitsAnyVideoSurface(e: Event): boolean
  - 非 MouseEvent → false
  - 遍历 document.querySelectorAll('video')，任一满足
    display!=='none' && visibility!=='hidden' && rect.width>0 && rect.height>0
    且 e.clientX/Y 落在 rect 内 → true
  - 否则 false
```

`eventHitsVideoSurface(e, video)` 保持现状，不改。本轮不接入任何调用点，仅作为公共工具供后续使用。


## 8. 插件翻译兼容（沉浸式翻译 / Read Frog / Cometix Translate）

「插件翻译兼容」是单一开关：`yt_subtitle.compatibleWithPluginTranslate: boolean`（默认 `false`）。开关关闭时三路均不让位，VidBoost 正常自渲染。

判定收敛在 `subtitleOverlay.shared.ts` 的纯函数 `resolvePluginTranslateYield(trackLanguageCode, options)`，`options = { enabled, readFrogPresent, cometixPresent }`。返回 `'read-frog' | 'cometix-translate' | 'immersive-translate' | null`。

### 8.1 判定顺序与公共前置

`resolvePluginTranslateYield` 按以下顺序求值：

1. `options.enabled !== true` → `null`。
2. `isChineseLanguageCode(trackLanguageCode)` 为 true（`zh*` 前缀）→ `null`（中文不让位，VidBoost 自渲染强化）。
3. `options.readFrogPresent === true` → `'read-frog'`。
4. `options.cometixPresent === true` → `'cometix-translate'`。
5. 其余 → `'immersive-translate'`（无条件回落，不检测 IT 是否在场）。

不变量：

- `cometixPresent` 为可选参数，缺省按 `false`；只传 `{ enabled, readFrogPresent }` 时行为与引入 Cometix 之前逐项一致。
- 三路互斥，只有第一个命中的分支生效。
- 纯函数：不读 DOM、不读写设置、无副作用。

### 8.2 沉浸式翻译兼容（既有行为，保持不变）

- 判定：到达第 5 步即让位（无条件，不检测 IT 在场）。
- 让位动作：中止加载、停渲染、清字幕状态、清空渲染文本、销毁 overlay、移除 VidBoost 隐藏原生字幕的样式（`#vb-yt-subtitle-native-hide`），由 IT 渲染译文。
- 不让位：VidBoost 自渲染，并保留自身隐藏原生字幕的样式。

### 8.3 在场检测

Read Frog（`subtitleOverlay.shared.ts`）：

- `READ_FROG_TRANSLATE_BUTTON_CONTAINER_ID = 'read-frog-subtitles-translate-button-container'`；
- `findReadFrogTranslateButtonContainer()`：`typeof document === 'undefined'` 时返回 `null`，否则 `document.getElementById(...)`；
- 容器存在即视为在场。

Cometix Translate：

- `COMETIX_TRANSLATE_ROOT_ID = 'cometix-imt-root'`；
- `findCometixTranslateRoot()`：`typeof document === 'undefined'` 时返回 `null`，否则 `document.getElementById(COMETIX_TRANSLATE_ROOT_ID)`；
- `isCometixTranslatePresent()`：`findCometixTranslateRoot() !== null`；
- 该元素由 Cometix 顶层 frame 的 content script 创建并 `MutationObserver` 维持挂载，是其字幕模块就绪的稳定隔离世界信号。

两路检测都不得抛错：`document` 不可用、元素缺失一律降级为「不在场」。

### 8.4 接管检测（Cometix 专属）

- `COMETIX_TRANSLATE_CAPTION_WINDOW_ID = 'immersive-translate-caption-window'`；
- `hasCometixTranslateTakenOver()`：`typeof document === 'undefined'` 时返回 `false`，否则判断 `document.getElementById(COMETIX_TRANSLATE_CAPTION_WINDOW_ID) !== null`。

该元素仅由 Cometix 在真正 attach 字幕时创建（其内部为 `closed` shadow root，外部只能读宿主元素本身），因此「元素出现」等价于「已接管渲染」。仅 `#cometix-imt-root` 存在不构成接管。

### 8.5 让位动作与自动开启

Read Frog 让位（既有，保持不变）：

- 复用 IT 让位语义（停渲染、清状态、销毁 overlay、移除隐藏原生字幕样式）；
- 自动开启：向 `document` 派发成对合成 `KeyboardEvent`（`keydown` + `keyup`，`altKey: true`、`code: 'KeyC'`、`key: 'c'`），对应其默认切换快捷键 Alt+C；
- 前置校验徽标为 OFF（容器 `shadowRoot` 内 `.read-frog-subtitles-translate-button` 的 `"ON"` / `"OFF"` 文本），派发后验证翻 ON；徽标已 ON 不派发；容器 / 徽标不可读时状态未知；
- 按 `videoId + optionKey` 去重，用户手动关闭后同一 key 不重开，key 变化后恢复。

Cometix Translate 让位（本轮新增）：

- 复用同一让位语义（停渲染、清状态、销毁 overlay、移除隐藏原生字幕样式）；
- 随后调用既有桥接 `requestYouTubeSubtitleEnsureEnabled()` 确保 YouTube 原生 CC 开启——Cometix 的字幕源是原生 CC / `api/timedtext`，CC 关闭时其会停止并移除自己的字幕窗口；
- 不做自动开启：Cometix 无默认字幕快捷键、播放器快捷按钮位于 `closed` shadow root、配置在其扩展私有存储且无对外 API，因此不存在可用的程序化开启路径。

### 8.6 Cometix 接管等待与回退

新增 `createCometixTranslateYieldController(deps?)`，职责为「确认接管，否则回退」：

- 依赖可注入：`now`、`sleep`、`present`、`hasTakenOver`、`ensureNativeCaptions`、`onFallback`，以及等待间隔 / 总时长常量。
- `activate(key)`：按 key 去重（同一 key 只处理一次）；已有在途流程时以世代号取代旧流程。
- 流程：调用 `ensureNativeCaptions()` → 以固定间隔轮询 `hasTakenOver()` 直到成功或到达等待上限 → 成功则结束（不再回退）；超时则调用 `onFallback(key)`。
- `reset()`：递增世代号取消在途流程并清空去重记录（导航 / 卸载时调用）。
- 所有等待有界、不抛错；结束后不残留计时器或 observer。

默认常量：等待间隔 `500ms`，等待上限 `6000ms`。选择依据：Cometix 默认在原生 CC 开启后延迟约 `1000ms` 再检查 / 点击 CC 并开始拉取 timedtext，6 秒覆盖该延迟与其后首次渲染。

回退契约（由调用方 `YouTubeSubtitleOverlay` 实现）：

- `onFallback(key)` 把该 key 记入失败集合，并 `scheduleSync(0)` 触发现有重载路径，使 VidBoost 重新自渲染该字幕轨；
- 失败集合中的 key 不再尝试 Cometix 让位，key 变化（换视频 / 换字幕轨）后自然失效；
- 保证同一 key 至多让位一次、至多回退一次，1.2s 的 `pollTrackChange` 轮询不产生抖动或循环。

### 8.7 popup 与 i18n

- 单一开关行沿用 `yt_subtitle_compatible_plugin_translate` / `yt_subtitle_compatible_plugin_translate_desc`（zh / en 两套字典均存在）。
- 说明文案必须覆盖两点：三路优先级「Read Frog 在场优先、其次 Cometix Translate、否则沉浸式翻译」；Cometix Translate 需用户自行开启其 YouTube 字幕翻译（VidBoost 只让位，不代其开启）。
- 不新增设置字段、不新增开关行。

### 8.8 触发点与回归边界

让位判定接入两个既有触发点，不新增加载入口：

- `loadSubtitlesForCurrentPage`：解析出 `option` 之后；
- `pollTrackChange`：解析出 `option` 之后。

约束：

- 「开关关闭」「中文字幕」「Read Frog 与 Cometix 皆不在场」三条路径的分支结果与引入 Cometix 之前一致。
- Cometix 的等待 / 回退只在其分支被选中时启动，其他分支不产生任何 Cometix 相关计时器。
