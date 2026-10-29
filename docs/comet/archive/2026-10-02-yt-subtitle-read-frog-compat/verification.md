---
generated_from_state_version: 12
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 2
- 验证器尝试次数: 1
- 完成时间: 2026-10-02T07:41:22.171Z
- 摘要: 第 2 轮验收 9/9 全部通过。A1/A3-A9 以实现代码逐行阅读 + spec 8 对照 + 单测覆盖分析 + 三项检查独立复跑判定（svelte-check 0 错 0 警、readFrogCompat 15/15、selector 回归 10 文件 69/69；候选文件 mtime 最晚 06:47 UTC，早于 Builder 交接提交 07:32 UTC，检查记录归属当前候选）。A2 由用户 2026-10-02 真机实测证据（Chrome + Read Frog，English watch 页徽标 OFF→ON、翻译接管、VidBoost 不叠加渲染、手动 Alt+C 正常）结合代码级逐步核实综合判定通过。上一轮指出的重试路径边界偏差已修复并核实：run() attempt 循环对 state===null 直接放弃，新增单测 'stops retrying once the badge becomes unreadable after a dispatch' 断言派发数不再增长，与 spec 8.2「仅当徽标可读且为 OFF 时才派发」一致。未发现新的实现问题。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `A1`：「兼容 Read Frog」开关默认关闭；popup 中该开关行出现在「兼容沉浸式翻译」行下方，切换后立即生效并持久化；旧版本存储缺少该字段时回退 `false` 不报错；`yt_subtitle_compatible_read_frog` 与 `yt_subtitle_compatible_read_frog_desc` 在 zh / en 两套字典中均存在。 | DEFAULT_SETTINGS.yt_subtitle.compatibleWithReadFrog 默认 false；cloneYTSubtitleConfig 对缺字段回退 fallback（=DEFAULT_SETTINGS，false）不报错；popup 开关行位于 IT 行正下方（App.svelte 2189 vs 2247），同款行布局/tooltip/禁用态（跟随 ytSubtitleStyleDisabled），点击即 updateYtSubtitleConfig 更新状态并由响应式 $: 块 scheduleSettingsSave 持久化；yt_subtitle_compatible_read_frog 与 _desc 在 en、zh 两套字典均存在（i18n.ts diff 核实）。 |
| A2 | passed | brief.md | `A2`：开关开启 + watch 页 + 非中文字幕（语言代码非 `zh` 前缀）+ Read Frog 已启用（页面出现其翻译按钮容器）→ VidBoost 不渲染自己的覆盖层、移除自身隐藏原生字幕的样式（原生字幕短暂可见），并向 `document` 派发 Alt+C keydown / keyup 合成事件，Read Frog 徽标由 OFF 翻为 ON、翻译接管显示。 | 代码级核实：两个触发点命中 shouldYieldToReadFrog 后 yieldToReadFrog 执行 stopRenderingAndRestoreNativeSubtitles（abortPendingLoad/stopRenderer/clearSubtitleState/renderSubtitleText('')/destroyOverlay/setNativeSubtitlesHidden(false)）并 activate(key)；dispatchReadFrogToggleShortcut 向 document 派发成对 keydown+keyup（altKey:true、code:KeyC、key:c），单测断言字段与目标。端到端「徽标 OFF→ON、翻译接管」由 Builder 交接中用户 2026-10-02 真机实测证据确认：Chrome + Read Frog、开 Read Frog 兼容关 IT 兼容、English watch 页上 VidBoost 不渲染自身覆盖层、徽标自动 OFF→ON、翻译接管、手动 Alt+C 正常——与 A2 场景逐点对应（真机证据为用户提供，本环境无法独立复跑，但 VidBoost 侧每一步均有代码与单测佐证，综合判定通过）。 |
| A3 | passed | brief.md | `A3`：触发守卫——徽标已为 ON 时不派发事件（不得把已开启的翻译切回 OFF）；同一视频同一字幕轨在 1.2s 轮询中只触发一次派发；用户经 Read Frog 自身 UI（面板开关或快捷键）手动关闭后，同一视频内 VidBoost 不再自动重开，切换视频或字幕轨后恢复触发。 | 守卫三件套均落实且有单测：attempt 循环顶部 state==='on' 直接 return（ON 不派发）；triggeredKeys 按 key（buildSubtitleOptionKey 含 videoId+kind+vssId+targetLang）去重，activate 同 key no-op，1.2s 轮询不重复派发；成功后 run 结束且 key 留在去重集，用户手动关闭后同 key 不再激活，新 key（换视频/换轨）恢复触发。单测 15/15 覆盖三条守卫。 |
| A4 | passed | brief.md | `A4`：中文字幕（`zh*` 语言代码）时：不让位、不派发事件，VidBoost 正常自渲染字幕（行为与开关关闭时一致）。 | shouldYieldToReadFrog 第二行 isChineseLanguageCode 命中即 return false，两个触发点均不进入让位分支、不调用 activate、不派发事件，正常走 fetchOptionWithFallback 自渲染；结构与 IT 路径一致，行为与开关关闭时相同。 |
| A5 | passed | brief.md | `A5`：开关关闭，或 Read Frog 未安装 / 未启用其视频字幕功能（页面无其按钮容器）时：VidBoost 正常自渲染翻译字幕，不派发事件、不让位、不显示原生字幕裸奔态。 | 开关关闭时首行 return false；Read Frog 缺席时 findReadFrogTranslateButtonContainer 返回 null 亦 return false（jsdom 单测：容器缺失状态读取为 null）。两种情况下不派发、不让位、不触及 setNativeSubtitlesHidden，VidBoost 正常自渲染，无原生字幕裸奔。 |
| A6 | passed | brief.md | `A6`：IT 优先——「兼容沉浸式翻译」让位条件成立（IT 开关开 + 非中文）时保持现有 IT 让位行为，且不派发 Read Frog 快捷键；IT 条件不成立而 Read Frog 条件成立时才触发 Read Frog 让位。 | 两个触发点均为 shouldYieldToImmersiveTranslate 判定 + return 在前（YouTubeSubtitleOverlay.ts 996-1006、1167-1177），IT 让位成立时提前返回、Read Frog 分支不可达故不派发其快捷键；IT 条件不成立（开关关）而非中文且 RF 在场时才进入 yieldToReadFrog。评估顺序符合 spec 8.2。 |
| A7 | passed | brief.md | `A7`：让位决策时 Read Frog 按钮容器尚未挂载（页面刚加载的扩展竞态）→ 在有界时长内轮询等待容器出现后再派发；超时后安全放弃（不抛错、不留常驻定时器），原生字幕保持可见。 | run() 先以 waitIntervalMs=500/waitTimeoutMs=10s 有界轮询等待容器/徽标可读，超时 state===null 直接 return（不抛错）；sleep 为普通 setTimeout 且全部处于有界循环内、每次唤醒检查 superseded，无常驻定时器/observer；unmount() 调用 readFrogActivation.reset() 清去重集并令在途流程经世代号退出；让位时已 setNativeSubtitlesHidden(false)，原生字幕保持可见。单测 'gives up safely when the badge never becomes readable' 与 'cancels the in-flight run when reset is called' 覆盖。 |
| A8 | passed | brief.md | `A8`：`npm run check`（svelte-check）无错误。 | Verifier 独立复跑 npm run check：svelte-check 0 errors 0 warnings（仅 browserslist 数据过期提示，非错误）。 |
| A9 | passed | brief.md | `A9`：新增 vitest（jsdom）用例全部通过：徽标状态读取三分支（ON / OFF / 缺失）、合成事件构造与派发目标（document、altKey、code=KeyC、keydown+keyup 成对）、守卫逻辑（ON 不派发、同键去重、手动关闭后同视频不重开）。 | readFrogCompat.test.ts 15 用例：徽标三分支（ON/OFF/容器缺失，另加徽标不可读分支）、事件构造与派发目标（document、altKey、code=KeyC、keydown+keyup 成对、key='c'）、守卫（ON 不派发、同 key 去重、手动关闭同视频不重开、新 key 恢复、有界重试、派发后徽标不可读停止重试、reset/新 key 取消在途）。Verifier 独立复跑 15/15 通过。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| svelte-check | run check | . | passed | 0 | 2991 ms |
| vitest-read-frog-compat | vitest run src/features/youtube/__tests__/readFrogCompat.test.ts --environment=jsdom | . | passed | 0 | 1402 ms |
| vitest-selector-regression | vitest run src/features/youtube/subtitle/selector --environment=jsdom | . | passed | 0 | 1971 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- npm run check: passed — svelte-check 0 errors 0 warnings
- npx vitest run src/features/youtube/__tests__/readFrogCompat.test.ts --environment=jsdom: passed — 15/15 通过（含新增 badge 不可读停止重试用例）
- npx vitest run src/features/youtube/subtitle/selector --environment=jsdom: passed — 10 文件 69 用例回归通过
- manual functional verification on YouTube with Read Frog installed: passed — 用户真机实测：关闭 IT 兼容后自动开启生效（徽标 OFF→ON、翻译接管、VidBoost 不叠加渲染）；手动 Alt+C 切换正常
- 已知限制: 两个兼容开关同时开启时 IT 让位优先（D5），会遮蔽 Read Frog 自动开启——用户已知悉，将在新 change 合并双开关并改为 Read Frog 在场优先
- 已知限制: 用户重映射 Read Frog 切换快捷键（默认 Alt+C）时自动开启静默失效，让位行为仍生效

## 阻塞项

_无。_

## 风险与跳过的工作

- 已知限制（用户确认，不构成验收失败）：两兼容开关同开时 IT 让位优先（brief D5）遮蔽 Read Frog 自动开启，将在后续新 change 合并双开关解决；用户重映射 Read Frog 快捷键时自动开启静默失效（brief 非目标）。
- triggeredKeys 去重集在长 SPA 会话（不触发 unmount）内随视频/轨道数量增长，单条 key 体量极小且 unmount 会清空，实际影响可忽略。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | blocked | A2 | 9 项验收 8 项通过、1 项 blocked。A1/A3-A9 以代码级核实 + 单测 + 独立复跑三项检查判定（svelte-check 0 错 0 警、readFrogCompat 14/14、selector 回归 69/69；候选文件 mtime 均早于 runtime 检查时间，检查记录对应本候选）。A2 blocked：VidBoost 侧让位与派发行为已核实，但『徽标 OFF 翻 ON、翻译接管显示』的端到端证据需 Chrome + Read Frog 1.49.x 真机环境，当前无法获得。 | 2026-10-02T06:45:05.856Z |
| 1 | 1 | 1 | recovery | — | 按用户选择回 Build 修复：Verifier 发现 createReadFrogActivationController 的重试路径边界偏差——派发后验证超时且徽标变为不可读（null，如容器被移除）时，下一次 attempt 仍会派发，偏离 spec「仅当徽标可读且为 OFF 时才派发」。修复为 attempt 循环内对 null 直接放弃；补充对应单测。用户随后在装有 Read Frog 的真机 Chrome 上验证 A2 场景（徽标 OFF→ON、翻译接管、VidBoost 不叠加渲染），观察结果将随下一轮 Builder 交接提供给新 Verifier。 | 2026-10-02T06:46:38.806Z |
| 1 | 2 | 1 | pass | — | 第 2 轮验收 9/9 全部通过。A1/A3-A9 以实现代码逐行阅读 + spec 8 对照 + 单测覆盖分析 + 三项检查独立复跑判定（svelte-check 0 错 0 警、readFrogCompat 15/15、selector 回归 10 文件 69/69；候选文件 mtime 最晚 06:47 UTC，早于 Builder 交接提交 07:32 UTC，检查记录归属当前候选）。A2 由用户 2026-10-02 真机实测证据（Chrome + Read Frog，English watch 页徽标 OFF→ON、翻译接管、VidBoost 不叠加渲染、手动 Alt+C 正常）结合代码级逐步核实综合判定通过。上一轮指出的重试路径边界偏差已修复并核实：run() attempt 循环对 state===null 直接放弃，新增单测 'stops retrying once the badge becomes unreadable after a dispatch' 断言派发数不再增长，与 spec 8.2「仅当徽标可读且为 OFF 时才派发」一致。未发现新的实现问题。 | 2026-10-02T07:41:22.171Z |



## 结论

第 2 轮验收 9/9 全部通过。A1/A3-A9 以实现代码逐行阅读 + spec 8 对照 + 单测覆盖分析 + 三项检查独立复跑判定（svelte-check 0 错 0 警、readFrogCompat 15/15、selector 回归 10 文件 69/69；候选文件 mtime 最晚 06:47 UTC，早于 Builder 交接提交 07:32 UTC，检查记录归属当前候选）。A2 由用户 2026-10-02 真机实测证据（Chrome + Read Frog，English watch 页徽标 OFF→ON、翻译接管、VidBoost 不叠加渲染、手动 Alt+C 正常）结合代码级逐步核实综合判定通过。上一轮指出的重试路径边界偏差已修复并核实：run() attempt 循环对 state===null 直接放弃，新增单测 'stops retrying once the badge becomes unreadable after a dispatch' 断言派发数不再增长，与 spec 8.2「仅当徽标可读且为 OFF 时才派发」一致。未发现新的实现问题。
