# 目标

在 YouTube 观看页面上，只要用户在设置里打开了「自渲染字幕」功能，VidBoost 的字幕按钮就常驻在播放器底部控件栏中；当前没有字幕在渲染时按钮图标置灰，用户不必先开启 YouTube 原生字幕才能看到 VidBoost 的入口。

# 范围

- `src/features/YouTubeSubtitleOverlay.ts` 中控件栏按钮的挂载/摘除判定（`syncSubtitleSelectorView` 及其调用点）。
- `src/features/youtube/subtitle/selector/SubtitleSelector.ts` 中「目录为空即 detach」的规则、图标两态、置灰态的可点击行为与空状态渲染。
- 「功能已开启但未渲染字幕」时（原生 CC 关闭、无字幕视频、无字幕缓存命中）语言目录的获取时机。
- 置灰/空状态所需的新增文案（`src/lib/i18n.ts` 的 en 与 zh 两套）。

# 非目标

- 不改动字幕下载、后处理、翻译与覆盖层渲染逻辑本身。
- 不改动「无字幕缓存」与「加载失败阈值」的判定语义（只改变它们生效时按钮是否常驻）。
- 不改动 Bilibili / 抖音等其他站点的字幕入口。
- 不改动 popup 设置面板的开关项与字幕样式设置项。
- 不改动 `public/manifest.json`、权限与 host 访问。

# 验收示例

- `A1`：开启「自渲染字幕」后进入一个 YouTube 原生 CC 已关闭的视频播放页，控件栏右侧（设置按钮左边）出现 VidBoost 图标按钮，图标为置灰态（`opacity:.45` + `grayscale(.6)`），无需先点 YouTube 的 CC 按钮。
- `A2`：在 `A1` 的场景点击置灰按钮，弹层展开并列出可选语言；选中一种语言后覆盖层立即渲染该语言字幕，图标转为高亮（`opacity:1`、无灰度），且 YouTube 原生 CC 按钮的 `aria-pressed` 变为 `true`（原生字幕由 VidBoost 隐藏）。
- `A3`：进入一个 YouTube 未提供任何字幕（`captionTracks` 为空）的视频，按钮仍常驻并置灰；点击后弹层展开，标题正常，列表区显示「该视频暂无字幕」中文文案（英文界面为对应 en 文案），列表中没有任何语言项。
- `A4`：字幕拉取连续失败并回退原生字幕后，按钮仍常驻并置灰，不会因为回退而消失。
- `A5`：在 popup 中关闭「自渲染字幕」后，已挂载的按钮与弹层立即从控件栏移除；重新开启后按钮无需任何 YouTube 侧操作即再次出现。
- `A6`：进入有字幕且原生 CC 已开启的视频，按钮显示并保持高亮，点击后语言列表的分组、排序、搜索、选中勾选行为与改动前一致。
- `A7`：在 YouTube 首页、频道页等非 `/watch` 页面与 `/embed` 内嵌播放器中，不出现 VidBoost 字幕按钮。
- `A8`：置灰态按钮的 `aria-label` 与 `title` 仍为「VidBoost 字幕」，`aria-haspopup="dialog"` 保持不变，`aria-expanded` 随弹层开合更新。
- `A9`：页面刚进入、语言目录尚未取到的短暂窗口内按钮已显示为置灰；点击后弹层显示空状态提示，目录取到后（弹层保持打开）自动重渲染出语言项，无需关闭再点。
- `A10`：切换扩展语言（zh ↔ en）后，置灰按钮文案与空状态提示均随语言更新；i18n 的 en 与 zh 两套字典里对应 key 都存在。
- `A11`：`npm run check` 无错误；`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom` 全部通过且用例数不少于基线 10 个文件 / 51 项，新增用例覆盖「目录为空仍挂载」「置灰两态」「空状态文案」。
- `A12`：`npm run build:chrome` 与 `npm run build:firefox` 均构建成功，未新增 `*.firefox.ts` 分叉实现。
- `A13`：在开启「记住 YouTube 字幕开关」且记忆状态为关闭的情况下进入视频，原生 CC 为关、按钮置灰；从 VidBoost 面板选语言开启字幕后，继续播放跨过数个 1.2 秒轮询周期，字幕仍保持渲染、YouTube CC 保持开启、按钮保持高亮（记忆恢复不会把这次选择撤回）。

# 约束与不变量

- 「自渲染字幕」功能关闭（`yt_subtitle.enabled === false`）时，控件栏不出现 VidBoost 字幕按钮。
- 按钮只在受支持的观看页（`isSupportedPage()`，即 `/watch` 且 URL 带视频 ID）出现。
- 图标两态沿用现有样式常量：激活 `opacity:1;filter:none`，非激活 `opacity:.45;filter:grayscale(.6)`；判定依据仍是「当前是否有正在渲染的字幕选项」。
- 按钮挂载位置、弹层定位、搜索与键盘交互等既有行为不变。
- 弹层展开时点击外部区域仍关闭弹层；置灰态不构成禁用，鼠标悬停反馈与高亮态一致。
- 不新增 `*.firefox.ts` 分支，Chrome 与 Firefox 共用同一实现。

# 决策

- `D1`（置灰范围）：功能开启且在观看页时按钮一律常驻；只要当前没有正在渲染的字幕就置灰。覆盖四种情况：原生 CC 关闭且开启「跟随 YouTube 字幕开关」、视频无任何 `captionTracks`、命中无字幕缓存、拉取失败已回退原生、以及目录尚未取到的加载窗口。
- `D2`（CC 关闭时点击）：置灰按钮点击仍打开语言面板，并且功能开启但未渲染字幕时也要获取一次 player response 以构建语言目录；用户选中语言后立即渲染该语言字幕，并调用既有的「强制开启原生字幕」链路把 YouTube CC 置为开启，按钮转为高亮。
- `D3`（无字幕时点击）：`captionTracks` 为空时点击置灰按钮打开弹层，列表区显示空状态文案（新增 i18n key，zh「该视频暂无字幕」/ en 对应文案），不改变渲染状态；此时隐藏搜索按钮（无可过滤项）。
- `D4`（文案）：置灰不影响按钮 `aria-label`/`title`，仍使用「VidBoost 字幕」，避免多一套状态文案。
- `D5`（功能关闭）：沿用现状 —— `enabled` 为 false 或非观看页时 `detach()`，按钮不显示、不置灰。
- `D6`（与「记住 YouTube 字幕开关」共存）：用户从 VidBoost 面板显式选语言把字幕开启后，本视频不再被原生开关记忆恢复成关闭，避免刚开启就被静默撤回；该豁免只在当前视频生效，导航到新视频后记忆恢复照常工作。

# 待解决问题

无。

# 验证预期

- 静态检查：`npm run check`。
- 单元/行为测试：`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom`。
- 构建冒烟：`npm run build:chrome`、`npm run build:firefox`。
- 人工验证：Chrome 下在同一视频上覆盖「原生 CC 关闭」「原生 CC 开启」「无任何字幕视频」「断网或拉取失败回退」「popup 开关切换」五类场景的按钮可见性与两态。
