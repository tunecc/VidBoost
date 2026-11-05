---
generated_from_state_version: 14
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 2
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-11-05T13:19:03.866Z
- 摘要: 独立复核 A1-A13：实现与收紧后的等待预算一致，Runtime 刷新检查与当前 candidate 绑定且三项均通过；独立复跑新增测试 37 passed、npm run check 0 errors；未发现阻断缺陷，13 项判 passed。遗留风险为 popup 停止条件对最后一次在途调用无硬上限、单次识别 2s 预算的 250ms 下限、生成输入中的 dist/.DS_Store 可能再次引入证据漂移，以及真实登录态/多 frame 运行态未复现。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `A1` 多 frame 约束：内容脚本运行在子 frame（`window.top !== window`，例如 `s1.hdslb.com` 的 iframe）时，收到 `VB_BB_SUBTITLE_CURRENT_UPLOADER` 不调用 `sendResponse`；只有顶层 frame 响应。模拟「子 frame 先就绪、顶层 DOM 很大」的并发响应时，popup 收到的是顶层 frame 的识别结果而不是 `null`。 | content/index.ts:527 与 index.firefox.ts:514 在响应 VB_BB_SUBTITLE_CURRENT_UPLOADER 前先判 !isTopFrameContext() 直接 return（webext.ts:208，window.top===window，try/catch）；子 frame 不调用 sendResponse，顶层 frame return true 异步响应；webextFrame.test.ts 两条用例通过。并发场景由该守卫逻辑保证，未做真实多 frame 集成测试。 |
| A2 | passed | brief.md | `A2` 识别来源：新版视频页（无 `#v_upinfo`，UP 信息在 `.up-info-container` / `.up-detail-top`）识别出 UID 与昵称；`//space.bilibili.com/<uid>/`、带 `spm_id_from` 查询参数、纯 UID、昵称输入都能归一到同一目标值。 | 选择器保留 #v_upinfo / .up-info-container / .up-detail-top / .video-owner / a.up-name；bilibiliUploaderProfile.test.ts 覆盖新版布局识别 UID 596842980 与昵称南翔、旧布局、推荐位隔离，以及 //space...?spm、完整链接、纯 UID、@昵称均归一到同一值。本轮未改动选择器逻辑。 |
| A3 | passed | brief.md | `A3` 等待就绪：请求到达时 UP 主 DOM 尚未渲染，则在有界等待窗口内轮询 DOM（`/video/BV…` 页面 1000ms，其它受支持页面 400ms）；信息出现后返回正确结果，不在等待窗口内直接返回 `null`，且单次识别总耗时不超过 2s。 | uploaderProfile.ts 等待常量为 150ms 间隔、BV 页面 1000ms、非 BV 页面 400ms；waitForBilibiliUploaderSnapshot 在有界窗口内轮询，信息出现即返回（uid+name）或返回部分结果；测试断言 BV 页面 DOM 等待 900-1100ms、非 BV 页面 <=450ms。按代码计算 DOM 阶段约 1050ms，剩余预算交给接口，单次识别约 2s。 |
| A4 | passed | brief.md | `A4` 接口回退：DOM 在等待窗口内仍无 UP 信息，且页面 URL 可解析出 `BV` 号时，用 `https://api.bilibili.com/x/web-interface/view?bvid=<BV>` 的 `data.owner` 作为回退，接口只使用单次识别剩余的等待预算；接口失败或非 `/video/BV…` 页面时返回带原因的空结果，不抛错。 | resolveBilibiliUploaderSnapshot 仅在 DOM 缺 UID 且 URL 可解析 BV 时请求 https://api.bilibili.com/x/web-interface/view?bvid=，credentials include，code===0 取 data.owner.mid/name；AbortController 超时取 min(1200ms, 2000ms-elapsed)；非 BV 或禁用回退时返回带 not-ready 的空结果，不抛错。测试覆盖回退、仅名称补 UID、失败降级、非视频页不触网。 |
| A5 | passed | brief.md | `A5` 缓存语义：UP 主识别结果只缓存非空值；空结果（未就绪 / 接口失败）不写入页面级缓存，下一次读取会重新尝试；同一页面 key 下非空缓存可复用。 | storeUploaderCache 对 targets 为空或 profile 全空直接 return；只把非空结果写入页面 key 缓存；getCurrentUploaderTargets 与 resolveCurrentUploader 的空结果都不写缓存，下次读取重新解析；测试覆盖首轮无 UP 时继续重试并最终成功。 |
| A6 | passed | brief.md | `A6` popup 单次点击成功：在顶层 frame 需要短暂等待或第一次消息失败时，popup 自动重试（最多 3 次调用、间隔 300ms / 600ms），最终成功加入并提示「已添加」；整个过程中不要求用户再次点击。 | bilibiliUploaderLookup.ts 最多 3 次调用、间隔 300/600ms；测试覆盖第 3 次成功、消息异常重试、慢调用停止、总预算停止；App.svelte 在 pending 期间禁用按钮并显示添加中，成功后写入目标并提示已添加。 |
| A7 | passed | brief.md | `A7` popup 失败提示：确认不是 B 站视频页（如首页、频道页）时，提示明确指向「当前页面不是 B 站视频页」；是视频页但确实拿不到 UP 主信息时，提示「暂时没拿到 UP 主信息，请稍后重试」，两种提示可区分。 | unsupported-page 走 bb_subtitle_add_current_not_video，其它失败走 not_ready；i18n 的 en/zh-CN 两个新键均存在；内容脚本为 <all_urls> 注入，非 B 站顶层页也返回 unsupported-page；测试断言 unsupported-page 只调用一次且不 sleep。 |
| A8 | passed | brief.md | `A8` 白名单不提前放弃：白名单模式下进入视频页时首轮 UP 读取为空，自动流程继续按退避重试，直到识别出 UP 主并判定是否命中；只有确认不在白名单才停止对该页面的处理。 | resolveTargetMatch 对空 targets 返回 unknown，scheduleUnknownUploaderRetry 以 1000ms 退避并在开始计时 20s 后停止；只有 mismatch 才停止该页面；测试覆盖首轮无 UP 不放弃、后续 DOM 出现后成功、非白名单不点击。 |
| A9 | passed | brief.md | `A9` 站内 SPA 切换：在视频页通过「接下来播放」切到另一 UP 主的视频后，扩展在有限时间内感知切换（不依赖标题变化），按新视频的 UP 主重新判定白名单，并对命中视频自动开启中文字幕。 | maybeHandleNavigation 由 1000ms URL 轮询、popstate 与 title observer 触发，URL 变化即 resetPageState 并延迟 1800ms 重判；测试用 history.pushState 切换后对新 UP 主重新判定并开启字幕。真实扩展运行态未复现。 |
| A10 | passed | brief.md | `A10` 点击生效校验：点击中文字幕项后校验其进入激活态（`bpx-state-active` 等）；未生效则在退避间隔内重试，不直接把该页面标记为已完成；已激活的中文字幕不会重复点击，也不会被自动流程关闭。 | 点击后 waitForChineseSubtitleActivation 以 200ms 轮询、1200ms 超时校验 bpx-state-active/active/aria-checked/data-state；未生效返回 retry 并进入 600ms 退避，不把页面标记为完成；已激活的中文项直接 done 不重复点击；测试覆盖未生效重试与已激活不点击。限制：本机未登录 B 站，真实字幕 UI 未在线复现。 |
| A11 | passed | brief.md | `A11` 优先级回归：多条中文字幕并存时仍优先 `ai-zh`（AI 中文），其次 `zh-Hans` / `zh-CN` / 其它 `zh*`，再退到文本包含中文标记的项；`bb_subtitle.enabled=false` 或 `targetMode=all` 时行为与现状一致。 | PREFERRED_SUBTITLE_SELECTORS 的 ai-zh → zh-Hans → zh-CN → zh* 优先顺序保留，文本中文标记作为回退；测试断言 ai-zh 优先于 zh-CN、英文项不匹配；enabled=false 时 mount 不执行且 updateSettings 清理定时器并停止 URL 轮询；targetMode=all 时直接通过过滤。 |
| A12 | passed | brief.md | `A12` 回归与构建：新增单元测试通过；`npm run check` 通过；`npm run build:chrome` 成功。 | 独立复跑 4 个新增测试文件 37 passed、npm run check 0 errors/0 warnings；Runtime 刷新检查（13:14:42Z，candidateId 015382… 未变）三项均 passed，build:chrome exit 0。初次提交时曾因 dist/.DS_Store 造成的生成输入漂移被拒，已按 Runtime 指示 refreshChecks 重跑并取得当前有效证据。 |
| A13 | passed | brief.md | `A13` 等待有界：单次识别（DOM 等待 + 接口回退）总耗时 ≤2s；popup 从点击到出结果 ≤3s，单次调用已用满预算（≥1s）或总耗时已达上限时不再发起下一次重试；非 `/video/BV…` 页面在 ≤1s 内给出结果或 `not-ready`。 | 我的计算：BV 页面 DOM 等待约 1050ms + 接口剩余约 950ms ≈ 2.0s；非 BV 页面约 450ms 且不触发接口，<=1s。popup 最坏为非 BV 未就绪 3 次调用（3×约 450-500ms + 300ms + 600ms）≈2.25-2.4s；BV 未就绪首调用约 2s 即因 >=1000ms 停止；均 <=3s。lookup 在单次 >=1000ms 或累计 >=3000ms 时不再发起下一次重试，unsupported-page 快速返回；测试覆盖慢调用与总预算停止。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| B站字幕与 UP 主识别单元测试 | vitest run src/lib/__tests__/bilibiliUploaderProfile.test.ts src/lib/__tests__/bilibiliAutoSubtitle.test.ts src/lib/__tests__/bilibiliUploaderLookup.test.ts src/lib/__tests__/webextFrame.test.ts | . | passed | 0 | 2078 ms |
| svelte-check 类型检查 | run check | . | passed | 0 | 2745 ms |
| Chrome 扩展构建 | run build:chrome | . | passed | 0 | 5270 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- scoped vitest (4 files): passed — 37 tests passed
- npm run check: passed — 0 errors / 0 warnings
- npm run build:chrome: passed — 构建成功
- 已知限制: 未在真实扩展运行环境验证 tabs.sendMessage 多 frame 竞速修复；证据为 Chrome 首个响应语义 + 页面实测 2 个 s1.hdslb.com iframe + 守卫单元测试。
- 已知限制: 本机浏览器未登录 B 站，登录态字幕 UI 的点击生效无法在线复现；A10 以 jsdom 用例与代码审查为证据。
- 已知限制: 全量 vitest 存在与本 change 无关的既有失败：默认环境下 101 个失败用例 + 9 个 unhandled errors；--environment=jsdom 下 13 个失败用例；两者均只落在未改动的 YouTube 字幕/media-kernel 测试，已在干净 HEAD worktree 复现同类基线。
- 已知限制: A9 的真实浏览器 SPA 行为仅做了页面级实测（URL/标题/DOM 时序），未在扩展运行态复现。

## 阻塞项

_无。_

## 风险与跳过的工作

- popup 停止条件只约束“是否发起下一次调用”，没有对最后一次在途调用设硬上限；若出现单次 400-1000ms 的 not-ready 路径，第 3 次调用可能把总时长推过 3s。当前内容脚本的 not-ready 时长只有约 0.45s（非 BV）或 >=1s（BV），因此不可达，但属结构性余量风险。
- resolve 的 remainingMs = max(250, 2000-elapsed) 在 DOM 阶段异常超过 1.75s 时会让单次识别超过 2s；默认 1s 窗口下实测路径约 2.0s（含定时器抖动），当前不构成失败。
- A2/A9/A10 与多 frame 并发本轮未在真实扩展运行态复现，证据为代码审查 + jsdom + Runtime 检查；Builder 声明的登录态限制无法独立证伪。
- 初次提交时 Runtime 判定检查输入漂移，定位为 macOS 在检查完成后生成的 dist/.DS_Store 被计入生成输入快照，并非源码或候选变化；按 Runtime 指示 refreshChecks 重跑后内容指纹恢复为原值 cdfb8694…。若 Finder 再次在该目录写入 .DS_Store，可能再次触发同类漂移。
- 全量测试既有失败的声明属实：独立复跑默认环境 101 failed / 9 errors、--environment=jsdom 13 failed，失败文件全部落在未改动的 YouTube subtitle/media-kernel 测试。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 独立复核 A1–A12：实现与目标规格基本一致，Runtime 检查对应当前工作树，独立复跑新增测试（33 passed）与 npm run check（0 errors）通过，未发现阻断性缺陷；12 项验收全部判 passed。风险集中在真实登录态浏览器未复现、全量既有失败数量与 Builder 声明不符（101 vs 13）、popup 极端等待时长，以及若干 spec 次要偏差。 | 2026-11-05T12:27:42.601Z |
| 1 | 1 | 1 | recovery | — | 用户要求收紧「加入当前视频UP」的等待预算：识别单次≤2s、popup 最坏约≤3s，非 BV 页面快速失败；功能修复内容不变，仅调整时序与对应验收项。 | 2026-11-05T12:31:29.899Z |
| 2 | 1 | 1 | pass | — | 独立复核 A1-A13：实现与收紧后的等待预算一致，Runtime 刷新检查与当前 candidate 绑定且三项均通过；独立复跑新增测试 37 passed、npm run check 0 errors；未发现阻断缺陷，13 项判 passed。遗留风险为 popup 停止条件对最后一次在途调用无硬上限、单次识别 2s 预算的 250ms 下限、生成输入中的 dist/.DS_Store 可能再次引入证据漂移，以及真实登录态/多 frame 运行态未复现。 | 2026-11-05T13:19:03.866Z |



## 结论

独立复核 A1-A13：实现与收紧后的等待预算一致，Runtime 刷新检查与当前 candidate 绑定且三项均通过；独立复跑新增测试 37 passed、npm run check 0 errors；未发现阻断缺陷，13 项判 passed。遗留风险为 popup 停止条件对最后一次在途调用无硬上限、单次识别 2s 预算的 250ms 下限、生成输入中的 dist/.DS_Store 可能再次引入证据漂移，以及真实登录态/多 frame 运行态未复现。
