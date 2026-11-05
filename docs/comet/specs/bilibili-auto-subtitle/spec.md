# B 站自动打开中文字幕（完整目标规格）

本规格描述归档后 Bilibili「自动打开中文字幕」能力（`bb_subtitle`）的完整行为：设置与作用范围、UP 主识别（共享模块 `uploaderProfile`）、popup「加入当前视频UP」、白名单过滤、字幕项选择与生效校验、导航检测与重试，以及内容脚本的消息边界。B 站画质（`bb_quality`）复用同一 UP 主识别模块，但画质选择链不在本规格展开；本 change 不改变画质功能的可观察行为。

## 1. 设置与作用范围

- `BilibiliSubtitleConfig`（`src/lib/settings.ts`）保持 `{ enabled: boolean; targetMode: 'all' | 'allowlist'; targets: string[] }`，默认 `enabled=false`、`targetMode='all'`、`targets=[]`。
- `enabled !== true` 时：内容脚本不发起识别、不发起网络请求、不设置重试定时器；已存在的定时器与监听全部清理。
- `targetMode === 'all'` 时：所有支持的视频页都尝试开启中文字幕，不做 UP 主判定。
- `targetMode === 'allowlist'` 时：只有当前视频 UP 主命中 `targets` 才尝试开启；`targets` 为空表示不匹配任何视频。
- 目标值归一化沿用 `normalizeBilibiliTargetValue`：纯 UID、"space.bilibili.com/<uid>"、带协议或 `//` 协议相对写法、带 `spm_id_from` 查询参数的空间链接都归一为 UID；非链接文本归一为去掉 `@`、协议和尾部斜杠的小写昵称；`|` 或 `｜` 之后的内容视为备注不参与比较。

## 2. 支持的页面

- 支持路径前缀：`/video/`、`/bangumi/play/`、`/medialist/play/`、`/list/watchlater`，且宿主域名匹配 B 站站点画像（`isSiteHost('bilibili')`）。
- 页面判定基于当前 `location`，站内 SPA 切换后按新 URL 重新判定。
- 不支持的页面：内容脚本不执行任何识别或字幕动作；popup 请求返回 `reason: 'unsupported-page'`。

## 3. UP 主识别（`src/features/bilibili/uploaderProfile.ts`）

### 3.1 识别来源与优先级

按以下顺序合并，先得到 `uid` 与 `name` 即止：

1. **DOM**：按选择器收集当前视频的 UP 主链接与名称：
   - 链接：`#v_upinfo a[href*="space.bilibili.com/"]`、`.up-info-container a[href*="space.bilibili.com/"]`、`.up-detail-top a[href*="space.bilibili.com/"]`、`.video-owner a[href*="space.bilibili.com/"]`、`a.up-name[href*="space.bilibili.com/"]`；
   - 名称：`#v_upinfo .up-name`、`#v_upinfo [class*="up-name"]`、`.up-info-container .up-name`、`.up-info-container [class*="username"]`、`.up-detail-top .up-name`、`.video-owner .up-name`、`.video-owner [class*="username"]`、`a.up-name`；
   - 名称还会读取元素的 `textContent`、`title`、`aria-label`、`data-name`、`data-uname` 与内部 `img[alt]` / `img[title]`，并去除空白折叠、"的个人空间" 后缀、"UP主" 后缀；
   - 推荐位、评论区等非当前视频区域的上传者不得作为识别结果（以上选择器均限定在当前视频详情区域内）。
2. **有界等待**：DOM 未给出完整结果（缺少 UID 或名称）时，以 150ms 间隔轮询 DOM：`/video/BV…` 页面最长 1000ms，其它受支持页面最长 400ms（不存在 UP 主的页面快速失败）；轮询期间一旦得到结果立即返回。
3. **公开接口回退**：等待结束仍缺少 UID 时，若当前 URL 能解析出 `BV` 号（`/video/BV…`），请求 `https://api.bilibili.com/x/web-interface/view?bvid=<BV>`（`credentials: 'include'`）；接口只使用单次识别剩余预算（整体识别不超过 2s）并在超时后中止。`code === 0` 时取 `data.owner.mid` / `data.owner.name`，并补齐 `https://space.bilibili.com/<mid>` 的 `profileUrl`。接口失败、超时、非 `BV` 页或返回空时视为无结果，不抛错。
4. 不再读取内联 `__INITIAL_STATE__` 脚本正则（现行视频页已不内联该数据），也不使用 `meta[name="author"]`（站内 SPA 切换后仍为旧视频作者）。

### 3.2 缓存

- 缓存键为 `pathname + search`（页面 key）。
- **只缓存非空结果**（至少包含 UID 或名称）；空结果不写入缓存，下一次读取重新执行 3.1。
- 同一页面 key 下的非空缓存可直接复用；导航到新页面、设置更新、页面可见性恢复导致状态重置时清空缓存。
- 接口回退按页面 key + BV 号去重：同一页面同一 BV 最多请求一次。

### 3.3 返回结构

- 成功：`{ uid: string | null; name: string | null; profileUrl: string | null }`。
- 无结果：`null`，并区分原因（供 popup 提示）：
  - `unsupported-page`：当前页面不是支持的 B 站视频页；
  - `not-ready`：是视频页，但等待窗口与接口回退都未拿到 UP 主信息。

## 4. 内容脚本消息边界

- `VB_BB_SUBTITLE_CURRENT_UPLOADER` 的响应满足：
  - **只有顶层 frame 响应**：`window.top !== window` 时直接返回、不调用 `sendResponse`。子 frame（例如 `s1.hdslb.com` 的统计/选主 iframe）不得返回 `{ uploader: null }`，否则会与顶层 frame 竞争并让 popup 拿到空结果。
  - 响应体为 `{ uploader: BilibiliUploaderProfile | null, reason?: 'unsupported-page' | 'not-ready' }`；`uploader` 字段语义不变，旧调用方可继续只读该字段。
  - 顶层 frame 允许在识别等待/接口回退期间异步响应（Chrome 返回 `true` 保持消息通道，Firefox 使用 Promise）；单次识别最长 2s 内必定响应。
- Chrome（`src/content/index.ts`）与 Firefox（`src/content/index.firefox.ts`）两个入口实现同一语义。

## 5. popup「加入当前视频UP」（`src/popup/App.svelte`）

- 点击后保持现有「添加中...」禁用态，向当前活动标签页发送 `VB_BB_SUBTITLE_CURRENT_UPLOADER`。
- 自动重试：消息失败、无响应或 `uploader` 为空且 `reason === 'not-ready'` 时，最多发起 3 次调用，间隔 300ms / 600ms；重试期间按钮保持禁用与「添加中...」。以下任一条件成立时立即停止重试并返回 `not-ready`：本次调用耗时 ≥1000ms（说明内容脚本已用满单次识别预算），或从点击起累计耗时 ≥3000ms。正常已加载的视频页应在一次调用内返回。
- 成功后沿用现有写入与去重逻辑：目标值为 `UID | 昵称`（昵称与 UID 相同或为空时不加备注），已在列表中提示「已在列表中」。
- 失败提示区分原因（en / zh-CN 两套文案）：
  - `unsupported-page` 或标签页不是 B 站视频页 → 「当前页面不是 B 站视频页」；
  - `not-ready` 或全部重试后仍为空 → 「暂时没拿到 UP 主信息，请稍后重试」。
- 不新增设置字段；不改变保存链路（`scheduleSettingsSave` / `flushSettingsSave`）。

## 6. 自动开启流程（`src/features/BilibiliAutoSubtitle.ts`）

### 6.1 生命周期

- 仅 B 站宿主挂载；`mount()` 后按 `INITIAL_DELAY_MS = 1200ms` 首次尝试。
- 设置更新：重置页面状态并立即（0ms）重新尝试；功能关闭时清理定时器。
- 导航检测：
  - `popstate` 事件；
  - `<title>` 的 MutationObserver（保留现有兜底）；
  - **URL 轮询**：启用期间以 1000ms 间隔比较 `location.href`，变化即视为站内导航，重置页面状态并延迟 `NAVIGATION_DELAY_MS = 1800ms` 后尝试；
  - `visibilitychange` 回到可见时补一次 350ms 后的尝试。
- 同一页面 key 已成功处理时不再重复尝试。

### 6.2 白名单过滤

- `targetMode !== 'allowlist'` 时直接通过。
- 白名单模式下先取当前页面 UP 主识别结果（3.1，含等待）：
  - 识别到 UP 主：命中列表即通过；未命中即停止该页面的处理（直到下次导航/可见性恢复/设置变化）。
  - **未识别到 UP 主：不停止**，按 1000ms 间隔继续重试，最长 20s；期间页面导航则按新页面重新开始。
- 过滤结果只对当前页面 key 有效；识别到的非空结果可复用缓存。

### 6.3 字幕项选择与生效校验

- 播放器未渲染（`#bilibili-player`、`.bpx-player-container`、`.bilibili-player`、`video` 均不存在）或字幕语言项（`.bpx-player-ctrl-subtitle-language-item`）为空时，按 600ms 间隔重试，最多 18 次。
- 已有激活项且为中文 → 完成，不点击。
- 优先级（与现状一致）：`ai-zh`（AI 中文）→ `zh-Hans` → `zh-CN` → 其它 `zh*` → 文本包含 `ai字幕` / `中文字幕` / `中文` / `简体` / `繁体` / `chinese` 等标记的项。
- 点击后**校验生效**：在 1200ms 内以 200ms 间隔检查目标项进入激活态（`bpx-state-active` / `active` / `aria-checked="true"` / `data-state="active"`）或存在任意中文激活项；生效才把该页面 key 标记为已完成，未生效按 600ms 间隔继续重试（计入同一重试预算）。
- 已激活的中文字幕不会因自动流程被关闭或重复点击。

## 7. 提示文案（`src/lib/i18n.ts`）

- 保留现有键：`bb_subtitle_add_current`、`bb_subtitle_add_current_loading`、`bb_subtitle_add_current_added`、`bb_subtitle_add_current_exists`、`bb_subtitle_add_current_failed`。
- 新增键（en / zh-CN）：
  - `bb_subtitle_add_current_not_video`：「当前页面不是 B 站视频页」；
  - `bb_subtitle_add_current_not_ready`：「暂时没拿到 UP 主信息，请稍后重试」。
- `bb_subtitle_add_current_failed` 保留作为兜底文案。

## 8. 平台与打包约束

- 不新增 manifest 权限、host 授权、依赖或页面脚本（MAIN world）模块。
- Chrome 与 Firefox 均使用同一套识别与重试语义；Firefox 的特性模块懒加载机制保持现状。
- 单元测试使用 vitest + jsdom，不依赖真实网络：接口回退通过注入 fetch 桩验证。
