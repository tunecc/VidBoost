# 目标

## 背景：两个用户可见问题

1. **原生字幕已出现但 VidBoost 不接管渲染**：YouTube 原生字幕（CC 开启或自动字幕）已在播放器里显示，VidBoost 自渲染字幕却迟迟不出现，原生字幕持续可见。
2. **面板切换语言后字幕迟迟不出现**：在 VidBoost 字幕选择面板里选择另一种语言后，新语言字幕要等很久才渲染出来。

## 代码调查结论（根因）

接管链路（`src/features/YouTubeSubtitleOverlay.ts`）：

- 接管触发只依赖两个弱信号：`.ytp-subtitles-button` 的 `aria-pressed` MutationObserver，以及 1200ms 一次的 `TRACK_POLL` 轮询（`pollTrackChange`）。原生字幕真正渲染（`.ytp-caption-window-container` 出现内容）没有任何观察者。
- `pollTrackChange` 在 `loadAbortController` 活跃时**整体跳过**；`fetchTimedTextEvents` 的 `fetch` 没有超时——一次挂起的请求会冻结全部检测。
- 无字幕缓存 `subtitleUnavailableVideoId` 一旦命中，在同一次 SPA 会话内**永久**提前返回（sync 与 poll 都短路）；ASR/字幕轨道延迟出现（直播、新视频）时永不接管。
- 失败路径：连续 3 次（`FALLBACK_NOTICE_FAILURE_THRESHOLD`）后 `fallbackToNative`，之后靠 1.2s 轮询重启加载，无退避也无即时触发。

语言切换链路（面板 `handleSubtitleLanguageSelection`）：

- 串行执行：可能先 `enableNativeToggleIfPaused`（bridge 点击 CC）→ `loadSubtitlesForCurrentPage(undefined, 'user-selection')` **重新请求 playerData**（无复用，bridge 单次超时 6s、重试 6×250ms）→ 重建目录 → **重新下载 timedtext**（无片段缓存；403/pot 缺失时还有 ensure 重试链）→ 解析 + 后处理 → 首次渲染。
- `core/cache.ts` 的 `SubtitleCache` / `core/fetcher.ts` 已存在但**未接入** overlay 主路径。
- 页面脚本（`subtitleOverlay.page.ts`）已 hook XHR 捕获 timedtext URL（`timedtextUrlCache`，含 pot），但**丢弃了响应体**。

## 外部调研（参考技巧，不作为需求来源）

- [CoinkWang/Y2BDoubleSubs](https://github.com/CoinkWang/Y2BDoubleSubs)：hook XHR 拦截原生 timedtext 请求——原生字幕显示时 YouTube 已自行请求过，响应体免费可得且带有效 pot。
- [Plyr 的 YouTube 集成](https://github.com/sampotts/plyr/issues/1090)：`player.setOption('captions','track',{...})` 可让播放器原生切换轨道（本轮评估后不采用，见非目标）。
- 双语字幕油猴脚本（[greasyfork YouTube 双语字幕](https://greasyfork.org/zh-CN/scripts/464879-youtube-dual-subtitle)）与主流双语扩展（Language Reactor / Trancy / 沉浸式翻译）均以「捕获原生请求 + 自渲染 overlay」为基座，并用 caption 窗口 DOM 观察做即时接管。

## 本轮方案

1. **即时接管**：页面脚本同时 hook XHR + fetch，按 `videoId + trackKey` 缓存 timedtext **响应体**；overlay 端以 `.ytp-caption-window-container` 实际渲染出文本作为「原生字幕出现」的 ground truth（MutationObserver + 防抖），满足接管条件（功能开启、无插件让位、原生窗口可见且 VidBoost 未接管）时立即用捕获的响应体解析渲染并隐藏原生窗口，不等轮询。
2. **卡死自愈**：无字幕缓存命中的视频上观察到原生窗口渲染文本时，自动失效该缓存并重新加载接管；timedtext fetch 与 bridge 请求增加超时（≤10s），超时按失败计数处理，不再冻结轮询。
3. **切换提速**：同视频内复用最近一次 playerData（不再重复 bridge 请求）；`optionKey → fragments` 内存缓存（TTL 5 分钟，换视频失效）；目录就绪后预取 preferred 轨道片段（与当前渲染轨道不同且未缓存时）；user-selection 加载期间保留旧语言字幕持续渲染（现状行为保持）。
4. **失败提示可诊断**（第二轮需求补充）：面板切换语言失败的 OSD 错误弹窗显示具体失败原因，并把停留时长提升到至少 2 秒。现状：OSD `show()` 硬编码 800ms；`handleSubtitleLoadFailure` 只显示语言名，不透出失败原因。实现：`OSD.show(text, referenceVideo?, durationMs?)` 增加可选时长参数（默认 800ms，其他功能调用点行为不变）；字幕失败的两处 OSD（保留当前字幕提示、回退原生提示）传 2000ms，并把加载失败的 error 映射为本地化原因（403 拒绝 / 请求超时 / HTTP 网络错误 / 播放器数据不可读 / 无可用字幕轨道 / 字幕数据为空 / 未知错误）。

# 范围

## 目录结构

### 修改

- `src/features/YouTubeSubtitleOverlay.ts` — 原生字幕窗口观察器与即时接管、无字幕缓存自愈、playerData 复用、片段缓存、preferred 预取、fetch/bridge 超时；失败原因映射与 2s OSD 时长。
- `src/features/youtube/subtitleOverlay.page.ts` — XHR/fetch 双 hook 的 timedtext 响应体捕获与查询。
- `src/features/youtube/subtitleOverlay.shared.ts` — 捕获数据与查询消息的类型扩展。
- `src/lib/OSD.ts` — `show()` 增加可选 `durationMs` 参数（默认 800ms，其他调用点不变）。
- `src/lib/i18n.ts` — 新增失败原因文案 i18n key（英文与中文两份）。

### 正式材料

- `specs/subtitle-rendering/delta.yaml` — 修订冻结行为：§5.2 无字幕缓存新增「观察到原生字幕渲染时自动失效」例外；新增即时接管、片段缓存、playerData 复用与预取行为。

# 非目标

- 不改插件翻译让位的判定与动作（沉浸式翻译 / Read Frog / Cometix，spec §8）；让位成立时依旧让位，不接管。
- 不改字幕选择面板的 UI、目录构建与排序（`youtube-subtitle-selector` spec 不变）。
- 不改字幕后处理 ASR 精炼与翻译路径（spec §1）。
- 不引入 `player.setOption` 原生切轨改造：它改变原生播放器轨道状态且与隐藏原生字幕机制交互复杂；片段缓存 + playerData 复用已消除主要等待。
- 不改 B 站字幕 / 画质等其他功能。

# 验收示例

- A1：功能开启、无插件让位、跟随原生开关不阻塞时，原生字幕窗口渲染出文本后 ≤500ms 内 VidBoost 隐藏原生字幕并渲染同内容的自渲染字幕（无需等待 1200ms 轮询）。
- A2：接管期间观察器不误触发：原生窗口被隐藏后观察器不再重复触发加载；触发只在「原生可见且 VidBoost 未接管」状态。
- A3：无字幕缓存命中的视频上，原生字幕窗口出现文本时缓存自动失效并触发加载接管（不再永久跳过）。
- A4：timedtext fetch 与 bridge 请求有 ≤10s 超时；超时按失败计数走既有阈值/回退路径，且不再阻塞轮询与观察器。
- A5：再次选择已渲染过的语言（缓存命中）时无新的 timedtext 网络请求，立即渲染（无轮询等待）。
- A6：面板切换语言时复用当前视频最近一次 playerData，不重复发起 player data bridge 请求；新语言 timedtext 返回后立即渲染；加载期间旧语言字幕持续显示。
- A7：目录就绪后预取 preferred 轨道片段（与当前渲染轨道不同且未缓存时，至多一次在途预取）；随后选择该语言命中缓存。
- A8：片段缓存 TTL（5 分钟）过期或换视频后缓存失效，重新请求。
- A9：插件翻译让位（IT / Read Frog / Cometix）判定与动作不变：让位成立时原生窗口出现文本不触发 VidBoost 接管。
- A10：`yt_subtitle.enabled=false`、非观看页、或 `followNativeToggle=true` 且原生 CC 关闭时，观察器不触发接管（行为不变）。
- A11：既有行为保持：失败阈值 3 与 OSD 回退提示、user-selection 失败保留当前字幕、隐藏原生字幕样式 `#vb-yt-subtitle-native-hide` 的添加/移除时机不变。
- A12：`npm run check` 通过；`npm run build:chrome` 与 `npm run build:firefox` 构建成功。
- A13（第二轮）：面板切换语言失败时，左上角 OSD 错误弹窗显示具体失败原因（403 拒绝 / 请求超时 / HTTP 网络错误 / 播放器数据不可读 / 无可用字幕轨道 / 字幕数据为空 / 未知错误），文案随界面语言（中/英 i18n）。
- A14（第二轮）：字幕失败 OSD（保留当前字幕提示与回退原生提示）停留时长 ≥2 秒；`OSD.show` 未传时长的其他调用点保持原有 800ms 行为不变。

# Open questions

无 `[blocking]` 项。关键实现决定已在方案中固定：不采用 setOption 原生切轨（见非目标）；片段缓存 TTL 5 分钟；接管判定阈值 A1 ≤500ms（含防抖）；失败原因按 error 类型映射为 7 类本地化文案（A13），OSD 时长参数默认 800ms 仅字幕失败路径传 2000ms（A14）。
