# 目标

在既有「插件翻译兼容」单一开关（`yt_subtitle.compatibleWithPluginTranslate`）下，新增第三路让位目标 **Cometix Translate**（用户提供插件目录 `/Users/tune/Downloads/CometixTranslate`，版本 1.32.7.113）。当开关开启、当前 YouTube 字幕轨为非中文、且检测到 Cometix Translate 在场时，VidBoost 停止自渲染字幕、恢复并确保 YouTube 原生 CC 开启（Cometix 的字幕源），把翻译渲染交给 Cometix；在有界时长内未能确认 Cometix 接管时回退到 VidBoost 自渲染，避免「字幕裸奔」。

生效范围与现有两路一致：仅 YouTube watch 页的 VidBoost 自渲染字幕流程内（`loadSubtitlesForCurrentPage` 与 `pollTrackChange` 两个既有触发点），非中文判定沿用 `isChineseLanguageCode`（`zh` 前缀）。

零回归约束：开关关闭、中文字幕、Cometix 不在场时，代码路径与改动前完全一致（Read Frog 与沉浸式翻译两路行为不变）。

# 范围

## 目录结构

### 修改

- `src/features/youtube/subtitleOverlay.shared.ts`
  - `PluginTranslateYield` 增加 `'cometix-translate'`。
  - `resolvePluginTranslateYield` 增加 `cometixPresent` 选项，优先级 `read-frog` > `cometix-translate` > `immersive-translate`（`cometixPresent` 缺省按 `false`，保持既有调用与用例兼容）。
  - 新增 Cometix 在场 / 接管检测：`COMETIX_TRANSLATE_ROOT_ID = 'cometix-imt-root'`、`COMETIX_TRANSLATE_CAPTION_WINDOW_ID = 'immersive-translate-caption-window'`、`findCometixTranslateRoot()`、`isCometixTranslatePresent()`、`hasCometixTranslateTakenOver()`。
  - 新增 `createCometixTranslateYieldController(deps?)`：按 key 去重、确保原生 CC、有界等待接管、超时通知回退、导航重置；所有等待均有界并在 `reset()` 时取消在途流程。
- `src/features/YouTubeSubtitleOverlay.ts`
  - `yieldToPluginTranslateIfApplicable` 接入 `cometixPresent`，新增 `cometix-translate` 分支：让位动作 = 复用 `stopRenderingAndRestoreNativeSubtitles()` + 确保原生 CC 开启 + 控制器验证接管。
  - 超时未接管时回退：控制器回调触发 `scheduleSync(0)` 重载该轨，并把该 key 记入失败集合，后续同一 key 不再尝试让位（防止 1.2s 轮询抖动与让位/回退死循环）。
  - 导航 / 卸载时 `reset()` 控制器。
- `src/lib/i18n.ts`
  - `yt_subtitle_compatible_plugin_translate_desc`（zh / en）补充 Cometix Translate 说明，反映三路优先级与「无自动开启」事实。
- `README.md` / `README.en.md`（若现有文案已描述「插件翻译兼容」两路，则同步为三路；否则保持不变）。
- `CHANGELOG.md`：新增一条 Unreleased / 下一版本条目说明 Cometix Translate 兼容。
- `src/features/youtube/__tests__/readFrogCompat.test.ts`：补齐新判定与控制器用例（或新增独立测试文件，见下）。

### 新建

- `src/features/youtube/__tests__/cometixCompat.test.ts`：jsdom 用例覆盖在场检测、接管检测、三路优先级判定、让位控制器的去重 / 有界等待 / 超时回退 / reset 取消。

### 明确不建

- 不新建独立开关或独立设置字段（沿用单一 `compatibleWithPluginTranslate`）。
- 不新增 manifest 权限、host 匹配或 `*.firefox.ts` 分叉实现。
- 不新增第四个 Native 子 change / Supervisor 拆分。

## Source coverage

覆盖边界：用户以 Cometix Translate 插件目录作为需求来源，边界为其 **YouTube 字幕集成面**——即决定「能否检测到它」「它是否需要原生 CC」「它何时算接管」「有哪些可用的外部触发方式」的文件与代码段。`icons/`、`licenses/`、`offscreen.*`、`side-panel.*`、`popup.*`、`options.*`、非视频平台规则不属边界（与本能力无关）。

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| S1 `manifest.json`（`content_scripts`） | complete | `content_main.js` 以 content script 在 `<all_urls>` 注入；`subtitle_world.js` 以 `world: "MAIN"`、`run_at: document_start` 注入 YouTube 等匹配站点 | `specs/subtitle-rendering/spec.md` §8.3 | A1 | covered | 决定在场检测可用隔离世界 DOM |
| S2 `manifest.json`（`permissions` / `host_permissions`） | complete | 无对外暴露的 `externally_connectable`，无第三方可调 API | spec §8.3、§8.4 | A6 | covered | 排除「调其扩展 API 开启」的方案 |
| S3 `content_main.js`（`c5()` / 顶层挂载） | complete | 顶层 frame 创建 `div#cometix-imt-root` 并挂 `documentElement`，`MutationObserver` 维持挂载 → 稳定的隔离世界在场信号 | spec §8.3 | A1 | covered | 在场检测主信号 |
| S4 `content_main.js`（`_g` / `du.mount()`） | complete | 字幕窗口为 `div#immersive-translate-caption-window`，内含 `closed` shadow root，`data-immersive-translate-subtitle-type` 属性；仅在真正 attach 字幕时创建 | spec §8.3、§8.5 | A2、A7 | covered | 接管检测信号（闭 shadow 只可读宿主元素） |
| S5 `subtitle_rules.js`（`id:"youtube"` 规则） | complete | `captionContainerSelector: "#ytp-caption-window-container"`、`videoPlayerSelector`、`subtitleUrlRegExp: "(/api/timedtext)"`、`subtitleButtonSelector: ".ytp-subtitles-button"` → 字幕来源是 YouTube 原生 CC/timedtext | spec §8.4 | A3 | covered | 让位时必须确保原生 CC 开启 |
| S6 `content_main.js`（`w9()` 字幕按钮点击） | complete | 依 `aria-pressed` 判断并 `click()` 原生 CC 按钮；原生 CC 关闭时它会 `halt` 并 `close` 字幕 | spec §8.4、§8.5 | A3、A7 | covered | 原生 CC 是接管前提；VidBoost 已有等价桥接能力 |
| S7 `default_config.json`（`features`） | complete | `subtitles/subtitleAuto/youtubeAuto/youtubeTranslate` 默认 `true` —— 插件会自行尝试开启，但属其私有存储，第三方不可写 | spec §8.4、§8.6 | A6 | covered | 记录「不依赖其自动开启」的边界 |
| S8 `default_config.json`（`shortcuts`） | complete | `toggle-video-subtitle`（"切换视频字幕预翻译设置"）`keys: ""` 且 `managed: false`；其余快捷键为页面翻译/侧边栏/输入框，无字幕开关默认热键 | spec §8.6 | A6 | covered | 排除 Read Frog 式「合成快捷键自动开启」方案 |
| S9 `content_main.js`（`o_()` / `a_()` / `kw()`） | complete | 页面快捷键仅在 `shortcut.enabled` 时按配置键位匹配，且 `a_()` 要求 `event.isTrusted` → 无默认键位时合成事件无处可派发 | spec §8.6 | A6 | covered | 为 S8 结论提供机制证据 |
| S10 `content_main.js`（`X_`/`Y_`/`Z_` 快捷按钮，`attachShadow({mode:"closed"})`） | complete | 播放器快捷按钮容器 `div.immersive-translate-quick-button-container`、宿主 `div#immersive-translatequick-button` 均在 `closed` shadow root 内 → 外部不可点、不可读状态 | spec §8.6 | A6 | covered | 排除「程序化点按钮开启」方案 |
| S11 `subtitle_world.js`（`Symbol.for("cometix-imt:subtitle-world")`） | complete | MAIN world 安装页面级符号并在 `matches` 命中 YouTube 时启用 timedtext 钩子 → 可靠的「其字幕模块在本页已武装」信号 | spec §8.3 | A1 | covered | 作为可选加强信号；隔离世界无法直接读 |
| S12 `subtitle_world.js`（`stop` / `rewrite` / `capture` 消息协议） | complete | 仅接受同源 `window.postMessage` 的内部协议（`cometix-imt:subtitle`），非外部可控 API | spec §8.4 | A6 | covered | 不得依赖其内部消息协议 |
| S13 `content_guard.js`（`content_main.js` 动态 import） | complete | 主逻辑按 `config:get` 的 `domains.userBlock` 决定是否加载；用户封禁域名时不注入 | spec §8.3、§8.5 | A1、A5 | covered | 在场检测不存在时必须安全地不让位 |

# 非目标

- 不程序化开启 Cometix Translate 的字幕翻译：其无默认字幕热键（S8）、快捷按钮在闭 shadow（S10）、配置在扩展私有存储（S7）、无对外 API（S2）。因此本能力只做「检测 + 让位 + 验证接管」，不做自动开启。
- 不读写 Cometix Translate 的扩展存储、不注入其隔离世界、不使用其内部 `postMessage` 协议（S12）。
- 不区分 Cometix 与「沉浸式翻译」以外同源分支的其他变体插件。
- 不覆盖 Shorts / Embed / Live / 移动版 YouTube（VidBoost 字幕覆盖层本身仅作用于 watch 页）。
- 不改动 Read Frog 与沉浸式翻译两路的既有行为与判定顺序，仅在其间插入 Cometix 一级。
- 不处理 Cometix 自身未启用 YouTube 双语字幕时的用户体验引导（不做提示气泡 / 引导文案）。
- 不新增设置开关、不新增加载入口、不改动字幕选择器与渲染器。

# 验收示例

- `A1`：在场检测——页面存在 `#cometix-imt-root` 时 `isCometixTranslatePresent()` 返回 `true`；元素移除后返回 `false`；`document` 不可用（SSR/非浏览器）时返回 `false` 且不抛错。
- `A2`：接管检测——页面存在 `#immersive-translate-caption-window` 时 `hasCometixTranslateTakenOver()` 返回 `true`，不存在时返回 `false`；仅存在 `#cometix-imt-root` 时仍返回 `false`。
- `A3`：让位动作——判定为 `cometix-translate` 时，VidBoost 停止自渲染并移除自身隐藏原生字幕的样式（`#vb-yt-subtitle-native-hide` 不存在），且调用一次原生 CC 确保开启（`requestYouTubeSubtitleEnsureEnabled` 被调用），随后进入接管等待。
- `A4`：三路优先级——开关开启且字幕非中文时：Read Frog 在场 → `read-frog`；Read Frog 缺席且 Cometix 在场 → `cometix-translate`；两者皆缺席 → `immersive-translate`；开关关闭或中文字幕（`zh*`）→ `null`（三者均不让位）。
- `A5`：接管成功——让位后在有界时长内出现 `#immersive-translate-caption-window` 时，控制器判定成功、不再触发回退，同一 `videoId + optionKey` 后续轮询不重复让位。
- `A6`：超时回退——让位后在等待上限内始终未出现接管窗口时，控制器通知回退、清理计时器；VidBoost 重新自渲染该字幕轨，且同一 key 不再尝试让位（不出现让位/回退循环）。
- `A7`：等待期间用户或插件状态变化——等待中接管窗口出现即成功，与超时互斥；`reset()` 调用后所有在途等待被取消，之后的 `activate` 可按新 key 重新开始。
- `A8`：Cometix 不在场——页面无 `#cometix-imt-root` 时不进入 Cometix 分支，行为回落为既有「Read Frog 在场 → 让位；否则 IT 让位」，不产生任何 Cometix 相关等待或计时器。
- `A9`：i18n——`yt_subtitle_compatible_plugin_translate_desc` 在 `zh` 与 `en` 两套字典中均存在，且文案覆盖「Read Frog 优先、Cometix 次之、否则沉浸式翻译」与「Cometix 需自行开启字幕翻译」两点。
- `A10`：静态检查——`npm run check`（svelte-check）无错误。
- `A11`：单元测试——新增 jsdom 用例全部通过，覆盖 A1、A2、A4、A5、A6、A7 的判定与控制器行为；既有 `readFrogCompat.test.ts` 用例全部通过（零回归）。
- `A12`：既有两路零回归——`resolvePluginTranslateYield` 在不传 `cometixPresent` 时，与原实现结果完全一致（`{enabled, readFrogPresent}` 的全部既有组合）。

# 约束与不变量

- 单一开关不变：沿用 `compatibleWithPluginTranslate`，不新增设置字段；旧存储迁移语义不变。
- 判定收敛在 `subtitleOverlay.shared.ts` 的纯函数 `resolvePluginTranslateYield`，overlay 只消费结果。
- 所有等待 / 轮询均有界（间隔与总时长常量化），结束后清理计时器；不在页面留常驻 observer 或无限轮询。
- 让位与回退必须幂等且可重入：同一 `videoId + optionKey` 至多让位一次、至多回退一次，`pollTrackChange` 的 1.2s 轮询不得造成抖动。
- 不依赖 Cometix 的内部实现细节：只使用其页面 DOM 标识（`#cometix-imt-root`、`#immersive-translate-caption-window`）与 VidBoost 自有桥接（确保原生 CC 开启）。
- 现有「开关关闭 / 中文字幕 / 两插件皆缺席」路径的代码分支与行为不变。
- 新增 DOM 依赖必须可降级：任一元素缺失只导致「不让位」或「回退自渲染」，不得抛错中断字幕渲染主流程。

# 决策

- `D1`（沿用单开关、不加新开关）：用户诉求是给已有「插件翻译兼容」增加第三路目标，不是新增独立能力项。加开关会让三个插件产生 3 个开关与仲裁矩阵，违背上一轮合并单开关的设计结论（见项目记忆 `read-frog`）。
- `D2`（优先级 Read Frog > Cometix > 沉浸式翻译）：用户确认。Read Frog 可被自动开启，价值最高；Cometix 与沉浸式翻译同源，但 Cometix 有可验证的接管信号（独立 caption window + 独立 root），因此排在 IT 之前做具体分支优先。
- `D3`（在场检测用隔离世界 DOM）：主信号 `#cometix-imt-root`（S3）。理由：content script 可直接读、稳定、不依赖其内部符号；MAIN world 的 `cometix-imt:subtitle-world` 符号（S11）需要跨世界桥接，作为可选加强而非必需，避免为一个可读信号引入新的桥接协议与失败面。
- `D4`（不做自动开启）：S8/S9/S10 共同证明其无可用外部触发（无默认字幕热键、快捷按钮闭 shadow、`isTrusted` 校验）。因此不复制 Read Frog 的「合成 Alt+C」方案，改为「让位 + 验证接管 + 未接管回退」。用户确认该取舍。
- `D5`（让位时确保原生 CC 开启）：S5/S6 表明其字幕源是 YouTube 原生 CC/timedtext，CC 关闭时它会 halt 并 close 字幕。因此调用既有 `requestYouTubeSubtitleEnsureEnabled()` 双保险。用户确认。
- `D6`（接管判定）：以 `#immersive-translate-caption-window` 出现为准（S4）。理由：该元素仅在其真正 attach 字幕时创建，是「已接管」的最直接外部可见证据。
- `D7`（有界等待 + 回退）：等待上限取 6s（间隔 500ms），覆盖其默认 `autoEnableSubtitle` 的 1s 延迟点击（S6 `w9()` 的 `setTimeout(...,1000)`）与后续 timedtext 拉取。超时即回退自渲染，并把 key 记入失败集合，保证不抖动、不循环。
- `D8`（回退方式）：复用 `scheduleSync(0)` 触发现有重载路径，不新增加载入口；失败集合随视频 / 字幕轨 key 变化自然失效。

# 待解决问题

无。用户已确认的三项决定（让位 + 验证接管并在未接管时回退、优先级 Read Frog > Cometix > 沉浸式翻译、让位时确保原生 CC 开启）已写入「决策」；来源边界 S1–S13 全部 `complete` 且均有 Spec 位置与验收 ID 对应，无 `[blocking]`。

# 验证预期

- 静态检查：`npm run check`（svelte-check）。
- 单元测试：`npx vitest run src/features/youtube/__tests__ --environment=jsdom`（新增 Cometix 判定与控制器用例 + 既有 Read Frog 用例零回归）。
- 人工功能验收（Chrome，加载构建产物 + Cometix Translate 1.32.x）：非中文视频下验证 A3–A8——在其「YouTube 双语字幕」开启与关闭两种状态下分别观察接管成功与超时回退；同装 Read Frog 验证 A4 优先级；切换视频与字幕轨验证去重与 key 失效；确保原生 CC 被开启。