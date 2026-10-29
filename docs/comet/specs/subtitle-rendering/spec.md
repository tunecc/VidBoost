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

## 8. 插件翻译兼容（沉浸式翻译 / Read Frog）（本轮新增）

### 8.1 沉浸式翻译兼容（既有行为，保持不变）

- 设置 `yt_subtitle.compatibleWithImmersiveTranslate`（默认 `false`），popup 开关行 + i18n key `yt_subtitle_compatible_it` / `yt_subtitle_compatible_it_desc`。
- `shouldYieldToImmersiveTranslate(trackLanguageCode)`：开关开启且 `isChineseLanguageCode(trackLanguageCode)` 为 false → 让位（无条件，不检测 IT 是否在场）。
- 让位动作：中止加载、停渲染、清字幕状态、清空渲染文本、销毁 overlay、`setNativeSubtitlesHidden(false)`（移除 VidBoost 隐藏原生字幕的样式，由 IT 渲染翻译）。
- 触发点：`loadSubtitleAndRender` option 解析后、`pollTrackChange` option 解析后。

### 8.2 Read Frog 兼容（本轮变更）

设置 `yt_subtitle.compatibleWithReadFrog: boolean`（默认 `false`），`cloneYTSubtitleConfig` 对旧存储缺字段回退默认值。

判定 `shouldYieldToReadFrog(trackLanguageCode)`，评估顺序在 `shouldYieldToImmersiveTranslate` 之后（IT 让位成立时不再评估）：

- 开关开启；
- `isChineseLanguageCode(trackLanguageCode)` 为 false（与 IT 共用同一中文判定）；
- Read Frog 在场：`document.getElementById('read-frog-subtitles-translate-button-container')` 命中（Read Frog 启用视频字幕后挂载于播放器控件栏，open shadow root）。

在场与状态读取（`subtitleOverlay.shared.ts`）：

- 容器：`#read-frog-subtitles-translate-button-container`；
- 徽标状态：容器 `shadowRoot` 内 `.read-frog-subtitles-translate-button` 的徽标子元素文本，`"ON"` / `"OFF"`（Read Frog 硬编码非 i18n 文本）；容器或徽标不可读时状态未知。

让位动作：复用 IT 让位语义（停渲染、清状态、销毁 overlay、`setNativeSubtitlesHidden(false)`），Read Frog 翻译接管后由其自行隐藏原生字幕，用户关闭 Read Frog 时由其自行恢复原生显示。

自动开启（受控触发流程）：

- 触发前提：徽标可读且为 OFF。已 ON 时不派发（不得把已开启的翻译切回 OFF）。
- 派发动作：向 `document` 派发合成 `KeyboardEvent`：`keydown` + `keyup` 成对，`altKey: true`、`code: 'KeyC'`、`key: 'c'`，对应 Read Frog 默认字幕切换快捷键 Alt+C（其热键库监听 `document` 且不校验 `isTrusted`）。
- 竞态处理：让位决策时容器尚未挂载 → 以有界间隔轮询等待容器出现（上限时长有界），超时安全放弃（不抛错、清理定时器，原生字幕保持可见）。
- 结果验证：派发后有界轮询徽标翻 ON；未翻则有限次重试派发后放弃。
- 去重与防打架：按 `videoId + optionKey` 去重，1.2s 轮询不重复派发；用户经 Read Frog 自身 UI 手动关闭后，同一视频内不自动重开，切换视频或字幕轨（键变化）后恢复触发。

约束：不读写 Read Frog 扩展存储、不注入其隔离世界；仅依赖其页面 DOM 标识（容器 id、按钮类名、徽标文本）。用户重映射其切换快捷键后，自动开启静默失效（让位行为仍生效）。

### 8.3 popup 与 i18n（本轮变更）

- 新增 i18n key `yt_subtitle_compatible_read_frog` / `yt_subtitle_compatible_read_frog_desc`（zh / en）。
- 「兼容 Read Frog」开关行位于「兼容沉浸式翻译」行下方，行布局、tooltip 交互与禁用态规则（跟随 `ytSubtitleStyleDisabled`）一致。
