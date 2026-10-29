# 目标

扩展 VidBoost 的「插件翻译兼容」能力：在现有「兼容沉浸式翻译」之外，新增对 Read Frog 浏览器扩展（基于源码 v1.49.3 调研）视频字幕翻译的兼容。当用户开启「兼容 Read Frog」开关且 VidBoost 检测到当前字幕为非中文时，VidBoost 停止自己的字幕叠加渲染并自动开启 Read Frog 的字幕翻译，由 Read Frog 渲染翻译结果。生效范围与「兼容沉浸式翻译」完全一致（YouTube watch 页、VidBoost 自渲染字幕流程内、非中文即非 `zh*` 语言代码）。

# 范围

- `src/lib/settings.ts`：`YTSubtitleConfig` 新增 `compatibleWithReadFrog: boolean`（默认 `false`），补齐 `DEFAULT_SETTINGS.yt_subtitle` 默认值与 `cloneYTSubtitleConfig` 的类型回退（旧存储缺字段时回退默认值）。
- `src/popup/App.svelte`：在「兼容沉浸式翻译」开关行下方新增「兼容 Read Frog」开关行（同款行布局、tooltip 交互与禁用态规则），绑定 `compatibleWithReadFrog`。
- `src/lib/i18n.ts`：新增 `yt_subtitle_compatible_read_frog` 与 `yt_subtitle_compatible_read_frog_desc`（zh / en 两套）。
- `src/features/youtube/subtitleOverlay.shared.ts`：新增 Read Frog 检测与触发辅助（与 `isImmersiveTranslateActive` 并列）：
  - 在场检测：`#read-frog-subtitles-translate-button-container`（Read Frog 启用视频字幕后挂载于 `.ytp-right-controls`，open shadow root）；
  - 状态读取：该容器 shadowRoot 内 `.read-frog-subtitles-translate-button` 的徽标文本 `"ON"` / `"OFF"`（Read Frog 硬编码、非 i18n）；
  - 触发：向 `document` 派发合成 `keydown` + `keyup`（`altKey: true`、`code: 'KeyC'`、`key: 'c'`），对应 Read Frog 默认字幕切换快捷键 Alt+C。
- `src/features/YouTubeSubtitleOverlay.ts`：新增 `shouldYieldToReadFrog(trackLanguageCode)` 判定（开关开启 + 非中文 + Read Frog 在场），在现有两个触发点（`loadSubtitleAndRender` 的 option 解析后、`pollTrackChange` 的 option 解析后）接入；让位动作复用现有恢复原生字幕语义（停渲染、清状态、移除 VidBoost 自身的原生字幕隐藏样式），并附带受控触发流程：
  - 容器尚未挂载（扩展加载竞态）→ 有界轮询等待容器出现后再派发；超时安全放弃；
  - 派发前校验徽标为 OFF；派发后有界验证徽标翻 ON，未翻则有限重试后放弃，不抛错；
  - 守卫：徽标已 ON 时不派发（避免把 ON 切回 OFF）；同一 `videoId + optionKey` 去重（1.2s 轮询不重复派发）；用户经 Read Frog 自身 UI 手动关闭后，同一视频内不自动重开，切换视频或字幕轨后恢复触发。
- 新增 jsdom 单元测试（vitest，置于 `src/features/youtube/__tests__/`）：覆盖徽标状态读取（ON / OFF / 容器缺失）、Alt+C 事件构造与派发目标、触发守卫逻辑（去重、ON 不派发、手动关闭不重开）。

# 非目标

- 不支持 Read Frog 在 Shorts / Embed / Live / x.com / Netflix 的字幕功能（VidBoost 字幕覆盖层本身仅作用于 YouTube watch 页）。
- 不修改 Read Frog 插件本身；不读写其扩展存储、不注入其隔离世界，仅使用页面共享 DOM（open shadow root、稳定 id / 类名）与合成键盘事件。
- 不为「用户重映射了 Read Frog 切换快捷键」提供点击模拟回退：快捷键非默认 Alt+C 时自动开启静默失效（让位行为仍生效，原生字幕保持可见）。
- 不改变现有「兼容沉浸式翻译」的行为语义（IT 开关开启 + 非中文时仍无条件让位）。
- 不做两个插件兼容同时开启时的仲裁 UI，仅实现「IT 优先」规则。
- 不改动 `public/manifest.json`、权限与 host 访问，不新增 `*.firefox.ts` 分叉实现。

# 验收示例

- `A1`：「兼容 Read Frog」开关默认关闭；popup 中该开关行出现在「兼容沉浸式翻译」行下方，切换后立即生效并持久化；旧版本存储缺少该字段时回退 `false` 不报错；`yt_subtitle_compatible_read_frog` 与 `yt_subtitle_compatible_read_frog_desc` 在 zh / en 两套字典中均存在。
- `A2`：开关开启 + watch 页 + 非中文字幕（语言代码非 `zh` 前缀）+ Read Frog 已启用（页面出现其翻译按钮容器）→ VidBoost 不渲染自己的覆盖层、移除自身隐藏原生字幕的样式（原生字幕短暂可见），并向 `document` 派发 Alt+C keydown / keyup 合成事件，Read Frog 徽标由 OFF 翻为 ON、翻译接管显示。
- `A3`：触发守卫——徽标已为 ON 时不派发事件（不得把已开启的翻译切回 OFF）；同一视频同一字幕轨在 1.2s 轮询中只触发一次派发；用户经 Read Frog 自身 UI（面板开关或快捷键）手动关闭后，同一视频内 VidBoost 不再自动重开，切换视频或字幕轨后恢复触发。
- `A4`：中文字幕（`zh*` 语言代码）时：不让位、不派发事件，VidBoost 正常自渲染字幕（行为与开关关闭时一致）。
- `A5`：开关关闭，或 Read Frog 未安装 / 未启用其视频字幕功能（页面无其按钮容器）时：VidBoost 正常自渲染翻译字幕，不派发事件、不让位、不显示原生字幕裸奔态。
- `A6`：IT 优先——「兼容沉浸式翻译」让位条件成立（IT 开关开 + 非中文）时保持现有 IT 让位行为，且不派发 Read Frog 快捷键；IT 条件不成立而 Read Frog 条件成立时才触发 Read Frog 让位。
- `A7`：让位决策时 Read Frog 按钮容器尚未挂载（页面刚加载的扩展竞态）→ 在有界时长内轮询等待容器出现后再派发；超时后安全放弃（不抛错、不留常驻定时器），原生字幕保持可见。
- `A8`：`npm run check`（svelte-check）无错误。
- `A9`：新增 vitest（jsdom）用例全部通过：徽标状态读取三分支（ON / OFF / 缺失）、合成事件构造与派发目标（document、altKey、code=KeyC、keydown+keyup 成对）、守卫逻辑（ON 不派发、同键去重、手动关闭后同视频不重开）。

# 约束与不变量

- 现有「兼容沉浸式翻译」与自渲染字幕行为不变（回归约束：Read Frog 开关关闭时代码路径与改动前一致）。
- 中文判定沿用 `isChineseLanguageCode`（`zh` 前缀），与 IT 兼容共用同一判定。
- 所有等待 / 重试均有界并在结束后清理定时器，不在页面留常驻 observer 或无限轮询。
- 仅当徽标可读且为 OFF 时才派发快捷键事件；事件必须成对（keydown + keyup）且字段完整。
- 不读写 Read Frog 的扩展存储、不依赖其内部 API；只依赖其页面 DOM 标识（`read-frog-subtitles-translate-button-container` id、`read-frog-subtitles-translate-button` 类名、徽标 ON / OFF 文本）。
- popup 开关行的禁用态规则与 IT 兼容行一致（跟随 `ytSubtitleStyleDisabled`）。

# 决策

- `D1`（独立开关）：新增 `compatibleWithReadFrog` 独立布尔开关（默认关），与 `compatibleWithImmersiveTranslate` 并列，不复用同一开关——两插件的用户群与行为不同，独立开关避免互相牵连。
- `D2`（生效范围）：与 IT 兼容完全一致——VidBoost YT 字幕 overlay 流程内（watch 页）、非中文（非 `zh*`）时让位；由现有两个触发点接入，不新增轮询入口。
- `D3`（在场才让位）：与 IT 的无条件让位不同，Read Frog 让位以「检测到其按钮容器在场」为前提。理由：Read Frog 在场检测可靠（稳定 id 的页面 DOM），插件缺席时 VidBoost 正常自渲染，避免「字幕裸奔无翻译」的降级态。
- `D4`（开启机制 = 合成 Alt+C）：Read Frog 的翻译显示默认 OFF，可由其设置面板开关、播放器按钮、键盘快捷键（默认 Alt+C）或 autoStart 配置开启；前两者在 shadow DOM 内且面板交互多步，autoStart 属其私有存储不可写。已核实其热键库（tanstack hotkeys）监听 `document` 且不校验 `event.isTrusted`，合成 KeyboardEvent 跨隔离世界可达。故选择派发合成 Alt+C 并以徽标 ON/OFF 做前置校验与结果验证。局限：用户重映射快捷键后自动开启失效，记入非目标。
- `D5`（IT 优先）：两开关同开且两插件都在场时，IT 让位优先（保持现有行为零变更），Read Frog 仅在 IT 条件不成立时评估，避免双翻译叠加冲突。
- `D6`（触发守卫）：`pollTrackChange` 每 1.2s 执行，必须防止重复派发把 ON 切回 OFF 或与用户手动操作打架：徽标 ON 不派发、按 `videoId + optionKey` 去重、手动关闭后同视频不重开。
- `D7`（让位动作）：复用 `showNativeSubtitlesForImmersiveTranslate` 的语义（停渲染、清状态、移除 VidBoost 自身隐藏样式、恢复原生字幕显示）。Read Frog 开启翻译后自行隐藏原生字幕（其自身样式 `read-frog-hide-native-captions`），用户关闭 Read Frog 时其自行恢复原生显示，不受 VidBoost 干扰。

# 待解决问题

无。本轮已调研双方源码（VidBoost 现有 IT 兼容链路、Read Frog v1.49.3 字幕系统与热键机制），影响用户可见结果的决定均已列入「决策」，待用户最终确认完整 Shape。

# 验证预期

- 静态检查：`npm run check`。
- 单元测试：`npx vitest run src/features/youtube/__tests__ --environment=jsdom`（新增 Read Frog 检测 / 触发辅助与守卫逻辑用例）。
- 回归：既有选择器测试 `npx vitest run src/features/youtube/subtitle/selector --environment=jsdom` 不受影响。
- 人工功能验收：Chrome 安装 Read Frog（1.49.x）并启用其「视频字幕」功能 + VidBoost 加载构建产物，覆盖 A2–A7 场景：非中文 / 中文视频、开关开 / 关、卸载或禁用 Read Frog、IT 兼容同开优先级、Read Frog 手动关闭后切换视频恢复触发、页面刚加载的竞态等待。
