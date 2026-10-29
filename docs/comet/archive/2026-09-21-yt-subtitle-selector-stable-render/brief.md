# 目标

修掉控件栏字幕面板的周期性重建：宿主每 1.2 秒的轮询在数据没变时也会整段重建语言列表，导致键盘焦点被丢、列表滚回顶部、鼠标悬停高亮闪断。改成「渲染输入没变就不碰列表 DOM」，用户可以敞开面板慢慢挑语言。

# 范围

- `src/features/youtube/subtitle/selector/SubtitleSelector.ts` 的 `update()` / `renderMenu()` 重渲染判定与内部签名失效时机。
- 保证跳过重建时，弹层定位、按钮文案与图标两态、搜索入口可用性同步等行为照常。
- 新增 jsdom 用例锁定「同内容不重建 / 渲染输入变化即重建 / 摘除与重挂载后签名失效」。

# 非目标

- 不做「内容变化时也保住焦点与滚动位置」的原位 diff 更新（复用节点增删）——本轮只在渲染输入未变时跳过重建。
- 不改动语言目录构建、去重与排序规则，不改动搜索过滤与键盘导航语义。
- 不改动宿主 `YouTubeSubtitleOverlay` 的轮询节奏（`TRACK_POLL_MS`）、挂载条件与字幕渲染逻辑。
- 不处理另两项已知风险：强制开启原生 CC 失败时无提示、`requestYouTubeSubtitleSetEnabled` 自身 await 期间的跳转残窗。
- 不触碰 Bilibili / 抖音、popup 设置项、`public/manifest.json` 与权限。

# 验收示例

- `A1`：面板打开、用 `↑`/`↓` 把焦点停在某个语言项上并让列表处于滚动后的位置，等待至少 5 个轮询周期（≥6 秒）：焦点仍在同一个语言项按钮上（`document.activeElement` 不变）、被聚焦项仍是同一个 DOM 节点、列表 `scrollTop` 不变。
- `A2`：`A1` 的同样表现在「原生 CC 关闭、按钮置灰」状态下打开面板时成立（同一份实现，两种状态都不再周期性重建）。
- `A3`：用指针悬停在某个语言项上且指针不动，等待至少 5 个轮询周期，该项的 hover 浅色背景保持出现，不闪断也不消失。
- `A4`：渲染输入确实变化时面板在下一次同步就反映新状态：选中新语言后勾选标记与选中背景从旧项移到新项；切换扩展语言（zh ↔ en）后分组标题、徽章与空状态文案换成新语言；目录刷新出现新语言时该项出现在列表正确分组与顺序处。
- `A5`：展开搜索行并输入查询词后，跨多个轮询周期查询词、搜索行展开态与过滤结果都不被重置；收起搜索行（再点搜索按钮或按 `Escape`）后列表恢复完整，且此时回到搜索按钮上的焦点能跨周期保持。
- `A6`：关闭再打开面板行为照旧：搜索复位为收起、查询词清空、列表按当前目录渲染；空目录 → 目录到达时的自动填充仍然生效（不会因跳过规则停留在空状态提示上）。
- `A7`：`detach()` 或按钮被重新挂载后，面板一定重新渲染一次：重挂载时用新目录渲染出语言项，不残留上一份 DOM 的内容。
- `A8`：播放器尺寸变化（进入/退出全屏、窗口 resize）后面板仍紧贴按钮重新定位，即使这段时间列表被跳过重建，也不残留旧坐标。
- `A9`：`npm run check` 无错误；`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom` 全部通过且不少于基线 10 文件 / 58 项。新增用例至少覆盖：内容相同但对象引用不同的连续 `update()` 不产生列表 DOM 变更且保持 `document.activeElement`；分别改动 `activeOptionId`、`preferredLanguageCode`、目录内容、`copy` 文案、`query`、搜索展开态时确实重渲染；`detach()` 或重新 `ensureMounted()` 后重新渲染；空目录连续 `update()` 只保留一个 `.vb-yt-subtitle-selector-empty`。
- `A10`：`npm run build:chrome` 与 `npm run build:firefox` 均成功，未新增 `*.firefox.ts` 分叉实现。

# 约束与不变量

- 「渲染输入」必须覆盖所有会影响列表 DOM 的内容：两组语言项集合的内容（每项的 `id`、`label`、`targetLanguageCode`、`kind` 与 `provided` 的 `sourceKind`）、`activeOptionId`、`activeLanguageCode`、`preferredLanguageCode`、`query`、`searchOpen`、以及 `copy` 的全部文案字段；漏掉任何一项都会造成「状态不再更新」这种比原缺陷更严重的问题。
- 宿主每轮都会用 `buildSubtitleCatalog` 生成新的目录对象，因此判定不得依赖对象引用相等，必须按内容比较。
- 跳过重建时仍要照常执行弹层定位（`positionMenu()`）、按钮 `aria-label`/`title`、图标两态与搜索入口可用性同步。
- 签名必须在 `detach()`（含 `destroy()`、`ensureMounted()` 重建路径）后失效，保证重挂载一定渲染一次。
- 语言项的 hover 背景与聚焦描边仍由现有 `pointerenter`/`pointerleave`/`focus`/`blur` 行内样式实现，不引入外部 CSS，也不改成 CSS `:hover`。
- 面板视觉规格（尺寸、配色、行高、徽章、分组标题、空状态样式）与现有渲染结果保持一致：跳过规则只减少重建次数，不改变任何一次实际渲染的输出。
- 不新增 `*.firefox.ts` 分叉，Chrome 与 Firefox 共用同一实现。

# 决策

- `D1`（修复深度）：采用「渲染输入未变即跳过重建」，不做原位 diff 更新。代价：内容真变化时（换语言、改查询）列表滚动位置仍回顶部；收益：改动面小，不引入节点复用带来的状态错乱。
- `D2`（判定实现）：在 `SubtitleSelector` 内部维护「上次已渲染输入」的签名，`renderMenu()` 在签名相同且列表已挂载时直接返回；`detach()` 与全新 `ensureMounted()` 使签名失效。
- `D3`（位置更新不跳过）：跳过重建不影响 `positionMenu()`，全屏/resize 后面板位置仍正确。

# 待解决问题

无。

# 验证预期

- 静态检查：`npm run check`。
- 单元/行为测试：`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom`。
- 构建冒烟：`npm run build:chrome`、`npm run build:firefox`。
- 人工验证（Chrome）：视频播放中打开面板 → 方向键停在第 5 项并滚动列表 → 等待 ≥5 个轮询周期观察焦点、滚动与 hover；悬停某项保持指针不动重复一次；再进入/退出全屏确认面板位置；置灰态（关闭原生 CC）重复一遍。
