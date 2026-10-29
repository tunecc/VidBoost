---
generated_from_state_version: 17
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 2
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-09-21T04:58:01.008Z
- 摘要: 本轮修订只删除了 searchToggle 的 focus/blur 监听并在 SEARCH_TOGGLE_BASE_STYLE 固定 outline:none（SubtitleSelector.ts:79-92），其余结构、状态机与排序逻辑与第 1 轮通过版本一致：FOCUS_OUTLINE 仍只用于语言项（:550-557），syncSearchToggleStyle 仍以蓝色底/蓝色图标作为唯一激活态（:421-427）。逐项复核确认「展开必清查询、收起必重渲染」不变量成立，Esc 两段式与 update() 保留展开态均未破坏。测试基线经 git ls-tree 与逐文件计数核对：35 项旧用例原样保留，新增 catalog 5 项 + menu 11 项 = 10 文件 51 项，与 Runtime 结果吻合。A1-A16 全部 passed，无阻塞项。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `A1` 当翻译语言同时含简中与繁中时，面板「自动翻译」分组前两项依次为简体中文、繁体中文，第三项起为其余语言按标签升序。 | catalog.ts:148-152 先比 translatedPinRank（:27-33 hans=0/hant=1/其余=2）再比标签；catalog.test.ts:108-124 断言 简体中文→繁体中文→德语→韩语→日语，去掉置顶即失败。 |
| A2 | passed | brief.md | `A2` 置顶只按语言代码判定（`zh-Hans`/`zh-CN`/`zh-SG`/`zh-MY` 为简体，`zh-Hant`/`zh-TW`/`zh-HK`/`zh-MO` 为繁体）；YouTube 界面为英文、标签是 "Chinese (Simplified)"/"Chinese (Traditional)" 时同样置顶。 | 置顶只读 targetLanguageCode（catalog.ts:28），不看 label；区域表复用 language.ts:1-2,28-34，新增 chineseScriptGroupOf（:60-66）。英文标签用例 catalog.test.ts:126-137 不具鉴别力（记风险），行为由 :172-184 与代码钉住。 |
| A3 | passed | brief.md | `A3` 简体中文因与视频自带字幕语言兼容而被去重跳过时，繁体中文成为「自动翻译」第一项，其余顺序不变，列表中不出现重复或缺位。 | 去重 catalog.ts:131-146 在排序 :148-152 之前，置顶不绕过 areTargetLanguagesCompatible；catalog.test.ts:139-151 断言简中被剔、繁中上浮且无重复。 |
| A4 | passed | brief.md | `A4` 翻译语言中没有中文时，「自动翻译」顺序等于纯标签升序（与改动前一致）；「视频提供」分组顺序不受影响。 | 无中文时 rank 全为 2 → 纯标签升序；provided 组只 sort(compareMenuLabels)（catalog.ts:103）无置顶；catalog.test.ts:153-170 两组分别断言。 |
| A5 | passed | brief.md | `A5` 中文标签按拼音序、拉丁标签按字母序排列（排序结果确定且可被单元测试复现）。 | 固定 new Intl.Collator('zh-Hans',{sensitivity:'base'})（catalog.ts:17）；测试期望的 德语<韩语<日语 为拼音序、与码位序（德<日<韩）不同，实证拼音序生效。 |
| A6 | passed | brief.md | `A6` 面板打开后顶部是一行标题：左侧显示面板标题文案，右侧显示搜索图标按钮，此时不显示搜索输入行。 | 标题行 SubtitleSelector.ts:256-302（header.append(title, searchToggle)），搜索行默认 display:none（:306），open() 强制收起（:431）；menu.test.ts:168-176。 |
| A7 | passed | brief.md | `A7` 点击搜索按钮后标题行下方展开搜索输入行，输入框自动获得焦点，按钮显示激活态；输入关键词后两组语言项按现有规则实时过滤。 | :295-300 展开→行 display:block（:413）+ syncSearchToggleStyle 蓝底蓝图（:421-427）+ input.focus()；:323-326 → filterSubtitleMenuGroups 实时过滤两组；menu.test.ts:189-208。 |
| A8 | passed | brief.md | `A8` 再次点击搜索按钮收起搜索行，同时清空搜索词并恢复完整列表（不出现「列表被过滤却看不到搜索框」的状态）。 | setSearchOpen(false) 清 query 与 input.value（:416-418）并随后 renderMenu（:298），不会出现已过滤却看不到搜索框；menu.test.ts:210-220。 |
| A9 | passed | brief.md | `A9` 搜索行展开时按 Esc 只收起并清空搜索行、面板保持打开、焦点回到搜索按钮；再按一次 Esc 才关闭面板。 | Esc 分层 :581-593：searchOpen 时只收起+重渲染+searchToggle.focus() 并 return（面板保持 flex），第二次才 close()+回焦控件栏按钮；menu.test.ts:222-238。 |
| A10 | passed | brief.md | `A10` 搜索行展开时通过点击面板外部或再点控件栏按钮关闭面板后，重新打开面板搜索行为收起且无残留搜索词。 | 外部 pointerdown（:148-153）与再点按钮（:234-237）都经 close() 的 setSearchOpen(false)（:363），open()/ensureMounted() 亦复位；menu.test.ts:240-266。 |
| A11 | passed | brief.md | `A11` 面板样式贴合 YouTube 原生深色菜单：去掉现有 1px 外边框与强阴影，实色深底、更大圆角，列表项 hover 出现浅色背景、选中项为淡蓝背景 + 勾选标记。 | 按 brief 授权以样式串+用户真机查看判定：MENU_SURFACE_STYLE :59-77 为 border:0、radius 12px、rgba(40,40,40,.98)、阴影 0 4px 16px（git diff 显示旧 1px 边框与 0 8px 24px 已移除）；hover rgba(255,255,255,.1)、选中 rgba(62,166,255,.16)+对号（:55,56,484,504-520）。 |
| A12 | passed | brief.md | `A12` 语言项徽章改为弱化小字（不再是实色胶囊底），仍能区分并显示「作者 / 自动生成 / 翻译 / 默认」信息；分组标题保持小字弱化样式。 | createBadge :563-573 去掉 padding/圆角/底色，仅 11px 半透明白字（「默认」#3ea6ff），四类徽章逻辑保留（:535-547）；分组标题 :464-470 小号弱化非可点击。 |
| A13 | passed | brief.md | `A13` 窄播放器（面板宽度取 `min(360px, 100% - 24px)`）与短播放器下，面板不超出播放器可视区域，窗口改变尺寸后重新定位仍完整可见；长语言标签换行且不与徽章重叠。 | 宽 min(360px,100%-24px)、高 min(420px,100%-80px)、overflow:hidden（:63-68），列表 min-height:0;overflow:auto（:331-339），positionMenu 钳位与 resize 重定位（:439-449,:155-157），长标签 min-width:0;overflow-wrap:anywhere + 徽章 flex:0 0 auto;white-space:nowrap 不重叠（:486-534）。 |
| A14 | passed | brief.md | `A14` ↑/↓ 键盘导航在搜索展开与收起两种状态下都只遍历当前可见项，且新样式下焦点环仍然清晰可见。 | ↑/↓ 以 flattenSubtitleMenuGroups(filterSubtitleMenuGroups(...)) 与 DOM data-option-id 一一对应（:595-613），排序只在 catalog 做一次；语言项焦点环 FOCUS_OUTLINE 未受本轮修订影响（:550-557），输入框改边框高亮（:317-322）；menu.test.ts:286-304。 |
| A15 | passed | brief.md | `A15` 无功能回归：点击语言项仍以目标语言代码回调并关闭面板；控件栏按钮图标激活/未激活两态与挂载位置不变；无可显示语言项时按钮与面板不挂载；`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom` 全部通过（含改动前已有的 35 项）且 `npm run check` 通过。 | 回调/两态/挂载点与 HEAD 一致（:575-579,:50-51,:395-409,:242-247），空组 detach（:166-169）；git ls-tree 核对 9 文件 35 项旧用例原样保留、现 10 文件 51 项；Runtime 的 vitest、npm run check、npm run build:chrome 全部退出码 0。 |
| A16 | passed | brief.md | `A16` 搜索按钮有可访问名称与展开状态（`aria-label` + `aria-expanded`），中文界面显示「搜索语言」、英文界面显示 "Search languages"，新增文案 key 在 en 与 zh 两套字典中都存在。 | 搜索按钮 aria-label/title/aria-expanded（:284-286,:414），输入框 placeholder+aria-label（:310-311），SVG aria-hidden（:114）；yt_subtitle_selector 与 yt_subtitle_search_language 在 en（i18n.ts:128-129）与 zh（:355-356）双语齐备，宿主 YouTubeSubtitleOverlay.ts:746-757 供齐 8 个 copy 字段；menu.test.ts:178-187。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| vitest selector suite (round 2) | vitest run src/features/youtube/subtitle/selector --environment=jsdom | . | passed | 0 | 2318 ms |
| svelte-check (round 2) | run check | . | passed | 0 | 2652 ms |
| chrome build (round 2) | run build:chrome | . | passed | 0 | 4726 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- vitest selector suite: passed — npx vitest run src/features/youtube/subtitle/selector --environment=jsdom → 10 files / 51 tests passed（上一候选 50 项全部保留，新增 1 项焦点圈回归用例）
- svelte-check: passed — npm run check → 0 errors, 0 warnings
- chrome build: passed — npm run build:chrome → 成功，dist/ 已刷新供用户重新加载扩展查看
- 已知限制: 本轮未再做浏览器 harness 截图：改动是删除一个内联 outline 赋值并加 outline:none，已由新增 jsdom 用例锁定；用户正在真机上查看，dist/ 已是最新构建。
- 已知限制: 搜索按钮现在没有任何焦点可视化（按用户明确要求），键盘 Tab 到该按钮时只能靠蓝色展开态判断状态；语言项与输入框的焦点指示未受影响。
- 已知限制: A11/A12/A13 纯视觉项仍按 brief 授权以代码阅读 + 用户真机查看判断，无自动化断言。
- 已知限制: 排序依赖运行环境 ICU 的 zh-Hans 拼音排序数据（Node 24 与 Chrome 均具备）。
- 已知限制: 未跑 Firefox 构建与低内存验证（未触碰 manifest/权限/构建配置，实现为跨浏览器共用的同一份 DOM 代码）。

## 阻塞项

_无。_

## 风险与跳过的工作

- 焦点圈回归用例依赖 jsdom 对 outline 属性的解析；更稳的写法是同时断言 toggle.style.cssText 含 outline:none。
- catalog.test.ts:126-137 英文标签置顶用例与纯字母序重合，不具鉴别力；建议把拉丁项换成排在 Chinese 之前的标签（如 German）。
- 缺「provided 组内含 zh-CN 时不上浮」的直接用例（代码 catalog.ts:103 无置顶逻辑，风险低）。
- menu.test.ts:299-303 过滤态导航用例只命中 1 项，未证明跳过不可见项；建议换成命中 ≥2 项且跨两组的查询。
- 拉丁标签之间的字母序无直接断言。
- 搜索按钮现在完全没有焦点可视化（用户明确要求，outline:none 且无 focus 处理），Tab 至该按钮无焦点指示，属 WCAG 2.4.7 折衷；语言项与输入框不受影响。
- zh-SG/zh-MY/zh-MO 无直接用例，走同一张 HANS/HANT 区域表分支。
- spec §6 写面板 DOM 行为单测位于 icon.test.ts，实际新增为同目录 menu.test.ts（文档措辞待对齐）。
- A11-A13 无自动化断言，由样式串代码阅读 + 用户真机查看支撑。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | execution-error | — | Native Verifier response was invalid: Native Verifier check ID svelte-check conflicts with a Runtime check | 2026-09-21T03:07:26.181Z |
| 1 | 1 | 2 | pass | — | 先读 brief 的 16 条验收与 spec 六节，再逐行核对 catalog.ts（固定 Collator、pin rank、去重先于排序、provided 不置顶）、language.ts（仅追加 chineseScriptGroupOf，兼容判定未动）、SubtitleSelector.ts 全文（标题行+右上搜索按钮、默认收起搜索行、Esc 分层、查询清空、open/close/detach 复位、原生深色样式与弱化徽章），并用 git show HEAD 取旧版对照。宿主 copy 字段与面板读取完全一致，i18n 双语键集由类型系统对齐。七个陷阱逐条验证：去重未被绕过、简繁顺序与裸 zh 不置顶正确、provided 无置顶、update() 保留展开态与查询、收起必清查询、无残留旧搜索行引用、detach/destroy 状态平衡。测试基线经 git ls-tree 核对未被削弱（35→50），Runtime 的 check/build/vitest 全部通过。16 项全部 passed。 | 2026-09-21T03:24:45.865Z |
| 1 | 1 | 2 | recovery | — | 用户真机查看后要求：右上角搜索按钮去掉白色焦点圈，只用蓝色背景表示搜索生效；验收项文字不变，属实现修订 | 2026-09-21T04:38:56.457Z |
| 1 | 2 | 0 | recovery | — | Native Shape artifacts changed | 2026-09-21T04:41:33.039Z |
| 2 | 1 | 1 | pass | — | 本轮修订只删除了 searchToggle 的 focus/blur 监听并在 SEARCH_TOGGLE_BASE_STYLE 固定 outline:none（SubtitleSelector.ts:79-92），其余结构、状态机与排序逻辑与第 1 轮通过版本一致：FOCUS_OUTLINE 仍只用于语言项（:550-557），syncSearchToggleStyle 仍以蓝色底/蓝色图标作为唯一激活态（:421-427）。逐项复核确认「展开必清查询、收起必重渲染」不变量成立，Esc 两段式与 update() 保留展开态均未破坏。测试基线经 git ls-tree 与逐文件计数核对：35 项旧用例原样保留，新增 catalog 5 项 + menu 11 项 = 10 文件 51 项，与 Runtime 结果吻合。A1-A16 全部 passed，无阻塞项。 | 2026-09-21T04:58:01.008Z |



## 结论

本轮修订只删除了 searchToggle 的 focus/blur 监听并在 SEARCH_TOGGLE_BASE_STYLE 固定 outline:none（SubtitleSelector.ts:79-92），其余结构、状态机与排序逻辑与第 1 轮通过版本一致：FOCUS_OUTLINE 仍只用于语言项（:550-557），syncSearchToggleStyle 仍以蓝色底/蓝色图标作为唯一激活态（:421-427）。逐项复核确认「展开必清查询、收起必重渲染」不变量成立，Esc 两段式与 update() 保留展开态均未破坏。测试基线经 git ls-tree 与逐文件计数核对：35 项旧用例原样保留，新增 catalog 5 项 + menu 11 项 = 10 文件 51 项，与 Runtime 结果吻合。A1-A16 全部 passed，无阻塞项。
