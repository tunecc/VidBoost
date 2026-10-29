---
generated_from_state_version: 25
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 6
- 验证器尝试次数: 1
- 完成时间: 2026-10-29T13:22:33.914Z
- 摘要: 第三轮独立只读复核：A1–A12 全部通过。逐项核对实现 diff 与新增 20 个用例，行为与 brief 验收示例吻合。A6 特别核对成立：handleNavigationStart 同时 reset 控制器与清空失败集合，yt-navigate-start、route poll、syncCurrentPage 三处调用点加 unmount 共四条清理路径，reset 不触发回退，未导航时失败 key 仍阻止重复让位。A10/A11 以 action 24 收据为准并核对了日志 sha256 与 inputSnapshot 完整性和指纹；Verifier 另行只读重跑 vitest 得到相同的 45 passed。工作区清理复核确认不触及 Cometix 兼容逻辑。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `A1`：在场检测——页面存在 `#cometix-imt-root` 时 `isCometixTranslatePresent()` 返回 `true`；元素移除后返回 `false`；`document` 不可用（SSR/非浏览器）时返回 `false` 且不抛错。 | isCometixTranslatePresent 经 findCometixTranslateRoot 只查 #cometix-imt-root，document 不可用时返回 null/false 不抛错；cometixCompat 三个 A1 用例覆盖在场、移除后、document 不可用。 |
| A2 | passed | brief.md | `A2`：接管检测——页面存在 `#immersive-translate-caption-window` 时 `hasCometixTranslateTakenOver()` 返回 `true`，不存在时返回 `false`；仅存在 `#cometix-imt-root` 时仍返回 `false`。 | hasCometixTranslateTakenOver 只认 #immersive-translate-caption-window；用例验证仅挂 root 时为 false、挂 caption window 后为 true、document 不可用返回 false。 |
| A3 | passed | brief.md | `A3`：让位动作——判定为 `cometix-translate` 时，VidBoost 停止自渲染并移除自身隐藏原生字幕的样式（`#vb-yt-subtitle-native-hide` 不存在），且调用一次原生 CC 确保开启（`requestYouTubeSubtitleEnsureEnabled` 被调用），随后进入接管等待。 | yieldToCometixTranslate 先 stopRenderingAndRestoreNativeSubtitles（setNativeSubtitlesHidden(false) 移除 #vb-yt-subtitle-native-hide）再 activate；控制器 run() 首步调用注入的 ensureNativeCaptions → requestYouTubeSubtitleEnsureEnabled，每次 activate 恰好一次，随后进入 500ms×6s 接管等待。 |
| A4 | passed | brief.md | `A4`：三路优先级——开关开启且字幕非中文时：Read Frog 在场 → `read-frog`；Read Frog 缺席且 Cometix 在场 → `cometix-translate`；两者皆缺席 → `immersive-translate`；开关关闭或中文字幕（`zh*`）→ `null`（三者均不让位）。 | resolvePluginTranslateYield 判定顺序为未启用→null、zh 前缀→null、readFrogPresent→read-frog、cometixPresent===true→cometix-translate、否则 immersive-translate；5 个用例覆盖三路优先级、中文与开关关闭。 |
| A5 | passed | brief.md | `A5`：接管成功——让位后在有界时长内出现 `#immersive-translate-caption-window` 时，控制器判定成功、不再触发回退，同一 `videoId + optionKey` 后续轮询不重复让位。 | run() 轮询中 hasTakenOver() 为真即返回且不调用 onFallback；handledKeys 使同 key 后续 activate 为 no-op，用例断言 ensureCalls 仍为 1。 |
| A6 | passed | brief.md | `A6`：超时回退——让位后在等待上限内始终未出现接管窗口时，控制器通知回退、清理计时器；VidBoost 重新自渲染该字幕轨，且同一 key 不再尝试让位（不出现让位/回退循环）。 | run() 在 deadline 后复检 hasTakenOver/present 再调用 onFallback 一次；fallbackFromCometixYield 记入 cometixYieldFailedKeys 并 scheduleSync(0)，下次判定该 key 直接返回 false 继续自渲染。导航清理三处调用点均生效：handleNavigationStart（483-484 行，由 yt-navigate-start、route poll、syncCurrentPage 离开支持页进入）与 unmount 都 reset() 并 clear()，reset 不触发回退；用例验证超时仅回退一次且 reset 后同 key 可再次让位。 |
| A7 | passed | brief.md | `A7`：等待期间用户或插件状态变化——等待中接管窗口出现即成功，与超时互斥；`reset()` 调用后所有在途等待被取消，之后的 `activate` 可按新 key 重新开始。 | 等待循环先查 hasTakenOver 再查 present、超时前复检，二者互斥；reset() 递增世代号并唤醒 sleepUntilSuperseded，在途流程静默退出且不调用 onFallback，随后新 key 可重新开始。 |
| A8 | passed | brief.md | `A8`：Cometix 不在场——页面无 `#cometix-imt-root` 时不进入 Cometix 分支，行为回落为既有「Read Frog 在场 → 让位；否则 IT 让位」，不产生任何 Cometix 相关等待或计时器。 | 无 #cometix-imt-root 时 cometixPresent 为 false，不进入 cometix-translate 分支，行为回落 Read Frog → IT；Cometix 分支是唯一创建等待与计时器处，未命中不产生计时器；等待中 present() 转 false 时放弃且不回退。 |
| A9 | passed | brief.md | `A9`：i18n——`yt_subtitle_compatible_plugin_translate_desc` 在 `zh` 与 `en` 两套字典中均存在，且文案覆盖「Read Frog 优先、Cometix 次之、否则沉浸式翻译」与「Cometix 需自行开启字幕翻译」两点。 | i18n.ts 的 en（约 132 行）与 zh（约 373 行）均存在 yt_subtitle_compatible_plugin_translate_desc，文案覆盖三路优先级与 Cometix 需自行开启两点。 |
| A10 | passed | brief.md | `A10`：静态检查——`npm run check`（svelte-check）无错误。 | Runtime action 24 的 svelte-check status=passed、exitCode=0，日志原文 svelte-check found 0 errors and 0 warnings，实测 sha256 bf9b1656… 与收据 logSha256 一致，inputSnapshot.complete=true 且 before=after=0ae352ca…。 |
| A11 | passed | brief.md | `A11`：单元测试——新增 jsdom 用例全部通过，覆盖 A1、A2、A4、A5、A6、A7 的判定与控制器行为；既有 `readFrogCompat.test.ts` 用例全部通过（零回归）。 | 同一 action 的 vitest exitCode=0，日志原文 2 文件 45 passed（cometixCompat 20 + readFrogCompat 25），日志 sha256 c29deffb… 与收据一致；Verifier 另行只读重跑同一命令同样 45 passed。 |
| A12 | passed | brief.md | `A12`：既有两路零回归——`resolvePluginTranslateYield` 在不传 `cometixPresent` 时，与原实现结果完全一致（`{enabled, readFrogPresent}` 的全部既有组合）。 | 新增 cometixPresent 为可选且以 === true 判定，缺省不进入 Cometix 分支；enabled×readFrogPresent 四组合与中文组合与改动前逐项一致，用例显式断言，readFrogCompat 25 项零回归；该函数唯一生产调用点已同步传参。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| svelte-check | run check | . | passed | 0 | 3278 ms |
| vitest youtube feature tests | vitest run src/features/youtube/__tests__ --environment=jsdom | . | passed | 0 | 1749 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- vitest cometixCompat: passed — 上轮开发期定向检查 20 passed；本轮代码未改动
- svelte-check: not-run — 交由 Runtime 在冻结候选后执行
- 已知限制: Cometix 无法被程序化开启（无默认字幕快捷键、播放器按钮在 closed shadow、配置在扩展私有存储），只做让位与接管验证，需用户自行开启其 YouTube 字幕翻译
- 已知限制: 接管判定以 #immersive-translate-caption-window 出现为准；若 Cometix 改用其他渲染容器则会被误判为未接管并回退自渲染
- 已知限制: 端到端行为（真实 YouTube 页面 + Cometix Translate 扩展）需人工验收，单测只覆盖纯逻辑与 DOM 契约
- 已知限制: 失败集合的导航失效由 handleNavigationStart 驱动；同页内不发生导航时失败 key 仍保持不再重试，以防止让位/回退循环

## 阻塞项

_无。_

## 风险与跳过的工作

- 视频/字幕轨 A→B→A 在 6 秒内快速切换并切回时，activate(A) 因 handledKeys 仍含 A 而为 no-op，既不验证接管也不写失败集合，可能短暂裸字幕直到导航 reset。不违反 A6/A7 与不变量，属可观测鲁棒性缺口，建议后续在 supersede 时从 handledKeys 移除被取代的 key。
- 接管判定只依赖 #immersive-translate-caption-window；Cometix 若改用其他容器会被判为未接管并回退自渲染（brief 已声明的单点依赖）。
- 同页内未发生导航时失败 key 会一直保留不再重试（A6 防回退循环要求），需切换视频或字幕轨才能重新尝试。
- 端到端行为（真实 YouTube 页面 + Cometix Translate 1.32.x 的字幕翻译开/关两态）仍需人工验收，本轮仅覆盖纯逻辑与 DOM 契约。
- 探测脚本默认运行目录已从仓库内 outputs/runtime 改为 ~/.vidboost/runtime；本机已就位，其他机器或 CI 需显式设置 VIDBOOST_RUNTIME_DIR，否则该 Firefox 探测工具会因找不到 PROBE 退出（不影响扩展产物）。
- 工作区清理包含 .gitignore 放行 docs/comet 与历史归档提交 4cce5bd，属仓库治理改动，经复核不改变 src 任何运行时行为。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Runtime checks completed, but their input changed before acceptance. Preserve the original receipts and approve a new Builder candidate; do not replay the old checks. | 2026-10-29T12:02:22.014Z |
| 1 | 1 | 0 | recovery | — | The user chose to repair the implementation after Runtime checks stopped. | 2026-10-29T12:03:03.254Z |
| 1 | 2 | 0 | recovery | — | Runtime checks completed, but their input changed before acceptance. Preserve the original receipts and approve a new Builder candidate; do not replay the old checks. | 2026-10-29T12:19:52.869Z |
| 1 | 2 | 0 | recovery | — | The user chose to repair the implementation after Runtime checks stopped. | 2026-10-29T12:31:07.514Z |
| 1 | 3 | 0 | recovery | — | Runtime checks completed, but their input changed before acceptance. Preserve the original receipts and approve a new Builder candidate; do not replay the old checks. | 2026-10-29T12:36:09.779Z |
| 1 | 3 | 0 | recovery | — | The user chose to repair the implementation after Runtime checks stopped. | 2026-10-29T12:36:18.241Z |
| 1 | 4 | 1 | fail | A6 | A1–A5、A7–A12 通过；A6 失败。超时回退动作本身正确（onFallback 一次、失败 key 不再让位、无循环），但失败集合 cometixYieldFailedKeys 只在 unmount() 清理，导航路径 handleNavigationStart 不清理，与 brief 决策 D8「失败集合随视频/字幕轨 key 变化自然失效」不符。 | 2026-10-29T12:41:00.538Z |
| 1 | 5 | 1 | pass | — | 全部 12 项验收通过。A6 修复成立：handleNavigationStart 同时 reset 控制器并清空失败集合，yt-navigate-start、route poll 与离开支持页三条路径都覆盖；reset() 取消在途等待且不触发回退。action 17 的 svelte-check 为 0 error 0 warning，vitest 为 45 passed，输入快照 complete=true。其余验收项本轮未改判定逻辑，复核通过。 | 2026-10-29T12:45:55.817Z |
| 1 | 5 | 1 | recovery | — | The user chose to revise the implementation after Verify stopped. | 2026-10-29T12:57:38.606Z |
| 1 | 6 | 1 | pass | — | 第三轮独立只读复核：A1–A12 全部通过。逐项核对实现 diff 与新增 20 个用例，行为与 brief 验收示例吻合。A6 特别核对成立：handleNavigationStart 同时 reset 控制器与清空失败集合，yt-navigate-start、route poll、syncCurrentPage 三处调用点加 unmount 共四条清理路径，reset 不触发回退，未导航时失败 key 仍阻止重复让位。A10/A11 以 action 24 收据为准并核对了日志 sha256 与 inputSnapshot 完整性和指纹；Verifier 另行只读重跑 vitest 得到相同的 45 passed。工作区清理复核确认不触及 Cometix 兼容逻辑。 | 2026-10-29T13:22:33.914Z |



## 结论

第三轮独立只读复核：A1–A12 全部通过。逐项核对实现 diff 与新增 20 个用例，行为与 brief 验收示例吻合。A6 特别核对成立：handleNavigationStart 同时 reset 控制器与清空失败集合，yt-navigate-start、route poll、syncCurrentPage 三处调用点加 unmount 共四条清理路径，reset 不触发回退，未导航时失败 key 仍阻止重复让位。A10/A11 以 action 24 收据为准并核对了日志 sha256 与 inputSnapshot 完整性和指纹；Verifier 另行只读重跑 vitest 得到相同的 45 passed。工作区清理复核确认不触及 Cometix 兼容逻辑。
