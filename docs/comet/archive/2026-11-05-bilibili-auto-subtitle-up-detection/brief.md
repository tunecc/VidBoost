# 目标

修复并优化 B 站「自动打开中文字幕」（`bb_subtitle`）中「加入当前视频UP」与 UP 主识别链路：

- 用户已确认：在 `https://www.bilibili.com/video/BV1d2pF6nESA/` 这类视频页，点击 popup 的「加入当前视频UP」会提示「当前页面未识别到 UP 主」；部分视频需要反复点击多次才偶然成功。
- 修复后：在正常的 B 站视频页（含站内 SPA 切换到的新视频、页面刚加载或 UP 信息尚未渲染的时刻），点一次「加入当前视频UP」即可稳定识别并加入；识别失败只在确实不是视频页 / 确实拿不到 UP 主信息时出现，并给出准确原因。
- 同时加固白名单生效链路：加入的 UP 主视频在打开后能稳定应用「自动打开中文字幕」，不因一次过早的 UP 读取或站内 SPA 切换而永久放弃。
- 等待预算有界：点一次「加入当前视频UP」后，识别单次不超过 2s，popup 从点击到出结果不超过约 3s；没有 UP 主的非 `/video/BV…` 页面快速失败，不让用户长时间等待。

已核实的事实（2026-11-05，chrome-devtools 实测 + 代码审查）：

1. **主因（已定位）**：内容脚本以 `all_frames: true` 注入所有 iframe（`public/manifest.json`）。`VB_BB_SUBTITLE_CURRENT_UPLOADER` 在 `src/content/index.ts` / `src/content/index.firefox.ts` 中没有任何顶层 frame 判断；B 站视频页存在 `s1.hdslb.com` 的 iframe（实测 2 个）。`chrome.tabs.sendMessage` 向所有 frame 广播并采用最先返回的响应，子 frame 立即返回 `{uploader: null}`（`isSiteHost('bilibili')` 为 false），于是 popup 显示「未识别到 UP 主」。顶层 frame 因需要扫描大 DOM 返回更慢，所以表现为「有时能识别、有时要连点很多次」，页面越重越容易失败。
2. 新版视频页不存在 `#v_upinfo`；UP 信息位于 `.up-info-container` / `.up-detail-top` 内的 `a.up-name[href*="space.bilibili.com/"]`。实测现有选择器在该页可识别出「南翔 / 596842980」，即顶层 frame 的识别逻辑本身可用。
3. `uploaderProfile.ts` 的 `__INITIAL_STATE__` 内联脚本回退在现行视频页已失效（页面不再内联含 `owner` 的初始状态脚本），属于死代码；`meta[name="author"]` 在站内 SPA 切换后仍是旧视频作者，不可作为回退来源。
4. 站内点击「接下来播放」是 SPA 切换：URL 先变，约 1.3s 后标题与 UP 主 DOM 才更新；`popstate` 不触发，`pushState/replaceState` 无法从隔离世界拦截；扩展目前仅靠 `<title>` 变化兜底。
5. `getCurrentUploaderTargets()` 会把空数组当作有效缓存（`[]` 为真值），同一页面 key 下会一直返回空；且 `runApplyAttempt()` 在白名单过滤失败时直接返回、不再重试——一次过早读取即可让该视频永久不自动开字幕。

# 范围

## 目录结构

### 修改

- `src/features/bilibili/uploaderProfile.ts`：UP 主识别来源、选择器与缓存语义；新增等待就绪与按 BVID 的公开接口回退。
- `src/features/BilibiliAutoSubtitle.ts`：识别等待、白名单过滤的重试与缓存、SPA 切换检测、点击生效校验。
- `src/content/index.ts`：`VB_BB_SUBTITLE_CURRENT_UPLOADER` 只由顶层 frame 响应，并返回带原因的结果。
- `src/content/index.firefox.ts`：与 Chrome 入口保持同一消息语义。
- `src/popup/App.svelte`：「加入当前视频UP」在有限次数内自动重试，失败时区分原因提示。
- `src/lib/i18n.ts`：新增失败原因文案（en / zh-CN）。

### 新建

- `src/lib/__tests__/bilibiliUploaderProfile.test.ts`：识别来源、等待、接口回退与缓存语义。
- `src/lib/__tests__/bilibiliAutoSubtitle.test.ts`：白名单重试、frame 约束与字幕项选择/生效校验。
- `docs/comet/changes/bilibili-auto-subtitle-up-detection/specs/bilibili-auto-subtitle/spec.md`：本能力的完整目标规格。

### 明确不建

- 不新增 manifest 权限、页面脚本（MAIN world）模块、后台消息通道或新的设置字段。
- 不新增 README 章节：用户可见行为属于缺陷修复，功能描述不变。

# 非目标

- 不改变 B 站播放器自身的字幕渲染、样式、翻译能力；不抓取 API 字幕内容，也不伪造字幕。
- 不处理「视频本身没有中文字幕」的场景：没有中文字幕时保持现状（不动作、不报错）。
- 不在本次改动中主动打开播放器字幕面板（`.bpx-player-ctrl-subtitle` 的展开行为未能在登录态验证，风险不可控，留作后续 change）。
- 不改变 `bb_subtitle` 设置模型、默认值、UI 结构与既有文案键；`targetMode` 仍为 `all` / `allowlist`。
- 不改变 B 站画质功能（`bb_quality`）的行为；`uploaderProfile` 的识别结果对画质功能保持兼容（识别成功时返回同样的 uid/name/profileUrl 语义）。
- 不新增 manifest 权限、host 授权或运行时依赖。

# 验收示例

- `A1` 多 frame 约束：内容脚本运行在子 frame（`window.top !== window`，例如 `s1.hdslb.com` 的 iframe）时，收到 `VB_BB_SUBTITLE_CURRENT_UPLOADER` 不调用 `sendResponse`；只有顶层 frame 响应。模拟「子 frame 先就绪、顶层 DOM 很大」的并发响应时，popup 收到的是顶层 frame 的识别结果而不是 `null`。
- `A2` 识别来源：新版视频页（无 `#v_upinfo`，UP 信息在 `.up-info-container` / `.up-detail-top`）识别出 UID 与昵称；`//space.bilibili.com/<uid>/`、带 `spm_id_from` 查询参数、纯 UID、昵称输入都能归一到同一目标值。
- `A3` 等待就绪：请求到达时 UP 主 DOM 尚未渲染，则在有界等待窗口内轮询 DOM（`/video/BV…` 页面 1000ms，其它受支持页面 400ms）；信息出现后返回正确结果，不在等待窗口内直接返回 `null`，且单次识别总耗时不超过 2s。
- `A4` 接口回退：DOM 在等待窗口内仍无 UP 信息，且页面 URL 可解析出 `BV` 号时，用 `https://api.bilibili.com/x/web-interface/view?bvid=<BV>` 的 `data.owner` 作为回退，接口只使用单次识别剩余的等待预算；接口失败或非 `/video/BV…` 页面时返回带原因的空结果，不抛错。
- `A5` 缓存语义：UP 主识别结果只缓存非空值；空结果（未就绪 / 接口失败）不写入页面级缓存，下一次读取会重新尝试；同一页面 key 下非空缓存可复用。
- `A6` popup 单次点击成功：在顶层 frame 需要短暂等待或第一次消息失败时，popup 自动重试（最多 3 次调用、间隔 300ms / 600ms），最终成功加入并提示「已添加」；整个过程中不要求用户再次点击。
- `A7` popup 失败提示：确认不是 B 站视频页（如首页、频道页）时，提示明确指向「当前页面不是 B 站视频页」；是视频页但确实拿不到 UP 主信息时，提示「暂时没拿到 UP 主信息，请稍后重试」，两种提示可区分。
- `A8` 白名单不提前放弃：白名单模式下进入视频页时首轮 UP 读取为空，自动流程继续按退避重试，直到识别出 UP 主并判定是否命中；只有确认不在白名单才停止对该页面的处理。
- `A9` 站内 SPA 切换：在视频页通过「接下来播放」切到另一 UP 主的视频后，扩展在有限时间内感知切换（不依赖标题变化），按新视频的 UP 主重新判定白名单，并对命中视频自动开启中文字幕。
- `A10` 点击生效校验：点击中文字幕项后校验其进入激活态（`bpx-state-active` 等）；未生效则在退避间隔内重试，不直接把该页面标记为已完成；已激活的中文字幕不会重复点击，也不会被自动流程关闭。
- `A11` 优先级回归：多条中文字幕并存时仍优先 `ai-zh`（AI 中文），其次 `zh-Hans` / `zh-CN` / 其它 `zh*`，再退到文本包含中文标记的项；`bb_subtitle.enabled=false` 或 `targetMode=all` 时行为与现状一致。
- `A12` 回归与构建：新增单元测试通过；`npm run check` 通过；`npm run build:chrome` 成功。
- `A13` 等待有界：单次识别（DOM 等待 + 接口回退）总耗时 ≤2s；popup 从点击到出结果 ≤3s，单次调用已用满预算（≥1s）或总耗时已达上限时不再发起下一次重试；非 `/video/BV…` 页面在 ≤1s 内给出结果或 `not-ready`。

# 约束与不变量

- 功能关闭（`bb_subtitle.enabled !== true`）时不产生任何识别请求、网络请求或定时器。
- 白名单为空时不匹配任何视频（现状），不因本次改动变成「全部视频」。
- 不对子 frame 做任何 B 站逻辑；内容脚本在子 frame 只保持原有中立行为。
- 识别回退请求只在 DOM 识别失败后触发，且同一页面同一 BV 至多一次，不形成轮询风暴。
- 单次识别总耗时不超过 2s，popup 一次点击从发出请求到给出结果不超过约 3s；超时只返回 `not-ready`，不继续排队重试。
- 定时器遵守后台标签页节流；页面不可见时不无限重试，回到前台后能恢复判定。
- Chrome 与 Firefox 两个入口行为一致；消息只新增可选字段，旧字段 `uploader` 语义不变。
- 不引入对 B 站私有/需登录接口的依赖；`/x/web-interface/view` 为公开接口。

# 决策

- 采用「顶层 frame 独占响应」作为主修复（Q1 已确认症状为 popup 报未识别），这是「需要连点很多次」的直接原因。
- 识别链路改为「DOM → 有界等待 → 公开接口回退」三级；不再使用已失效的内联 `__INITIAL_STATE__` 正则回退，也不使用 SPA 后残留的 `meta[name="author"]`。
- 空识别结果不缓存；白名单过滤区分「UP 未知（继续等待）」与「确认不在白名单（停止）」。
- 站内 SPA 切换检测采用「URL 轮询 + `popstate` + `<title>` 观察」组合，不依赖内容脚本拦截 `history.pushState`（隔离世界中无效）。
- 字幕点击后必须校验激活态才算完成；未生效按退避重试。
- popup 自动重试次数与间隔取有限值：最多 3 次调用（间隔 300ms / 600ms），单次调用已用满预算（≥1s）或整体已超过 3s 时不再重试。
- （Q3，用户确认，revise-requirements）收紧等待预算：单次识别 ≤2s（`/video/BV…` DOM 等待 1000ms、其它页面 400ms，接口只用剩余预算）；popup 从点击到出结果 ≤3s，避免极端场景等待 7–9s。
- （Q1，用户确认）失败环节是「加入UP主报未识别」，不是「UP 已加入但字幕不打开」。
- （Q2，用户确认）「要点很多次」指 popup 的「加入当前视频UP」需要反复点击。

# 待解决问题

（无）

# 验证预期

- 单元测试：`npx vitest run`（新增 `bilibiliAutoSubtitle.test.ts`、`bilibiliUploaderProfile.test.ts`、`bilibiliUploaderLookup.test.ts`、`webextFrame.test.ts`；jsdom + 伪时钟覆盖 A1–A11 的纯逻辑部分，以及 A13 的等待预算与停止重试条件）。
- 静态检查：`npm run check`。
- 构建冒烟：`npm run build:chrome`。
- 浏览器实测（chrome-devtools）：在 `BV1d2pF6nESA` 与至少一个其它 UP 主的视频页核对 A2（顶层 frame 识别结果）、A9（「接下来播放」切换后的重新判定）；登录态字幕 UI 行为无法在本机复现，A10 以单元测试与代码审查作为证据，并在报告中记录该限制。
