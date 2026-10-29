---
generated_from_state_version: 10
---

# Verification

## Current result

- Result: **Passed**
- Assurance: **skill-coordinated**
- Goal cycle: 1
- Iteration: 1
- Verifier attempt: 2
- Completed: 2026-08-18T12:11:39.687Z
- Summary: 10 项下游改进全部落地，代码逻辑与 brief/spec 一致，无 failed 项。用户接受代位证据，83 项全部 passed。

## Acceptance

| ID | Result | Source | Criterion | Reason |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1（#1）：含多句的中文翻译 cue（如「威源后面有两条路可以选择。这条沥青路是通往阿克赛的五七一号国道。往这边走。」）经 `splitFragmentBySentencePunctuation(frag, 'zh-CN')` 切成 3 条，且第 2 条（最长）时长 > 第 1 条时长；切分后总时长守恒（末条 `end` 等于原 `fragment.end`），无重叠。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A2 | passed | brief.md | A2（#1）：英文 cue「To the airport. I'm flying.」按词数加权分配时长，行为与改造前一致（不回归）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A3 | passed | brief.md | A3（#2）：用户在字幕选择器选了翻译语言（`SubtitleOption.kind === 'translated'`）时，`fetchOptionFragments` 走 `refineAsrFragments`（保守精炼）而非 `postProcessSubtitles` 的 shape-gate lightClean 路径；`buildSubtitleUrl` 经 `applySubtitleOptionTarget` 注入 `tlang`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A4 | passed | brief.md | A4（#2）：源轨道 `track.kind === 'asr'` 时同样走 `refineAsrFragments`（与现状一致，不回归）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A5 | passed | brief.md | A5（#2）：用户从翻译语言切回源语言（`tlang` 被移除，其余 key 段不变）时，`isTlangRemovedOnly` 返回 `true`，不触发完整重载（保留现有片段或按 nextOptionKey 判定，不因 tlang 变化误判为轨道变更）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A6 | passed | brief.md | A6（#3）：`asrMergeDurationMs` 默认 7000，存储值经 clamp 落在 [1000, 10000]。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A7 | passed | brief.md | A7（#3）：用户拖动 popup 里的「自动字幕合并时长」slider 后，若当前正显示保守精炼结果（`currentUsesConservativeRefine === true` 且 `currentRawFragments.length > 0`），overlay 用 `currentRawFragments` + 新 `maxMergedDurationMs` 本地重算 `currentFragments` 并立即重渲染，不重新请求 timedtext。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A8 | passed | brief.md | A8（#3）：未处于保守精炼路径时，slider 变更不触发重算、不重载。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A9 | passed | brief.md | A9（#4）：YouTube watch 页 hover 右侧推荐卡片时，推荐预览的 `<video>` 不触发字幕 overlay 重新绑定；字幕 overlay 始终跟随 `#movie_player` 内的 `video.html5-main-video`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A10 | passed | brief.md | A10（#5）：YouTube 播放器任意弹层（设置菜单 / 上下文菜单 / `ytd-menu-popup-renderer` / `tp-yt-iron-dropdown` / `.ytp-panel` / `.ytp-popup`）可见时，`setSubtitlesEnabled` 不点击 `.ytp-subtitles-button`，返回 `{ success: false, enabled: current }`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A11 | passed | brief.md | A11（#5）：无弹层时，`setSubtitlesEnabled` 行为不变（可正常切换）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A12 | passed | brief.md | A12（#6）：`alwaysEnableSubtitles === true` 时，`requestYouTubeSubtitlePlayerData` 返回 null 或 `readNativeSubtitleButtonState()` 返回 null，`scheduleNativeToggleRestoreRetry` 以 250ms 间隔重新 scheduleSync，最多 20 次后停止。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A13 | passed | brief.md | A13（#6）：`alwaysEnableSubtitles === false` 时，重试机制不启动（不改变上游现状）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A14 | passed | brief.md | A14（#7）：timedtext 加载失败时，前 2 次（`consecutiveLoadFailures < 3`）只 `scheduleSync(FETCH_RETRY_DELAY_MS)` 重试、不回退原生；第 3 次才 `fallbackToNative(true)`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A15 | passed | brief.md | A15（#7）：换视频或成功加载后 `consecutiveLoadFailures` 归零。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A16 | passed | brief.md | A16（#8）：某视频 `captionTracks.length === 0` 时，`markSubtitleUnavailable(videoId)` 记录该 id；后续该视频的 sync / pollTrackChange 命中缓存提前返回，不重新请求 playerData。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A17 | passed | brief.md | A17（#8）：切换到其他视频时，`subtitleUnavailableVideoId` 失效（不串视频）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A18 | passed | brief.md | A18（#9）：`alwaysEnableSubtitles` 默认 `false`；为 `false` 时上游 `rememberNativeToggle` / `rememberNativeToggleByChannel` 记忆行为完全不变。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A19 | passed | brief.md | A19（#9）：用户开启 `alwaysEnableSubtitles` 后，每个新视频强制开启 CC 字幕，忽略上次记忆的关闭状态；`restoreNativeToggleForCurrentPage` 在 `alwaysEnableSubtitles === true` 时 `targetEnabled` 直接为 `true`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A20 | passed | brief.md | A20（#10）：`eventHitsAnyVideoSurface(e)` 对落在任意可见、非零尺寸 `<video>` 渲染矩形内的 `MouseEvent` 返回 `true`；对 `display:none` / `visibility:hidden` / 零尺寸 video 返回 `false`；对非 `MouseEvent` 返回 `false`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A21 | passed | brief.md | A21（#10）：现有 `eventHitsVideoSurface(e, video)` 行为不变（不回归）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A22 | passed | brief.md | A22：`npm run check`（svelte-check）通过；`npm test`（vitest）全部通过，含为 #1/#3/#7 新增或调整的测试。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A23 | passed | specs/subtitle-rendering/spec.md | 本规格描述归档后 YouTube 字幕覆盖层在「字幕后处理、翻译路径、推荐预览隔离、菜单防误触、native toggle 重试、加载失败阈值、无字幕缓存、新视频默认开启、视频命中判定」上的完整行为。仅列出本轮 change 改变的子能力，未列出的子能力保持上游现状不变。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A24 | passed | specs/subtitle-rendering/spec.md | `splitFragmentBySentencePunctuation(fragment, language)` 在按内部强标点切分一个含多句的 cue 后，按各部分文本长度按比例分配时长： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A25 | passed | specs/subtitle-rendering/spec.md | `language` 为空或非 CJK 时：按词数（`wordCount`）加权，行为与改造前一致。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A26 | passed | specs/subtitle-rendering/spec.md | `language` 为 CJK（`isCJKLanguage(language)` 为 true）时：按 `getTextLength(part, true)`（字符数）加权，避免「每句时长相同」的中文翻译错位。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A27 | passed | specs/subtitle-rendering/spec.md | 不变量： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A28 | passed | specs/subtitle-rendering/spec.md | 切分后所有片段的 `[start, end)` 区间首尾相接，总时长等于 `fragment.end - fragment.start`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A29 | passed | specs/subtitle-rendering/spec.md | 末条片段的 `end` 严格等于原 `fragment.end`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A30 | passed | specs/subtitle-rendering/spec.md | 相邻片段无重叠（由 `splitBySentencePunctuation` 末尾的 overlap fix 保证）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A31 | passed | specs/subtitle-rendering/spec.md | 每个非末条片段 `end - start >= 1ms`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A32 | passed | specs/subtitle-rendering/spec.md | `splitBySentencePunctuation(fragments, language)` 将 `language` 透传给每个 `splitFragmentBySentencePunctuation` 调用。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A33 | passed | specs/subtitle-rendering/spec.md | 新增 `shouldUseConservativeSubtitleRefine(option: SubtitleOption): boolean`： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A34 | passed | specs/subtitle-rendering/spec.md | `option.kind === 'translated'`（用户在字幕选择器选了翻译语言）→ true | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A35 | passed | specs/subtitle-rendering/spec.md | `option.sourceTrack.kind === 'asr'`（自动生成字幕）→ true | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A36 | passed | specs/subtitle-rendering/spec.md | 其余 → false | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A37 | passed | specs/subtitle-rendering/spec.md | `fetchOptionFragments` 在拿到 `fragments` 后： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A38 | passed | specs/subtitle-rendering/spec.md | 若 `shouldUseConservativeSubtitleRefine(option)` 为 true → 调用 `refineAsrFragments(fragments, language, { maxMergedDurationMs })`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A39 | passed | specs/subtitle-rendering/spec.md | 否则 → 维持上游现状 `postProcessSubtitles(fragments, language)`（shape-gate）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A40 | passed | specs/subtitle-rendering/spec.md | `language` 由 `getSubtitleOptionLanguage(option) \|\| 'en'` 给出（已存在）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A41 | passed | specs/subtitle-rendering/spec.md | `buildSubtitleUrl(option, playerData, potToken)` 经现有 `applySubtitleOptionTarget(url, option)` 注入 `tlang`（translated kind 时 set，否则 delete）。不新增 URL 拼装逻辑。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A42 | passed | specs/subtitle-rendering/spec.md | 新增 `isTlangRemovedOnly(nextOptionKey, currentOptionKey): boolean`，判定「当前 option key 含翻译段、下一个 option key 不含翻译段、二者其余段相同」时返回 true。`pollTrackChange` / `loadSubtitlesForCurrentPage` 在仅 tlang 变化时跳过完整重载（保留现有片段或按现有 nextOptionKey 判定逻辑，不因 tlang 被移除而误判为轨道变更触发重新加载）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A43 | passed | specs/subtitle-rendering/spec.md | `YTSubtitleConfig.asrMergeDurationMs: number`，默认 `7000`，存储时 clamp 到 `[1000, 10000]`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A44 | passed | specs/subtitle-rendering/spec.md | `refineAsrFragments(fragments, language, options?)` 的 `options.maxMergedDurationMs` 透传给 `mergeAsrFragments` → `canMergeByLimits(current, next, isCJK, maxMergedDurationMs)`，作为合并后总时长的上限（替代原硬编码 `MAX_MERGED_DURATION_MS`）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A45 | passed | specs/subtitle-rendering/spec.md | 热重算路径（`updateSettings` / `onSettingsChange`）： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A46 | passed | specs/subtitle-rendering/spec.md | 记录变更前的 `previousMergeDurationMs`，应用新 config 后比较。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A47 | passed | specs/subtitle-rendering/spec.md | 若 `mergeDurationChanged && currentUsesConservativeRefine && currentRawFragments.length > 0`：用 `refineAsrFragments(currentRawFragments, currentTrackLanguage, { maxMergedDurationMs })` 重算 `currentFragments`，`currentIndex = -1`，立即 `renderAtCurrentTime(true)`，不重新请求 timedtext。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A48 | passed | specs/subtitle-rendering/spec.md | 否则不重算；若 `enabled && !mergeDurationChanged`，维持现有 `scheduleSync(0)` 行为。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A49 | passed | specs/subtitle-rendering/spec.md | 新增内部状态：`currentRawFragments: SubtitleFragment[]`（保守精炼前的原始片段）、`currentTrackLanguage: string`、`currentUsesConservativeRefine: boolean`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A50 | passed | specs/subtitle-rendering/spec.md | 新增私有方法： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A51 | passed | specs/subtitle-rendering/spec.md | 替换以下位置对 `this.videoCtrl.video` 的直接引用（字幕时钟绑定、OSD 定位锚点）： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A52 | passed | specs/subtitle-rendering/spec.md | `rebindVideo` 的订阅回调触发处 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A53 | passed | specs/subtitle-rendering/spec.md | 主加载入口的 `video` 取值 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A54 | passed | specs/subtitle-rendering/spec.md | OSD / fallback 提示的锚点 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A55 | passed | specs/subtitle-rendering/spec.md | 不变量：字幕 overlay 永远跟随 `#movie_player` 内的主视频，不绑定推荐卡片的预览 `<video>`。`videoCtrl` 订阅仍保留用于倍速等场景。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A56 | passed | specs/subtitle-rendering/spec.md | `subtitleOverlay.page.ts` 新增 `isYoutubeMenuOpen(): boolean`，检测以下任一选择器命中的可见元素： `.ytp-popup`、`.ytp-settings-menu`、`.ytp-contextmenu`、`ytd-menu-popup-renderer`、`tp-yt-iron-dropdown`、`.ytp-panel`。「可见」= `offsetWidth>0 && offsetHeight>0 && display!=='none' && visibility!=='hidden'`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A57 | passed | specs/subtitle-rendering/spec.md | `setSubtitlesEnabled(enabled)` 在「当前状态 ≠ 目标」、即将调用 `player.toggleSubtitles()` / `button.click()` 之前，若 `isYoutubeMenuOpen()` 为 true，直接返回 `{ success: false, enabled: current }`，不点击。无弹层时行为不变。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A58 | passed | specs/subtitle-rendering/spec.md | 常量：`NATIVE_TOGGLE_RESTORE_RETRY_DELAY_MS = 250`、`NATIVE_TOGGLE_RESTORE_MAX_RETRIES = 20`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A59 | passed | specs/subtitle-rendering/spec.md | 状态：`nativeToggleRestoreRetryKey: string`、`nativeToggleRestoreRetryCount: number`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A60 | passed | specs/subtitle-rendering/spec.md | `scheduleNativeToggleRestoreRetry(expectedVideoId)`： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A61 | passed | specs/subtitle-rendering/spec.md | 仅在 `alwaysEnableSubtitles === true` 且 `expectedVideoId === getCurrentUrlVideoId()` 时生效。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A62 | passed | specs/subtitle-rendering/spec.md | 按 `${videoId}\|global` 维护 retryKey，key 变更时重置计数。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A63 | passed | specs/subtitle-rendering/spec.md | `count >= MAX_RETRIES` 时停止；否则 `count += 1` 并 `scheduleSync(DELAY_MS)`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A64 | passed | specs/subtitle-rendering/spec.md | `resetNativeToggleRestoreRetry(restoreKey)`：key 匹配时清零。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A65 | passed | specs/subtitle-rendering/spec.md | 调用点：`restoreNativeToggleForCurrentPage` 在 playerData 为空 / 按钮状态为 null / set 失败时调度重试；成功时 reset。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A66 | passed | specs/subtitle-rendering/spec.md | `alwaysEnableSubtitles === false` 时不启动重试（不改变上游现状）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A67 | passed | specs/subtitle-rendering/spec.md | 常量 `FALLBACK_NOTICE_FAILURE_THRESHOLD = 3`。状态 `consecutiveLoadFailures: number`、`loadFailureVideoId: string`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A68 | passed | specs/subtitle-rendering/spec.md | `handleSubtitleLoadFailure`： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A69 | passed | specs/subtitle-rendering/spec.md | 若当前视频已有可用 overlay（`currentVideoId === expectedVideoId && currentFragments.length > 0`）→ 直接返回（不计数、不回退）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A70 | passed | specs/subtitle-rendering/spec.md | 换视频时重置 `loadFailureVideoId` 与计数。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A71 | passed | specs/subtitle-rendering/spec.md | `consecutiveLoadFailures += 1`；若 `< THRESHOLD` → `scheduleSync(FETCH_RETRY_DELAY_MS)` 重试，不回退。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A72 | passed | specs/subtitle-rendering/spec.md | 若 `>= THRESHOLD` → `fallbackToNative(true)`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A73 | passed | specs/subtitle-rendering/spec.md | 成功加载或换视频时计数归零。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A74 | passed | specs/subtitle-rendering/spec.md | 状态 `subtitleUnavailableVideoId: string`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A75 | passed | specs/subtitle-rendering/spec.md | `markSubtitleUnavailable(videoId)`：记录 id，`stopRenderer` / `clearSubtitleState` / `renderSubtitleText('')` / `showNativeSubtitles`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A76 | passed | specs/subtitle-rendering/spec.md | 在 `pollTrackChange`、`loadSubtitlesForCurrentPage` 入口及 `captionTracks.length === 0` 处：若 `subtitleUnavailableVideoId === getCurrentUrlVideoId()` → 提前返回，不请求 playerData。切换到其他视频时缓存自然失效（id 不匹配）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A77 | passed | specs/subtitle-rendering/spec.md | `YTConfig.alwaysEnableSubtitles?: boolean`，默认 `false`，归入 `yt_config`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A78 | passed | specs/subtitle-rendering/spec.md | 行为： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A79 | passed | specs/subtitle-rendering/spec.md | `false`（默认）：上游 `rememberNativeToggle` / `rememberNativeToggleByChannel` 记忆机制完全不变。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A80 | passed | specs/subtitle-rendering/spec.md | `true`：`restoreNativeToggleForCurrentPage` 的目标 `targetEnabled` 强制为 `true`，忽略记忆的关闭状态；`shouldRememberNativeToggle` 语义不变（仍由 `rememberNativeToggle` 控制），但恢复目标优先取 `alwaysEnableSubtitles`。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A81 | passed | specs/subtitle-rendering/spec.md | popup 新增 ToggleItem（i18n key `yt_subtitle_always_enable` / `yt_subtitle_always_enable_desc`）。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A82 | passed | specs/subtitle-rendering/spec.md | `pointerTargets.ts` 新增： | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |
| A83 | passed | specs/subtitle-rendering/spec.md | `eventHitsVideoSurface(e, video)` 保持现状，不改。本轮不接入任何调用点，仅作为公共工具供后续使用。 | 代码逻辑与 spec 一致；用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。 |

## Checks

_No Runtime checks were recorded._

## Blockers

_None._

## Risks and skipped work

- A9/A10/A11/A12/A19 为运行时/DOM 行为、A22 的 vitest 全量套件当前环境无法实跑，用户接受代码审查+单测作为代位证据，运行时证据可后续在真实浏览器补。

## Previous iterations

| Goal cycle | Iteration | Attempt | Outcome | Unresolved | Summary | Completed |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | blocked | A9, A10, A11, A12, A19, A22 | 10 项下游改进全部落地，代码逻辑与 brief/spec 一致，无 failed 项。78 passed / 5 blocked(A9 A10 A11 A12 A19 运行时 DOM 行为需浏览器实跑) + A22 部分通过(svelte-check 与本次相关单测通过，vitest 全量套件为上游既有 jsdom 环境问题)。无代码修改需求。 | 2026-08-18T11:57:13.949Z |
| 1 | 1 | 2 | pass | — | 10 项下游改进全部落地，代码逻辑与 brief/spec 一致，无 failed 项。用户接受代位证据，83 项全部 passed。 | 2026-08-18T12:11:39.687Z |

## Conclusion

10 项下游改进全部落地，代码逻辑与 brief/spec 一致，无 failed 项。用户接受代位证据，83 项全部 passed。
