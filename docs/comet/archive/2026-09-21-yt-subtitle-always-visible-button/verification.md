---
generated_from_state_version: 32
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 4
- 迭代: 3
- 验证器尝试次数: 1
- 完成时间: 2026-09-21T10:36:45.915Z
- 摘要: 第 3 轮候选 A1–A13 全部 passed（按代码契约是否满足规格判定，需真机目视的项已在各项标注）。唯一增量（restoreNativeToggleForCurrentPage 写回前的两条复查：地址未变 + 豁免未登记）位置正确，位于最后一个 await 之后、唯一有副作用的 requestYouTubeSubtitleSetEnabled 之前，确实封住 SPA 跳转窗口，且未挡掉任何合法记忆恢复（channel/global 两模式与进入新视频后的恢复均照常）。其余 A1–A12 独立复核无回归；Verifier 实跑 npm run check 0 error 与 selector vitest 10 files / 58 tests。遗留 8 项风险不构成规格违反，最需要后续处理的是置灰态弹层每 1.2s 重建与「强制开启失败时无提示」。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `A1`：开启「自渲染字幕」后进入一个 YouTube 原生 CC 已关闭的视频播放页，控件栏右侧（设置按钮左边）出现 VidBoost 图标按钮，图标为置灰态（`opacity:.45` + `grayscale(.6)`），无需先点 YouTube 的 CC 按钮。 | YouTubeSubtitleOverlay.ts:731-734 CC 关闭时走 enterIdleSelectorState()（:803-806 = pauseOverlayForNativeToggleOff + syncSubtitleSelectorView）；:772-787 挂载判定已不含目录条件（仅 !enabled \|\| !shouldRenderOverlay() \|\| !isSupportedPage()），目录 null 时以 {provided:[],translated:[]} 调 update()+ensureMounted()；置灰样式常量未改（SubtitleSelector.ts:53 opacity:.45;filter:grayscale(.6)），插在设置按钮前由未改动的 mountTarget.ts 决定（SubtitleSelector.ts:241-246）。需目视：真实控件栏可见性。 |
| A2 | passed | brief.md | `A2`：在 `A1` 的场景点击置灰按钮，弹层展开并列出可选语言；选中一种语言后覆盖层立即渲染该语言字幕，图标转为高亮（`opacity:1`、无灰度），且 YouTube 原生 CC 按钮的 `aria-pressed` 变为 `true`（原生字幕由 VidBoost 隐藏）。 | 灰态仍可点（SubtitleSelector.ts:233-236 无 disabled，open() :428-436 不被空目录阻断）；暂停态由 loadCatalogWithoutRendering() 取一次目录（:809-829，:820-821 失效即弃）；选语言链路 :843-855 → enableNativeToggleIfPaused() :861-873（页侧 subtitleOverlay.page.ts:243-272 把 CC 置 true）→ loadSubtitlesForCurrentPage('user-selection') 渲染并 setNativeSubtitlesHidden(true)+sync 转高亮（:1022-1028）。需目视：CC aria-pressed 与覆盖层时序。 |
| A3 | passed | brief.md | `A3`：进入一个 YouTube 未提供任何字幕（`captionTracks` 为空）的视频，按钮仍常驻并置灰；点击后弹层展开，标题正常，列表区显示「该视频暂无字幕」中文文案（英文界面为对应 en 文案），列表中没有任何语言项。 | captionTracks 为空时 catalog.ts:123-161 返回两组皆空的合法目录（非错误路径）；:980-989 markSubtitleUnavailable → clearSubtitleState() → sync 保挂置灰；缓存命中分支 :933-936、:1148-1151 改为先 sync 再 return；空状态节点 .vb-yt-subtitle-selector-empty 文案取 yt_subtitle_empty_catalog（SubtitleSelector.ts:450-488；i18n.ts:364「该视频暂无字幕」/:136 en），语言项为 0；搜索入口 display:none（:469-474）。需目视：真机面板视觉。 |
| A4 | passed | brief.md | `A4`：字幕拉取连续失败并回退原生字幕后，按钮仍常驻并置灰，不会因为回退而消失。 | handleSubtitleLoadFailure :875-914 达阈值后 fallbackToNative(true)（:1965-1978）只做 clearSubtitleState()（内含 sync），而 syncSubtitleSelectorView 已不再 detach，activeOption=null → 置灰常驻；keepCurrent 分支 :893 亦同步。需目视：断网/403 回退场景。 |
| A5 | passed | brief.md | `A5`：在 popup 中关闭「自渲染字幕」后，已挂载的按钮与弹层立即从控件栏移除；重新开启后按钮无需任何 YouTube 侧操作即再次出现。 | updateSettings :664-688 在配置变化后同步调 syncSubtitleSelectorView()，功能关闭即刻 detach（:773-776）；unmount() :649 destroy()；重开经 scheduleSync(0) → :731-737 无需 YouTube 侧操作即再现；content/index.ts:433 保证设置变更送达（含仅开启记忆开关的模式）。本轮新增的两条复查不在该路径上。 |
| A6 | passed | brief.md | `A6`：进入有字幕且原生 CC 已开启的视频，按钮显示并保持高亮，点击后语言列表的分组、排序、搜索、选中勾选行为与改动前一致。 | catalog.ts / language.ts / menuState.ts / resolver.ts 零 diff；update() 新增的 syncSearchAvailability() 对非空目录只写回与初始样式一致的 inline-flex（SubtitleSelector.ts:81-94 vs :471），renderMenu() 过滤路径不变（:458-460）；原有搜索/键盘用例（menu.test.ts 15 项）全绿。需目视：勾选与徽章视觉。 |
| A7 | passed | brief.md | `A7`：在 YouTube 首页、频道页等非 `/watch` 页面与 `/embed` 内嵌播放器中，不出现 VidBoost 字幕按钮。 | isSupportedPage() :1997-1999 要求 pathname==='/watch' 且有 v，/embed、首页、频道页都落入 detach；pollTrackChange :1128、syncCurrentPage :706-709、updateSettings→sync 三条路径一致；mount() :588 先按 isSiteHost('youtube') 收敛。 |
| A8 | passed | brief.md | `A8`：置灰态按钮的 `aria-label` 与 `title` 仍为「VidBoost 字幕」，`aria-haspopup="dialog"` 保持不变，`aria-expanded` 随弹层开合更新。 | 两态共用文案：update() :168-171 与 ensureMounted() :201/:205 都写 copy.buttonLabel = i18n('yt_subtitle_selector')（i18n.ts:356/:128），无状态分支；aria-haspopup=dialog :202，aria-expanded 于 :204/:364/:433 开合同步；未设 disabled/aria-disabled。 |
| A9 | passed | brief.md | `A9`：页面刚进入、语言目录尚未取到的短暂窗口内按钮已显示为置灰；点击后弹层显示空状态提示，目录取到后（弹层保持打开）自动重渲染出语言项，无需关闭再点。 | 首帧窗口：:737 在 ensureOverlayMounted() 之前先 sync（目录 null → 空目录置灰）；点击后 open() 渲染空状态（:435 空目录不再聚焦被隐藏的搜索按钮）；目录到达 :823-825 → update() :181-184 在 display!=='none' 时原地 renderMenu()+positionMenu()，弹层保持打开且不清搜索状态；menu.test.ts:406-425 覆盖「空→非空自动重渲染」。需目视：真机首帧灰态与切换时序。 |
| A10 | passed | brief.md | `A10`：切换扩展语言（zh ↔ en）后，置灰按钮文案与空状态提示均随语言更新；i18n 的 en 与 zh 两套字典里对应 key 都存在。 | updateSettings :675-682 更新 this.language 后立即 sync，getSubtitleSelectorCopy() :758-770 重建 buttonLabel/emptyMessage；en/zh 两个 key 均在（i18n.ts:136/:364），I18nKey=keyof strings.en 且 svelte-check 0 error 证明两套齐备；createEmptyState() 每次渲染读取 viewModel.copy。需目视：切换语言后弹层文案。 |
| A11 | passed | brief.md | `A11`：`npm run check` 无错误；`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom` 全部通过且用例数不少于基线 10 个文件 / 51 项，新增用例覆盖「目录为空仍挂载」「置灰两态」「空状态文案」。 | Verifier 实跑：npm run check → 0 errors 0 warnings；npx vitest run src/features/youtube/subtitle/selector --environment=jsdom → 10 files / 58 tests（≥ 基线 51）。新增 7 项为真实断言：icon.test.ts:235/242/252（空目录仍挂载、两态、重挂载重算）、menu.test.ts:396/404/406/427（空状态文案、搜索入口隐藏、空→非空、方向键不报错），非空断言见 menu.test.ts:69 的 ALL_OPTION_IDS。 |
| A12 | passed | brief.md | `A12`：`npm run build:chrome` 与 `npm run build:firefox` 均构建成功，未新增 `*.firefox.ts` 分叉实现。 | 改动集仅 5 个 src 文件（git status --short）；find src -name '*.firefox.ts' 只有既有 content/index.firefox.ts，未新增分叉、未新增依赖/import、未触碰 public/manifest.json；构建本身依 Runtime 结果（build:chrome、build:firefox 均 passed）判定，只读 Verifier 未重跑。 |
| A13 | passed | brief.md | `A13`：在开启「记住 YouTube 字幕开关」且记忆状态为关闭的情况下进入视频，原生 CC 为关、按钮置灰；从 VidBoost 面板选语言开启字幕后，继续播放跨过数个 1.2 秒轮询周期，字幕仍保持渲染、YouTube CC 保持开启、按钮保持高亮（记忆恢复不会把这次选择撤回）。 | 增量重点：restoreNativeToggleForCurrentPage 的两个 await 在 :1783（playerData）与 :1794（storage），:1797-1802 均同步；本轮新增的 :1805/:1806 两条复查紧贴唯一副作用 :1809 requestYouTubeSubtitleSetEnabled，即位于最后一次 await 之前，确实覆盖「await 期间 SPA 跳转」窗口。不误伤合法恢复：:1783 的请求带 expectedVideoId 且页侧 :191 保证 id 不符即失败，正常停留期间 :1805 必过；channel/global 两模式只在 :1787-1791 的 key 组成上不同，与新守卫正交；进入新视频时 :470/:474 已清空豁免与 lastNativeToggleRestoreKey，B 视频由 :715/:1132 再次触发，恢复照常；被中止的轮次不会置 lastNativeToggleRestoreKey，无「永不执行」。对 A5/A7 无副作用（守卫只可能提前 return）。豁免登记条件仍严格（:870-872 需地址未变且 readNativeSubtitleButtonState()===true）。需目视：真机跨多个 1.2s 周期的持续性。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| npm run check | run check | . | passed | 0 | 2915 ms |
| npx vitest run src/features/youtube/subtitle/selector --environment=jsdom | vitest run src/features/youtube/subtitle/selector --environment=jsdom | . | passed | 0 | 2247 ms |
| npm run build:chrome | run build:chrome | . | passed | 0 | 4866 ms |
| npm run build:firefox | run build:firefox | . | passed | 0 | 6059 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- npm run check: passed — svelte-check 0 errors 0 warnings
- npx vitest run src/features/youtube/subtitle/selector --environment=jsdom: passed — 10 files / 58 tests（基线 51）
- npm run build:chrome: passed — 加守卫后重跑成功
- npm run build:firefox: passed — 加守卫后重跑成功，未新增 *.firefox.ts 分叉
- 已知限制: A1–A5、A9、A10、A13 的最终观感与持续性仍需 Chrome 真实 YouTube 页面人工确认；YouTubeSubtitleOverlay 无 jsdom 测试宿主，宿主侧挂载条件、目录取用时机与记忆恢复豁免缺自动化防线。
- 已知限制: CC 关闭时若强制开启原生 CC 失败（页侧 subtitleOverlay.page.ts:252-254 命中「YouTube 菜单打开」或 toggleSubtitles 抛错），只写入偏好语言、不渲染也无提示，按规格 §4「失败按既有链路处理」保留现状。
- 已知限制: 置灰态弹层每 1.2s 轮询被 update()→renderMenu() 的 replaceChildren 重建，面板内键盘焦点与滚动位置可能复位；该节奏改动前在已渲染状态即存在（HEAD 的 update() 末尾同样重渲染，基线 paused 分支 clearSubtitleState→syncSubtitleSelectorView 亦可达），本轮未改，建议另起 change 做「viewModel 未变则跳过重渲染」。
- 已知限制: 已渲染路径过后再次关闭 CC 时，loadCatalogWithoutRendering 会为该视频多发一次页内 bridge 请求（渲染路径写 subtitleCatalog 但不写 catalogVideoId），每视频至多一次。
- 已知限制: 仓库其他目录存在与本改动无关的既有失败用例（pot-token、format-detector、fetcher、media-kernel、DragHandle），不在本 change 范围内。

## 阻塞项

_无。_

## 风险与跳过的工作

- 残窗（非本轮引入）：requestYouTubeSubtitleSetEnabled 自身 await 期间发生跳转，仍可能在 B 视频的新 CC 状态上落一次写；建议后续引入导航代数令牌。
- 极窄竞态：用户在 :1809 与 :868 之间数毫秒内点语言，若 SetEnabled(false) 先落地，:871 读到 false 导致豁免不登记、这次点击静默无效。
- 关闭「自渲染字幕」且开启记忆时，:715 早于 :721 的豁免清理，本轮 :1781 会跳过一次恢复，实际生效推迟到下一个 1.2s 轮询；需 Chrome 目视确认不构成用户可见异常。
- CC 关闭时若强制开启失败（页侧 subtitleOverlay.page.ts:252-254 命中 YouTube 菜单打开，或 :257-262 抛错），只写入偏好、不渲染、无提示；规格 §4 仅说「失败按既有链路处理」，未定义可见反馈。
- 暂停态弹层每 1.2s 触发 update()→renderMenu()→replaceChildren()，语言项焦点与列表 scrollTop 会复位；该节奏改动前在已渲染态即存在（HEAD 的 update() 末尾同样重渲染），本轮只是暴露给更多灰态场景，建议另起 change 做「viewModel 未变则跳过重渲染」。
- :838 与 :1071 写 subtitleCatalog 但不写 catalogVideoId，随后关 CC 会为该视频多发一次页内 bridge playerData 请求（每视频至多一次）。
- subtitleUnavailableVideoId 仅 unmount() 清空，跨 SPA 导航永久保留；若 YouTube 后续补上字幕需刷新页面（与既有语义一致）。
- 宿主侧（挂载条件、目录取用时机、记忆恢复豁免）仍无自动化用例，规格 §6 已声明由 Chrome 人工场景覆盖：CC 关/CC 开/无字幕视频/断网回退/popup 来回切换/简繁英文界面下的空态文案/A13 跨 ≥5 个轮询周期。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 0 | recovery | — | Native Shape artifacts changed | 2026-09-21T06:18:06.855Z |
| 2 | 1 | 1 | recovery | — | 验收发现缺陷需补 D6/A13 并对齐规格 | 2026-09-21T06:56:14.660Z |
| 3 | 1 | 1 | recovery | — | 实现修正：manualNativeToggleOnVideoId 只在确实开启成功时登记、登记时使用 await 前捕获的 videoId、功能关闭时一并清空；需求与验收文字不变。 | 2026-09-21T08:13:01.997Z |
| 3 | 2 | 0 | recovery | — | Native Shape artifacts changed | 2026-09-21T08:15:38.729Z |
| 4 | 1 | 1 | pass | — | A1–A13 全部通过：按钮可见性与语言目录已解耦，四种无渲染状态常驻置灰，空状态与搜索入口隐藏符合规格 §3.2，D6 豁免仅在强制开启确实生效且视频未变时登记。Verifier 实跑 npm run check 0 error、vitest 10 文件 58 项通过（基线 51，新增 7 项为真实断言），改动集仅 5 个文件、未触碰 popup/manifest/其他站点/*.firefox.ts。遗留 6 项风险，其中在途记忆恢复竞态与空目录永久缓存建议下一轮处理；各项最终观感仍需 Chrome 人工目视。 | 2026-09-21T08:58:22.905Z |
| 4 | 1 | 1 | recovery | — | 按用户选择回到 Build 修风险 1：restoreNativeToggleForCurrentPage 在 await 之后、写入记忆状态之前复查豁免，消除在途竞态。风险 2 经查页侧 getPlayerData 只在拿到含 videoDetails.videoId 的完整 response 时才返回数据，空轨道即真无字幕，与既有 markSubtitleUnavailable 策略一致，不改。 | 2026-09-21T09:49:12.472Z |
| 4 | 2 | 1 | pass | — | A1–A13 全部 passed（按代码契约是否满足规格判定，需真机目视的项已在各项原因标注）。挂载判定已从「目录非空」改为「功能开启 + 观看页」，空目录不再 detach；两态图标、空状态文案与 en/zh key、搜索入口隐藏、记忆恢复豁免均已落地。本轮增量（restoreNativeToggleForCurrentPage 写回前的第二次复查）位置正确，覆盖两次 await 的窗口，且不会导致记忆恢复永不执行。Verifier 独立实跑 npm run check（0 error 0 warning）与vitest selector（10 files / 58 tests）。未发现违反 brief 约束与非目标；Builder 的两项「不修」论证（空目录永久缓存、1.2s 重建弹层）经独立核实均成立。残余 6 项风险见列，其中 SPA 跳转下的在途 restore 与「强制开启失败时静默不渲染」最值得后续处理。 | 2026-09-21T10:07:41.759Z |
| 4 | 2 | 1 | recovery | — | 用户选择在写回记忆状态前再加一行「地址已变则不写」守卫，封住 SPA 跳转下把 A 视频的记忆状态写到 B 视频的在途竞态；需求与验收文字不变。 | 2026-09-21T10:15:13.039Z |
| 4 | 3 | 1 | pass | — | 第 3 轮候选 A1–A13 全部 passed（按代码契约是否满足规格判定，需真机目视的项已在各项标注）。唯一增量（restoreNativeToggleForCurrentPage 写回前的两条复查：地址未变 + 豁免未登记）位置正确，位于最后一个 await 之后、唯一有副作用的 requestYouTubeSubtitleSetEnabled 之前，确实封住 SPA 跳转窗口，且未挡掉任何合法记忆恢复（channel/global 两模式与进入新视频后的恢复均照常）。其余 A1–A12 独立复核无回归；Verifier 实跑 npm run check 0 error 与 selector vitest 10 files / 58 tests。遗留 8 项风险不构成规格违反，最需要后续处理的是置灰态弹层每 1.2s 重建与「强制开启失败时无提示」。 | 2026-09-21T10:36:45.915Z |



## 结论

第 3 轮候选 A1–A13 全部 passed（按代码契约是否满足规格判定，需真机目视的项已在各项标注）。唯一增量（restoreNativeToggleForCurrentPage 写回前的两条复查：地址未变 + 豁免未登记）位置正确，位于最后一个 await 之后、唯一有副作用的 requestYouTubeSubtitleSetEnabled 之前，确实封住 SPA 跳转窗口，且未挡掉任何合法记忆恢复（channel/global 两模式与进入新视频后的恢复均照常）。其余 A1–A12 独立复核无回归；Verifier 实跑 npm run check 0 error 与 selector vitest 10 files / 58 tests。遗留 8 项风险不构成规格违反，最需要后续处理的是置灰态弹层每 1.2s 重建与「强制开启失败时无提示」。
