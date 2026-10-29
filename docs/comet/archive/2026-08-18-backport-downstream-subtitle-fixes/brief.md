# Outcome

把下游「油管特调版」（lyessure/VidBoost v1.8.4）中经过真实场景验证、且上游缺失或更弱的 10 项字幕渲染与健壮性改进，回流入上游 VidBoost。目标是修复中文翻译字幕时间轴错位、自动翻译「字幕墙」、推荐预览字幕绑错 video、菜单打开误切字幕、SPA 导航后字幕不开、单次加载失败即回退原生字幕、无字幕视频反复请求等问题，并新增「自动字幕合并时长」与「新视频始终开启字幕」两个用户可调开关。

# Scope

涉及 10 项改动，分布在字幕后处理、字幕覆盖层、字幕 page 脚本、设置层与 popup：

1. CJK 翻译字幕按字符长度分配时间戳（`asr-merge.ts` 的 `splitFragmentBySentencePunctuation` / `splitBySentencePunctuation` 增加 `language` 参数，用 `getTextLength` 按字符加权，替代按词数分配）
2. 自动翻译走 ASR 保守精炼路径（`YouTubeSubtitleOverlay.ts` 新增 `resolveTranslationLanguageCode` / `resolveSubtitleProcessingLanguage` / `shouldUseConservativeSubtitleRefine`；`buildSubtitleOptionKey` 已含 `targetLanguageCode`，`buildSubtitleUrl` 经 `applySubtitleOptionTarget` 注入 `tlang`；新增 `isTlangRemovedOnly` 仅 tlang 变化不强制重载）
3. `asrMergeDurationMs` 可配置 + 变更时本地热重算（`settings.ts` 新增字段默认 7000ms、clamp 1000–10000；`asr-merge.ts` 的 `canMergeByLimits` / `mergeAsrFragments` / `refineAsrFragments` 接收 `maxMergedDurationMs`；`App.svelte` 新增 slider；overlay 在 `currentRawFragments` 上本地重算）
4. 隔离 YouTube 推荐预览字幕（`YouTubeSubtitleOverlay.ts` 新增 `youtubeMainVideo()` + `playerRoot()`，替换 4 处 `this.videoCtrl.video` 的字幕绑定/定位锚点）
5. 避免菜单打开时误触切换字幕（`subtitleOverlay.page.ts` 新增 `isYoutubeMenuOpen()`，在 `setSubtitlesEnabled` 点击前 gate）
6. native toggle restore 重试机制（`YouTubeSubtitleOverlay.ts` 新增 `scheduleNativeToggleRestoreRetry` / `resetNativeToggleRestoreRetry` + `NATIVE_TOGGLE_RESTORE_RETRY_DELAY_MS=250` / `NATIVE_TOGGLE_RESTORE_MAX_RETRIES=20`）
7. 失败阈值 3 次才 fallback（`YouTubeSubtitleOverlay.ts` 新增 `FALLBACK_NOTICE_FAILURE_THRESHOLD=3` + `consecutiveLoadFailures` 计数）
8. 无字幕视频缓存（`YouTubeSubtitleOverlay.ts` 新增 `subtitleUnavailableVideoId` + `markSubtitleUnavailable`，sync 前置检查）
9. `alwaysEnableSubtitles` 可配置，默认 `false`（`settings.ts` 新增 `YTConfig.alwaysEnableSubtitles`；`App.svelte` 新增 ToggleItem；overlay 在 `alwaysEnableSubtitles===true` 时强制开启、忽略记忆）
10. `eventHitsAnyVideoSurface` 工具函数（`pointerTargets.ts` 新增按 rect 命中任意可见 `<video>` 的工具函数）

# Non-goals

- 不做下游的运行信息浮层（speed badge + popover + `getRuntimeStatus`），本轮不引入 `YouTubeSubtitleRuntimeStatus` / `getRuntimeStatus` 接口与任何诊断 UI
- 不引入 `GlobalDoubleClickFullscreenBlocker`、不退役 `YouTubeFastPause` / `BilibiliFastPause`，不改动 fast pause 的 mousedown 快速暂停行为；#10 只新增工具函数
- 不删除上游 `StatsSpeedConverter` / `YouTubeSeekBlocker` 等站点模块
- 不改动字幕选择器（`selector/`）、Immersive Translate 兼容逻辑、`rememberNativeToggleByChannel` 频道级记忆机制
- 不调整默认字幕样式（字号/字重/颜色/描边/圆角）
- 不引入 `YT_SUBTITLE_STYLE_REVISION` 版本化重置机制（上游本无此机制）
- 不改动 Bilibili / 抖音 / media-kernel 等其他站点的字幕行为
- #9 `alwaysEnableSubtitles` 默认 `false`，与上游现有 `rememberNativeToggle` 记忆机制并存、不替换

# Acceptance examples

- A1（#1）：含多句的中文翻译 cue（如「威源后面有两条路可以选择。这条沥青路是通往阿克赛的五七一号国道。往这边走。」）经 `splitFragmentBySentencePunctuation(frag, 'zh-CN')` 切成 3 条，且第 2 条（最长）时长 > 第 1 条时长；切分后总时长守恒（末条 `end` 等于原 `fragment.end`），无重叠。
- A2（#1）：英文 cue「To the airport. I'm flying.」按词数加权分配时长，行为与改造前一致（不回归）。
- A3（#2）：用户在字幕选择器选了翻译语言（`SubtitleOption.kind === 'translated'`）时，`fetchOptionFragments` 走 `refineAsrFragments`（保守精炼）而非 `postProcessSubtitles` 的 shape-gate lightClean 路径；`buildSubtitleUrl` 经 `applySubtitleOptionTarget` 注入 `tlang`。
- A4（#2）：源轨道 `track.kind === 'asr'` 时同样走 `refineAsrFragments`（与现状一致，不回归）。
- A5（#2）：用户从翻译语言切回源语言（`tlang` 被移除，其余 key 段不变）时，`isTlangRemovedOnly` 返回 `true`，不触发完整重载（保留现有片段或按 nextOptionKey 判定，不因 tlang 变化误判为轨道变更）。
- A6（#3）：`asrMergeDurationMs` 默认 7000，存储值经 clamp 落在 [1000, 10000]。
- A7（#3）：用户拖动 popup 里的「自动字幕合并时长」slider 后，若当前正显示保守精炼结果（`currentUsesConservativeRefine === true` 且 `currentRawFragments.length > 0`），overlay 用 `currentRawFragments` + 新 `maxMergedDurationMs` 本地重算 `currentFragments` 并立即重渲染，不重新请求 timedtext。
- A8（#3）：未处于保守精炼路径时，slider 变更不触发重算、不重载。
- A9（#4）：YouTube watch 页 hover 右侧推荐卡片时，推荐预览的 `<video>` 不触发字幕 overlay 重新绑定；字幕 overlay 始终跟随 `#movie_player` 内的 `video.html5-main-video`。
- A10（#5）：YouTube 播放器任意弹层（设置菜单 / 上下文菜单 / `ytd-menu-popup-renderer` / `tp-yt-iron-dropdown` / `.ytp-panel` / `.ytp-popup`）可见时，`setSubtitlesEnabled` 不点击 `.ytp-subtitles-button`，返回 `{ success: false, enabled: current }`。
- A11（#5）：无弹层时，`setSubtitlesEnabled` 行为不变（可正常切换）。
- A12（#6）：`alwaysEnableSubtitles === true` 时，`requestYouTubeSubtitlePlayerData` 返回 null 或 `readNativeSubtitleButtonState()` 返回 null，`scheduleNativeToggleRestoreRetry` 以 250ms 间隔重新 scheduleSync，最多 20 次后停止。
- A13（#6）：`alwaysEnableSubtitles === false` 时，重试机制不启动（不改变上游现状）。
- A14（#7）：timedtext 加载失败时，前 2 次（`consecutiveLoadFailures < 3`）只 `scheduleSync(FETCH_RETRY_DELAY_MS)` 重试、不回退原生；第 3 次才 `fallbackToNative(true)`。
- A15（#7）：换视频或成功加载后 `consecutiveLoadFailures` 归零。
- A16（#8）：某视频 `captionTracks.length === 0` 时，`markSubtitleUnavailable(videoId)` 记录该 id；后续该视频的 sync / pollTrackChange 命中缓存提前返回，不重新请求 playerData。
- A17（#8）：切换到其他视频时，`subtitleUnavailableVideoId` 失效（不串视频）。
- A18（#9）：`alwaysEnableSubtitles` 默认 `false`；为 `false` 时上游 `rememberNativeToggle` / `rememberNativeToggleByChannel` 记忆行为完全不变。
- A19（#9）：用户开启 `alwaysEnableSubtitles` 后，每个新视频强制开启 CC 字幕，忽略上次记忆的关闭状态；`restoreNativeToggleForCurrentPage` 在 `alwaysEnableSubtitles === true` 时 `targetEnabled` 直接为 `true`。
- A20（#10）：`eventHitsAnyVideoSurface(e)` 对落在任意可见、非零尺寸 `<video>` 渲染矩形内的 `MouseEvent` 返回 `true`；对 `display:none` / `visibility:hidden` / 零尺寸 video 返回 `false`；对非 `MouseEvent` 返回 `false`。
- A21（#10）：现有 `eventHitsVideoSurface(e, video)` 行为不变（不回归）。
- A22：`npm run check`（svelte-check）通过；`npm test`（vitest）全部通过，含为 #1/#3/#7 新增或调整的测试。

# Constraints and invariants

- 上游字幕覆盖层基于 `SubtitleOption`（`selector/types.ts`）+ `applySubtitleOptionTarget` 注入 tlang；#1/#2 必须复用这套结构，不得引入下游的 `playerData.selectedTrack.translationLanguageCode` 直读（上游 `YouTubeSubtitleSelectedTrack` 无此字段）。翻译语言以 `SubtitleOption.translationLanguageCode`（translated kind）为准。
- `buildSubtitleOptionKey` 已包含 `targetLanguageCode`，#2 的 track-key 隔离复用它，不新增 `buildTrackKey`。
- `parseYouTubeSubtitleEvents(events, languageCode)` 已接收 language 参数；#1/#2 沿用，不改动 parser 签名。
- 上游 `YouTubeSubtitleOverlay` 使用 `postProcessSubtitles`（shape-gate 统一入口）而非下游的 `optimizeSubtitles`；#2 的「保守精炼」是「在翻译/asr 场景下绕过 shape-gate、直接走 `refineAsrFragments`」，不是替换 `postProcessSubtitles`。
- #3 `asrMergeDurationMs` 归入 `YTSubtitleConfig`（与字幕样式同级），不是 `YTConfig`。
- #9 `alwaysEnableSubtitles` 归入 `YTConfig`（与 `blockNativeSeek` 同级）。
- #6 重试只在 `alwaysEnableSubtitles === true` 时启用（与下游一致）；`alwaysEnableSubtitles === false` 时不引入新重试，避免改变上游现状。
- #7 失败阈值固定 3，常量名 `FALLBACK_NOTICE_FAILURE_THRESHOLD`。
- #4 `youtubeMainVideo()` 回退顺序：`#movie_player` → `ytd-player #movie_player` → `#movie_player`，再在 player 内查 `video.html5-main-video` → `video`。
- #10 `eventHitsAnyVideoSurface` 与现有 `eventHitsVideoSurface` 并存，后者不改。
- 不破坏 `YouTubeSubtitleOverlay` 现有公共 API（`mount`/`unmount`/`updateSettings`/`selectSubtitle` 等）与 `subtitleOverlay.page.ts` 的 bridge 消息契约。
- 不改动 Immersive Translate 让位逻辑（`shouldYieldToImmersiveTranslate` / `isChineseLanguageCode`）。

# Decisions

- D1：#1 采用下游 `splitFragmentBySentencePunctuation(fragment, language)` + `getTextLength(part, isCJK)` 字符加权方案；`splitBySentencePunctuation(fragments, language)` 透传 language。
- D2：#2 复用上游 `SubtitleOption` 体系：`shouldUseConservativeSubtitleRefine(option)` 判定 `option.kind === 'translated' || option.sourceTrack.kind === 'asr'`；`buildSubtitleUrl` 已通过 `applySubtitleOptionTarget` 注入 tlang，无需新增 tlang 注入逻辑。
- D3：#2 `isTlangRemovedOnly` 比较上下游 option key（`buildSubtitleOptionKey` 产出，已含 `targetLanguageCode`），仅当「前 key 含翻译、后 key 不含翻译、其余段相同」时返回 true，避免完整重载。
- D4：#3 默认 7000ms（保持上游现状），下游默认 1000ms 不采纳；clamp [1000, 10000]。
- D5：#3 slider 仅在保守精炼路径（`currentUsesConservativeRefine`）激活时本地重算，否则不动；`currentRawFragments` / `currentTrackLanguage` / `currentUsesConservativeRefine` 为新增内部状态。
- D6：#9 `alwaysEnableSubtitles` 默认 `false`；为 true 时 `shouldApplyNativeToggleMemory` 仍可工作但 `restoreNativeToggleForCurrentPage` 的 `targetEnabled` 强制为 true；与 `rememberNativeToggle` 并存，不互斥。
- D7：#10 只新增 `eventHitsAnyVideoSurface`，不改 `YouTubeFastPause` / `BilibiliFastPause` 现有调用（仍用 `eventHitsVideoSurface(e, this.videoCtrl.video)`）；工具函数供未来使用，不在本轮接入调用点。
- D8：不做运行信息浮层（#10 下游浮层）——上游 H5Enhancer 架构不同、投入产出比低，本轮不引入 `getRuntimeStatus` 接口与 popover UI。

# Open questions

- [blocking] CONFIRM: 目标=回流入游下游 10 项字幕与健壮性改进（#1–#9 + #11，不含运行信息浮层），工作区=当前 main 分支，#3 默认 7000ms，#9 默认 false，#10 只加 `eventHitsAnyVideoSurface` 工具函数不接入调用点；上述 A1–A22 验收项与约束/非目标范围是否即最终共享理解？

# Verification expectations

- Verifier 逐项核对 A1–A22，每项给出 passed / failed / blocked。
- #1/#3/#7 必须有对应单元测试（`asr-merge.test.ts` 已有测试基座，需新增 CJK 翻译切分用例与 maxMergedDurationMs 用例；#7 失败阈值用现有或新增覆盖层测试）。
- #4/#5/#6/#8/#9/#10 为运行时/DOM 行为，Verifier 通过代码审查 + 现有 svelte-check/vitest 基线验证；若无法在无浏览器环境实跑，标记 blocked 并说明。
- 必要检查：`npm run check`、`npm test`（vitest）。
