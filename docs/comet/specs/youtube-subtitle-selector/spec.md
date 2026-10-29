# YouTube 控件栏字幕选择面板（完整目标规格）

本规格描述归档后 `src/features/youtube/subtitle/selector/` 这套「视频控件栏字幕选择面板」能力的完整行为：按钮常驻条件与生命周期、置灰两态、空状态渲染、重渲染稳定性、语言目录构建与排序、搜索过滤、面板结构与视觉、键盘与指针交互、选择回调契约、文案与可访问性。未列出的字幕下载/后处理/渲染行为属于 `subtitle-rendering` 能力，此处不变。

宿主：`src/features/YouTubeSubtitleOverlay.ts`（内容脚本）。实现载体为纯 DOM + 行内样式的 `SubtitleSelector` 类，不使用 Svelte，不引入外部 CSS 或字体。

## 1. 挂载条件与生命周期

### 1.1 宿主挂载条件

- 按钮的可见性只由「功能是否开启 + 是否在受支持的观看页」决定，**不再依赖语言目录是否非空**：
  - `shouldRenderOverlay()`（即 `yt_subtitle.enabled === true`）且 `isSupportedPage()`（`/watch` 且 URL 带 `v`）→ 常驻挂载；
  - 其余情况（功能关闭、非观看页、导航开始、不支持页面）→ `detach()`。
- `handleNavigationStart` 先 `detach()`，随后 `clearSubtitleState()` 会以空目录再同步一次：观看页→观看页的 SPA 跳转因此表现为「不闪烁、短暂空目录置灰」，而跳向非观看页时第二次同步仍按上面的条件摘除。
- 因此以下四种「当前没有字幕在渲染」的状态都必须看到按钮常驻且置灰：
  1. 开启了「跟随 YouTube 字幕开关」（`followNativeToggle`）且原生 CC 处于关闭（`shouldPauseForNativeToggleOff()`）；
  2. 视频未提供任何 `captionTracks`（含命中无字幕缓存 `subtitleUnavailableVideoId`）；
  3. 字幕拉取失败并回退原生字幕（`fallbackToNative`）；
  4. 语言目录尚未取到（`subtitleCatalog === null`，首帧加载窗口）。
- `syncSubtitleSelectorView()` 的判定顺序：先按 1.1 决定是否 `detach()`；需要显示时，即使目录为 `null` 也要以空目录（`menuGroups` 两组皆空）调用 `update()` 并 `ensureMounted()`。
- 「功能开启但未渲染字幕」时仍要取得一次 player response 并构建目录（`buildSubtitleCatalog`），使面板在原生 CC 关闭状态下也能列出语言；该获取不得触发字幕渲染，也不改变原生 CC 关闭时的暂停语义。既有「无字幕缓存」与「加载失败阈值」的判定语义保持不变，只是不再影响按钮可见性。

### 1.2 选择器自身

- 面板按钮挂载在 `#movie_player .ytp-right-controls`：由 `resolveSubtitleButtonMountTarget(controls, .ytp-settings-button)` 决定容器与参照节点，按钮插入到设置按钮之前（找不到参照时插入容器首部）。按钮 `class="ytp-button vb-yt-subtitle-selector-button"`，`aria-haspopup="dialog"`、`aria-controls="vb-yt-subtitle-selector-menu"`、`aria-expanded` 随开合更新，尺寸 48×满高，图标为 `icons/icon48.png` 的 `<img>`，24px。
- 图标两态（判定依据不变，语义为「当前是否有正在渲染的字幕」）：`viewModel.activeOptionId` 非空 → `opacity:1;filter:none`；为空 → `opacity:.45;filter:grayscale(.6)`。`update()` 与 `ensureMounted()` 时都要按当前 viewModel 重算，避免重挂载后沿用旧态。
- 置灰不是禁用：按钮保持可点击、hover 反馈与 `cursor:pointer` 与高亮态一致，`aria-label`/`title` 不随两态改变，不设置 `disabled` 或 `aria-disabled`。
- 弹层 `div#vb-yt-subtitle-selector-menu.vb-yt-subtitle-selector-menu`（`role="dialog"`）作为 `#movie_player` 的子节点，绝对定位，右边缘对齐按钮右边缘（`right = max(12, playerRect.right - buttonRect.right)`），下边缘在按钮上方（`bottom = max(56, playerRect.bottom - buttonRect.top + 8)`）。
- `update(viewModel)`：不再因两组语言项为空而 `detach()`；同步按钮 `aria-label`/`title`、图标两态、面板标题与搜索相关文案，并按当前目录（含空目录）渲染；面板可见时按 §1.3 的稳定性规则决定是否重渲染列表，并总是重新定位（重渲染不得重置搜索展开状态与已输入查询）。目录从空变为非空时，处于打开状态的弹层自动渲染出语言项，无需用户重新点击。
- `ensureMounted()` 幂等：按钮与弹层仍在文档中时只重新定位并返回 `true`；否则先 `detach()` 再重建。`#movie_player` 或 `.ytp-right-controls` 缺失时返回 `false` 并保持未挂载，由宿主既有 `scheduleSync` 重试。
- `close()` 只把弹层 `display:none` 并置 `aria-expanded=false`；`detach()` 移除按钮与弹层并清空全部内部引用；`destroy()` 额外摘除 `document` 的 `pointerdown`（捕获阶段）与 `window` 的 `resize` 监听，并复位 viewModel。
- `window resize` 仅在弹层可见时重新定位。
- 点击面板与控件栏按钮之外的区域（`pointerdown` 捕获）关闭面板。

### 1.3 重渲染稳定性（本轮变更）

- 宿主 `pollTrackChange`（`TRACK_POLL_MS = 1200`）在已渲染与置灰两种状态下，每周期都会走到 `update()`。列表 DOM 的重建因此必须由「渲染输入是否变化」决定，而不是由 `update()` 是否被调用决定。
- 「渲染输入」= 影响列表 DOM 的全部内容包括：`groups.provided` / `groups.translated` 两项集合的内容（每项至少覆盖 `id`、`label`、`targetLanguageCode`、`kind` 与 `provided` 的 `sourceKind`）、`activeOptionId`、`activeLanguageCode`、`preferredLanguageCode`、当前 `query`、`searchOpen`，以及 `copy` 的全部文案字段（分组标题、三种徽章、「默认」徽章、空状态文案）。
- 判定必须按内容比较：宿主每周期都用 `buildSubtitleCatalog` 生成新的目录对象，比较对象引用会永远判定为「已变化」。
- 渲染输入与上次实际渲染一致且列表已挂载时，`renderMenu()` 直接返回，不执行 `replaceChildren()`，也不重新生成任何分组标题、语言项或空状态节点；被跳过的周期里键盘焦点、列表 `scrollTop` 与已生效的 hover 背景都保持不变。
- 签名在以下时机必须失效（下一次一定渲染）：`detach()`（含 `destroy()` 与 `ensureMounted()` 开头重建 DOM 的路径）与 `ensureMounted()` 完成一次全新挂载之后。跳过规则不得以任何方式让「重挂载后的面板」停留在旧 DOM 上。
- 渲染输入任一发生变化时，本周期就重建并反映新状态（勾选位置、hover 之外的选中背景、「默认」徽章、语言项增删、空状态与列表互换、新语言文案）。此时列表 `scrollTop` 回到顶部、焦点回到 `listbox` 之外是可接受的行为，本轮不做原位 diff 更新。
- 跳过重建不影响 `positionMenu()`：弹层仍按当前按钮与播放器位置重新定位。

## 2. 语言目录构建与排序（`catalog.ts`）

- `provided` 选项来自 `playerData.captionTracks`：`id = provided:<vssId>:<canonicalCode>`，`label = track.name 文本 || trackName || 规范码`，`sourceKind = kind === 'asr' ? 'asr' : 'author'`，`searchText = "<label> <canonicalCode>".toLowerCase()`。
- 「视频提供」菜单项 = 按 `areTargetLanguagesCompatible(targetLanguageCode)` 去重（同一兼容组内 `author` 覆盖 `asr`），再按 `label` 升序。
- 翻译源轨道由 `selectTranslationSource(playerData)` 选出：先取 `isTranslatable === true` 的轨道，优先命中 `selectedTrack`（按 `vssId` → `languageCode+kind` → `languageCode`），否则取首个非 `asr`，再退到首个 `asr`。
- `translated` 选项 = 翻译源轨道 × `playerData.translationLanguages`，`label` 取 YouTube 已本地化的 `languageName`；跳过与「视频提供」去重结果兼容的语言码，并在自身内部按同一兼容判定去重（先到先得）。
- 「自动翻译」菜单排序：
  1. 语言码解析为 `hans` 书写组的项排第 1（简体中文）；
  2. 解析为 `hant` 书写组的项排第 2（繁体中文）；
  3. 其余项按 `label` 升序排在之后。
- 书写组判定必须复用 `language.ts` 中已有的 `HANS_REGIONS = {CN, SG, MY}` 与 `HANT_REGIONS = {TW, HK, MO}` 语义：`zh-Hans*`/`zh-<HANS 区域>` 为简体，`zh-Hant*`/`zh-<HANT 区域>` 为繁体；只有 `zh` 而无 script 且无可识别区域的码不属于任何置顶组。`language.ts` 对外导出一个按语言码返回 `'hans' | 'hant' | null` 的辅助函数供目录排序使用，`catalog.ts` 内不另写区域表。
- 置顶判定只看规范化后的语言码，不看 `label` 文本，因此 YouTube 界面为英文（"Chinese (Simplified)" / "Chinese (Traditional)"）时行为一致。
- 去重先于置顶：被去重跳过的中文项不会占位，剩余中文项按其自身组别上浮到最前。
- 非中文项之间的比较使用固定 locale（`zh-Hans`）的 `Intl.Collator`，使中文标签按拼音序、拉丁标签按字母序，且不随宿主浏览器 UI 语言漂移；「视频提供」分组沿用 `label` 升序，不受置顶规则影响。
- 排序只在 `buildSubtitleCatalog` 内完成一次，`menuGroups` 交付给渲染层的顺序即最终显示与键盘导航顺序。
- `captionTracks` 与 `translationLanguages` 均为空时目录两组皆空，构建成 `null` 选项属正常结果，不再被当作错误路径，也不影响 1.1 的常驻挂载。

## 3. 面板结构与交互

### 3.1 结构（自上而下）

1. 标题行：左侧面板标题文案（与控件栏按钮 `aria-label` 同源，中文「VidBoost 字幕」/英文 "VidBoost subtitles"），右侧搜索图标按钮。
2. 搜索行：默认不渲染显示（收起态）；展开时位于标题行之下、列表之上，为整宽 `input[type=search]`。
3. 语言列表：`role="listbox"`，可纵向滚动，内部按分组标题 + 语言项顺序平铺（无分组折叠）。

### 3.2 空状态

- 当 `menuGroups.provided` 与 `menuGroups.translated` 均为空时，列表区渲染一条空状态提示（`role="listbox"` 容器内），文案为空状态 key，样式为次级文字（小号、半透明白、左右留白与语言项一致、不可点击、不参与键盘导航）。
- 空状态下搜索图标按钮与搜索行都不出现在界面上（`display:none`，DOM 节点保留），搜索相关内部状态复位为收起且 `query` 为空。
- 目录从空变为非空时（例如 1.1 的加载窗口结束后目录到达、或用户在空状态下由其他路径触发重载），弹层重渲染为「搜索按钮 + 语言列表」，不保留空状态提示节点。
- 置灰按钮点击后仍然打开弹层：有目录时列出语言，无目录时显示空状态提示；两种情况下点击弹层外区域都照旧关闭。

### 3.3 搜索按钮与展开状态

- 搜索按钮为面板内图标按钮（放大镜图形，`aria-hidden` 装饰），`aria-label`/`title` 使用「搜索语言」文案，`aria-expanded` 反映搜索行状态。
- 搜索按钮的唯一状态提示是自身的蓝色底 + 蓝色图标（展开态），不绘制焦点描边：按钮样式固定 `outline:none`，也不在 focus/blur 时改写 outline，因此打开面板把焦点落在该按钮上时不会出现白色圆环。
- 收起 → 展开：显示搜索行、清空焦点无关内容不改动查询、`input` 获得焦点、按钮进入激活态样式。
- 展开 → 收起：隐藏搜索行、`query` 与输入框内容一并清空、立即以空查询重渲染（列表恢复完整）。
- 面板 `open()` / `close()` / `detach()` 后搜索一律处于收起且 `query` 为空；重新打开不得残留上一次的展开状态或搜索词。
- 打开面板不再自动聚焦搜索框（搜索框此时不可见）。

### 3.4 过滤与导航

- `filterSubtitleMenuGroups(groups, query)`：`query` 去首尾空白并小写后为空则返回原组；否则对每个选项的 `searchText` 做子串匹配，`provided` 与 `translated` 两组分别过滤。分组标题仅在该组有可见项时渲染。
- 输入过程中每次 `input` 事件更新 `query` 并重渲染，保留当前展开状态。
- `↑`/`↓`：在「当前可见项」列表（`flattenSubtitleMenuGroups(filterSubtitleMenuGroups(groups, query))`）中循环移动焦点，与 DOM 中渲染出的 `button[data-option-id]` 一一对应；搜索展开与收起两种状态下都只遍历可见项；空状态（零可见项）下方向键不产生焦点移动也不报错。
- `Escape`：搜索行展开时 → 收起搜索行（含清空查询、焦点回到搜索按钮）、面板保持打开；搜索行已收起时 → 关闭面板并把焦点交回控件栏按钮。
- 语言项点击 → `onSelectLanguage(option.targetLanguageCode)`，随后 `close()` 并聚焦控件栏按钮。

### 3.5 视觉（贴合 YouTube 原生深色菜单）

- 弹层：实色深底（约 `#1c1c1c`~`#282828` 区间的深色，透明度接近 1），去掉现有 `1px solid rgba(255,255,255,.18)` 外边框与 `0 8px 24px` 强阴影，改为克制阴影 + 较大圆角；内边距与行高比现版更紧凑；文字 `#fff`，次级文字使用半透明白。
- 尺寸：宽度 `min(360px, calc(100% - 24px))`，最大高度 `min(420px, calc(100% - 80px))`，`box-sizing:border-box`，`overflow:hidden`；列表区 `min-height:0;overflow:auto`。窄播放器或短播放器下不得超出 `#movie_player` 可视范围，`resize` 后重新定位仍完整可见。
- 语言项：单行整宽按钮，左语言名（`min-width:0` 可换行、`overflow-wrap:anywhere`，不与右侧徽章重叠）、右侧弱化徽章；hover 出现浅色背景，选中项为淡蓝背景 + 勾选标记；聚焦环在深浅背景上都清晰可见（outline 不被背景吞掉）。
- 徽章：小号、半透明白文字，不再使用实色胶囊底；仍区分「作者 / 自动生成 / 翻译」，且当 `areTargetLanguagesCompatible(option.targetLanguageCode, preferredLanguageCode)` 为真时追加「默认」强调色徽章。
- 分组标题（「视频提供」/「自动翻译」）：小号、半透明白、非标题栏不可点击，保持现有语义。

## 4. 数据与回调契约

- `SubtitleOption`（`provided` / `translated` 两分支）字段 `id`、`kind`、`targetLanguageCode`、`label`、`searchText`、`sourceTrack`（`provided` 另有 `sourceKind`，`translated` 另有 `translationLanguageCode`）保持不变。
- `SubtitleSelectorViewModel = { groups, activeOptionId, activeLanguageCode, preferredLanguageCode, copy }`；`copy` 在原有 `buttonLabel / searchPlaceholder / providedHeading / translatedHeading / authorBadge / asrBadge / translatedBadge / preferredBadge` 基础上新增空状态文案字段。
- 两组语言项为空是合法输入，`update()` 与 `renderMenu()` 必须能处理，不抛错、不 `detach()`。
- 选中项判定仍为 `isSubtitleMenuOptionActive`：`option.id === activeOptionId` 或 `areTargetLanguagesCompatible(option.targetLanguageCode, activeLanguageCode)`。
- 宿主 `handleSubtitleLanguageSelection` 仍负责规范化语言码、写入 `config.preferredLanguageCode`、`setSettings({ yt_subtitle })` 并重载字幕。
- 在原生 CC 关闭（跟随开关）导致置灰的状态下选择语言：宿主必须先清除「暂停」状态（复用既有 `requestYouTubeSubtitleEnsureEnabled` 强制开启原生 CC 并抑制一次开关记忆写入），再下载并渲染所选语言，成功后按钮转高亮、原生字幕继续由 VidBoost 隐藏。选择失败时按既有失败链路处理，按钮保持置灰。
- 用户从面板显式开启字幕后，本视频记录为「本次由用户手动开启」（`manualNativeToggleOnVideoId`），`restoreNativeToggleForCurrentPage()` 对该视频直接跳过，避免「记住 YouTube 字幕开关」的恢复逻辑在下一个轮询周期把刚开启的原生 CC 又设回关闭、静默撤回用户这次选择。豁免只在强制开启确实生效、且视频未发生变化时登记。该记录随导航（`handleNavigationStart`）与 `unmount()` 清空，不影响其他视频的记忆恢复。

## 5. 文案与可访问性

- 文案取自 `src/lib/i18n.ts` 的 `en` 与 `zh` 两套字典，每个用到的 key 必须两套都存在；空状态文案新增一个 key 并同时提供 en/zh（中文「该视频暂无字幕」，英文对应 "No subtitles available for this video"）。
- 控件栏按钮：`aria-label` = 面板标题文案（置灰与高亮两态共用，不因状态变化），`aria-haspopup="dialog"`，`aria-expanded` 同步。
- 弹层：`role="dialog"` + `aria-label` = 面板标题文案；列表 `role="listbox"`，语言项 `role="option"` + `aria-selected`；空状态提示为 `listbox` 内的普通文本节点，不使用 `role="option"`，不参与 `aria-activedescendant`。
- 搜索按钮：`aria-label`/`title` = 「搜索语言」文案，`aria-expanded` 同步；搜索输入框保留 `placeholder` 与 `aria-label`；空状态下搜索按钮与搜索行都不可见（`display:none`，见 §3.2）。
- 装饰性图形（控件栏图标、搜索图标）标 `aria-hidden="true"`。
- 宿主语言切换（`language`）后，按钮 `aria-label`、弹层标题与空状态文案随 `copy` 更新，无需重建 DOM。

## 6. 测试与构建约束

- 目录/排序单测位于 `__tests__/catalog.test.ts`，面板 DOM 行为单测位于 `__tests__/icon.test.ts` 与 `__tests__/menu.test.ts`（jsdom）。运行：`npx vitest run src/features/youtube/subtitle/selector --environment=jsdom`；该目录为 10 个测试文件，改动不得减少用例数量。
- 新增行为必须有 jsdom 用例覆盖：目录为空时 `update()` 不 `detach()` 且按钮仍在 `.ytp-right-controls` 内；空目录与有目录时图标两态的样式差异；空状态文案渲染与搜索按钮隐藏；空 → 非空重渲染后语言项出现。
- 本轮稳定性必须有 jsdom 用例覆盖：以内容相同、对象引用不同的 viewModel 连续 `update()` 时语言项节点身份保持不变（不被 `replaceChildren()` 换掉）且已聚焦项仍是 `document.activeElement`；渲染输入分别变化（选中项、偏好语言、目录新增语言、`copy` 文案、`query`、`searchOpen`）时确实发生重渲染；`detach()` 或重新 `ensureMounted()` 后一定再渲染一次；空目录连续 `update()` 只保留一个 `.vb-yt-subtitle-selector-empty`。
- 仓库基线（本轮开始前）：`src/features/youtube/subtitle/selector/__tests__` 下 10 个测试文件、58 项全部通过。
- 宿主侧的 §1.1 挂载条件、目录取用时机与 §4 的记忆恢复豁免没有 jsdom 用例（`YouTubeSubtitleOverlay` 目前无测试宿主），由 brief「验证预期」中的 Chrome 人工场景覆盖：原生 CC 关 / CC 开 / 无字幕视频 / 拉取失败回退 / popup 开关来回切换。
- §1.3 的稳定性规则必须能用 jsdom 直接验证（连续 `update()` 的节点身份与焦点），不依赖真实轮询。
- 静态检查：`npm run check`（svelte-check）。打包冒烟：`npm run build:chrome` 与 `npm run build:firefox`。
- 本能力不触碰 `public/manifest.json`、权限与 host 访问；不新增 `*.firefox.ts` 分支，Chrome 与 Firefox 构建共用同一实现。
