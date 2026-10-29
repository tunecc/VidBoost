---
generated_from_state_version: 15
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 3
- 验证器尝试次数: 1
- 完成时间: 2026-09-21T12:43:39.187Z
- 摘要: A1–A10 全部 passed。renderSignature() 以嵌套数组 + JSON.stringify 完整覆盖影响列表 DOM 的全部输入（两组语言项逐项含顺序的 id/label/targetLanguageCode/kind/sourceKind/searchText、activeOptionId、activeLanguageCode、preferredLanguageCode、query、searchOpen 与整份 copy）；签名只在整段渲染完成后写入、detach() 归零失效，跳过重建时定位/文案/图标两态/搜索入口可用性仍每周期同步。11 条稳定性用例（含本轮新增 4 条）均可证伪、无恒真：searchOpen、searchText、sourceKind、positionMenu 四条在对应实现缺失时都会失败。实测 npm run check 0 error、vitest 10 files / 69 tests（基线 58，纯新增无删除），宿主节奏、目录排序、popup、manifest 与其他站点零改动。遗留为测试强度与 Chrome 目视尾巴，不构成规格违反。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `A1`：面板打开、用 `↑`/`↓` 把焦点停在某个语言项上并让列表处于滚动后的位置，等待至少 5 个轮询周期（≥6 秒）：焦点仍在同一个语言项按钮上（`document.activeElement` 不变）、被聚焦项仍是同一个 DOM 节点、列表 `scrollTop` 不变。 | SubtitleSelector.ts:452-468 签名相同即 return，不执行 optionList.replaceChildren()；menu.test.ts:408-420 用 5 次内容相同、引用不同的 update() 断言 after[i] === before[i] 且 document.activeElement 仍是 before[2]。节点身份与焦点有可执行证据；scrollTop 与真实焦点描边无 jsdom 布局，由「列表容器与选项节点未被替换、renderMenu 不触碰 scrollTop」推得，仍需 Chrome 目视。 |
| A2 | passed | brief.md | `A2`：`A1` 的同样表现在「原生 CC 关闭、按钮置灰」状态下打开面板时成立（同一份实现，两种状态都不再周期性重建）。 | 宿主两条置灰路径每周期都走到同一 update()：YouTubeSubtitleOverlay.ts:1136-1139 → enterIdleSelectorState(:799-806) → syncSubtitleSelectorView(:772-787)，pauseOverlayForNativeToggleOff → clearSubtitleState(:1826-1832、:1988-1995) 再同步一次；置灰时 activeOptionId/activeLanguageCode 恒为 ''、subtitleCatalog 内容不变，签名稳定即跳过。限定：稳定性用例在高亮态验证，「非空目录 + 置灰」组合无独立用例，此结论由代码路径同一性推得；灰态图标两态由 icon.test.ts:174、235 覆盖，实际观感仍需 Chrome 目视。 |
| A3 | passed | brief.md | `A3`：用指针悬停在某个语言项上且指针不动，等待至少 5 个轮询周期，该项的 hover 浅色背景保持出现，不闪断也不消失。 | hover 仍由行内 pointerenter/pointerleave 实现（SubtitleSelector.ts:574-579，未引入 CSS :hover 与外部样式），跳过重建时节点与其上已生效的行内 background 原样保留（原缺陷正是新节点不会重放 hover）。由「DOM 未被替换」推得，闪断观感仍需 Chrome 目视。 |
| A4 | passed | brief.md | `A4`：渲染输入确实变化时面板在下一次同步就反映新状态：选中新语言后勾选标记与选中背景从旧项移到新项；切换扩展语言（zh ↔ en）后分组标题、徽章与空状态文案换成新语言；目录刷新出现新语言时该项出现在列表正确分组与顺序处。 | menu.test.ts:438-450（activeOptionId 迁移 → aria-selected 由 p-zh 移到 p-en）、:452-471（preferredLanguageCode → t-ja 出现「默认」徽章；copy.providedHeading → 菜单含 Provided）、:473-487（目录新增 p-de → 重建且该项出现）；签名含两组数组顺序（:490-499），排序变化必然重建。限定：新增项只断言存在，未断言精确位置与所属分组。 |
| A5 | passed | brief.md | `A5`：展开搜索行并输入查询词后，跨多个轮询周期查询词、搜索行展开态与过滤结果都不被重置；收起搜索行（再点搜索按钮或按 `Escape`）后列表恢复完整，且此时回到搜索按钮上的焦点能跨周期保持。 | menu.test.ts:489-508：展开搜索行输入 zh 后连续 3 次 update()，过滤结果仍为 ['p-zh']、节点身份不变、input.value 仍为 zh，同时锁死 query 入签；收起路径 :295-300、:412-420 清 query 并重建，搜索按钮在 optionList 之外（:302）不被替换，故收起后焦点可跨周期保持；:510-527 断言展开与收起双向的节点身份变化。 |
| A6 | passed | brief.md | `A6`：关闭再打开面板行为照旧：搜索复位为收起、查询词清空、列表按当前目录渲染；空目录 → 目录到达时的自动填充仍然生效（不会因跳过规则停留在空状态提示上）。 | menu.test.ts:241-267（关闭/重开后搜索收起、query 清空、列表恢复完整）在跳过规则下仍绿；机制上 close() 只改内部态不渲染（:361-366），renderedSignature 仍含旧 query/searchOpen，故 open() 的 renderMenu()(:433) 必定重建。空 → 目录到达由 :682-697 与 :422-436 共同保证：copy.emptyMessage 与两组数组均在签名内，不会停在空状态提示上。 |
| A7 | passed | brief.md | `A7`：`detach()` 或按钮被重新挂载后，面板一定重新渲染一次：重挂载时用新目录渲染出语言项，不残留上一份 DOM 的内容。 | SubtitleSelector.ts:382 detach() 归零签名，覆盖 destroy()(:385-390) 与 ensureMounted() 重建入口(:198)；menu.test.ts:583-596 以完全相同的 viewModel 走 detach → update → ensureMounted → 打开，断言 4 个语言项齐全且 emptyNotices().length===0。反证：若 detach 不清签名，重挂载后 renderMenu()(:357) 命中旧签名而跳过，新 optionList 为空 → 用例失败，故该用例真正锁死了签名失效时机。 |
| A8 | passed | brief.md | `A8`：播放器尺寸变化（进入/退出全屏、窗口 resize）后面板仍紧贴按钮重新定位，即使这段时间列表被跳过重建，也不残留旧坐标。 | update() 在弹层可见时总是 renderMenu(); positionMenu();（SubtitleSelector.ts:182-185），positionMenu() 独立于签名；menu.test.ts:566-581 stub 播放器/按钮 getBoundingClientRect 后以相同 viewModel update()，断言 optionButtons()[0] === before[0]（被跳过）同时 right==='60px'、bottom==='108px'，数值与 :446-447 的 max(12,1000-940)/max(56,800-700+8) 一致，打开初值为 12px/56px，非自我实现；若跳过分支连带跳过定位必失败。resize(:158-160) 与 ensureMounted() 幂等分支(:193-196) 也定位。全屏后真实坐标仍需 Chrome 目视。 |
| A9 | passed | brief.md | `A9`：`npm run check` 无错误；`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom` 全部通过且不少于基线 10 文件 / 58 项。新增用例至少覆盖：内容相同但对象引用不同的连续 `update()` 不产生列表 DOM 变更且保持 `document.activeElement`；分别改动 `activeOptionId`、`preferredLanguageCode`、目录内容、`copy` 文案、`query`、搜索展开态时确实重渲染；`detach()` 或重新 `ensureMounted()` 后重新渲染；空目录连续 `update()` 只保留一个 `.vb-yt-subtitle-selector-empty`。 | 本 Verifier 实测：npm run check → 0 errors 0 warnings；npx vitest run src/features/youtube/subtitle/selector --environment=jsdom → 10 files / 69 tests（基线 58，git diff --numstat 为 39+0 / 272+0 纯新增 11 项用例，无 .skip/.only、无删除行）。brief A9 列举的六类输入改动、焦点保持、重挂载、空目录单节点均有独立用例（menu.test.ts:408、422、438、452、473、489、510、583）；第 2 轮失败理由（缺 searchOpen、sourceKind、searchText 与定位并行的可执行证据）已消除。 |
| A10 | passed | brief.md | `A10`：`npm run build:chrome` 与 `npm run build:firefox` 均成功，未新增 `*.firefox.ts` 分叉实现。 | 依代码层证据加候选的 runtime 报告（按只读要求未重跑构建）：git status --porcelain 仅两个已跟踪文件被修改、0 未跟踪文件，selector 目录无新增文件；仓库内 *.firefox.ts 仍只有既有 3 处，未新增分叉；改动为纯共享 TS 模块（新增私有字段与私有方法，无运行时 API），public/manifest.json 不在 diff 中；build:chrome / build:firefox 沿用 Runtime 的 passed 结果。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| npm run check | run check | . | passed | 0 | 2963 ms |
| npx vitest run src/features/youtube/subtitle/selector --environment=jsdom | vitest run src/features/youtube/subtitle/selector --environment=jsdom | . | passed | 0 | 2391 ms |
| npm run build:chrome | run build:chrome | . | passed | 0 | 4938 ms |
| npm run build:firefox | run build:firefox | . | passed | 0 | 6343 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- npm run check: passed — svelte-check 0 errors 0 warnings
- npx vitest run src/features/youtube/subtitle/selector --environment=jsdom: passed — 10 files / 69 tests（本轮开始前基线 58，累计新增 11 项）
- npm run build:chrome: passed — —
- npm run build:firefox: passed — 未新增 *.firefox.ts 分叉
- mutation check: 移除签名中的 searchOpen 与 searchText: passed — 对应两条新用例失败（2 failed / 24 passed），恢复后全绿；已把源文件还原并复跑 69 项通过
- 已知限制: scrollTop 保持、真实 hover 不闪断、全屏/resize 后的实际坐标仍需 Chrome 目视；本轮新增的 positionMenu 用例用 stub 矩形证明了「跳过重建的同时完成重定位」，但不等于真实布局验证。
- 已知限制: update() 每周期仍会重写面板标题文本、按钮 aria-label/title 与图标 cssText（不影响焦点/滚动/hover），未加脏检查；规格只要求列表 DOM 稳定。
- 已知限制: 内容确实变化时（换语言、改查询、目录刷新）列表仍整体重建，滚动回顶部、焦点丢失，是 D1 接受的取舍。
- 已知限制: query 按原值入签（ZH 与 zh 判为不同）、searchOpen 翻转即重建，均比规格更保守，只会多渲染一次。
- 已知限制: 不自愈外部清空 listbox 的情况（改动前每 1.2s 无条件重建会掩盖它）；菜单整体被摘走时由 ensureMounted() 的 isConnected 分支 + 签名失效自愈。
- 已知限制: 仓库其他目录存在与本改动无关的既有失败用例（pot-token、format-detector、fetcher、media-kernel、DragHandle），不在本 change 范围内。

## 阻塞项

_无。_

## 风险与跳过的工作

- activeLanguageCode 缺独立用例：现仅在 :442 与 activeOptionId 同时变化时被覆盖。它可能单独变化（resolvePlayerSubtitleState 换物理轨道而 option.id 兼容不变时），建议补「仅改 activeLanguageCode 即重建且勾选迁移」。
- 「非空目录 + 置灰（activeOptionId 为空）+ 面板敞开连续 update 不重建」无独立用例，A2 目前依赖代码路径同一性推演。
- searchText 用例只断言节点身份变化、无可见内容差异；建议改成「先输入 query 使过滤结果不同，再只改 searchText」以断言可见集合变化。
- 「目录新增语言」建议断言完整顺序 ['p-zh','p-en','p-de','t-ja','t-ko']，把 A4 的「正确分组与顺序」写进期望。
- menu.test.ts:578 的 toBe(before[0]) 缺非空前置断言（列表为空时 undefined===undefined 会恒真），建议与 :411 一致加 expect(before.length).toBeGreaterThan(0)。
- 本 Verifier 未做变异实验（只读约束），证伪结论来自读代码推理；A10 的构建结论沿用 Runtime 证据。
- update() 每周期仍重写面板标题文本、按钮 aria-label/title 与图标 cssText（:169-181），不影响焦点/滚动/hover，规格只要求列表 DOM 稳定，未加脏检查。
- Chrome 人工目视清单：焦点描边与 scrollTop 跨 ≥5 个周期保持、hover 不闪断、进入/退出全屏与窗口 resize 后面板贴回按钮、置灰态重复一遍、zh↔en 切换后标题/徽章/空状态文案。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | recovery | — | 按验收反馈补强：签名改在渲染完成后写入；searchText 并入签名；detach 的签名失效补一条反向锁定用例（同内容重挂载后必须重新渲染）。 | 2026-09-21T11:48:12.369Z |
| 1 | 2 | 1 | fail | A9 | 实现本身符合 §1.3：renderMenu() 按内容签名早退，detach() 失效签名，签名在渲染完成后写入，positionMenu/按钮文案/图标两态/搜索入口同步都在跳过分支之外照常执行；第 1 轮三条意见（渲染后写签名、searchText 入签、重挂载反向锁定用例）都已落实，且未越界（+235/-0，宿主与排序/popup/manifest 零改动）。A1–A8、A10 passed；A9 failed：规格与 A9 点名的「搜索展开态变化确实重渲染」没有断言锁定（移除 searchOpen 后 65 项仍全绿），sourceKind/searchText 也缺最小重建用例。下一轮 Build 只需补这几条用例即可，无需改动功能实现。 | 2026-09-21T12:18:23.358Z |
| 1 | 3 | 1 | pass | — | A1–A10 全部 passed。renderSignature() 以嵌套数组 + JSON.stringify 完整覆盖影响列表 DOM 的全部输入（两组语言项逐项含顺序的 id/label/targetLanguageCode/kind/sourceKind/searchText、activeOptionId、activeLanguageCode、preferredLanguageCode、query、searchOpen 与整份 copy）；签名只在整段渲染完成后写入、detach() 归零失效，跳过重建时定位/文案/图标两态/搜索入口可用性仍每周期同步。11 条稳定性用例（含本轮新增 4 条）均可证伪、无恒真：searchOpen、searchText、sourceKind、positionMenu 四条在对应实现缺失时都会失败。实测 npm run check 0 error、vitest 10 files / 69 tests（基线 58，纯新增无删除），宿主节奏、目录排序、popup、manifest 与其他站点零改动。遗留为测试强度与 Chrome 目视尾巴，不构成规格违反。 | 2026-09-21T12:43:39.187Z |



## 结论

A1–A10 全部 passed。renderSignature() 以嵌套数组 + JSON.stringify 完整覆盖影响列表 DOM 的全部输入（两组语言项逐项含顺序的 id/label/targetLanguageCode/kind/sourceKind/searchText、activeOptionId、activeLanguageCode、preferredLanguageCode、query、searchOpen 与整份 copy）；签名只在整段渲染完成后写入、detach() 归零失效，跳过重建时定位/文案/图标两态/搜索入口可用性仍每周期同步。11 条稳定性用例（含本轮新增 4 条）均可证伪、无恒真：searchOpen、searchText、sourceKind、positionMenu 四条在对应实现缺失时都会失败。实测 npm run check 0 error、vitest 10 files / 69 tests（基线 58，纯新增无删除），宿主节奏、目录排序、popup、manifest 与其他站点零改动。遗留为测试强度与 Chrome 目视尾巴，不构成规格违反。
