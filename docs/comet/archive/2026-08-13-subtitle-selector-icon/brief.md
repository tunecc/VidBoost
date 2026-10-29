# Outcome

将 YouTube 字幕选择器按钮的图标从 "CC" 文本替换为 VidBoost 插件主图标（48px 缩放至 24px 显示），并让图标跟随字幕激活状态变化（激活时彩色/正常显示，未激活时灰色/半透明）。

# Scope

- 修改 `src/features/youtube/subtitle/selector/SubtitleSelector.ts` 中的按钮图标创建逻辑
- 扩展 `ensureMounted` 使图标能跟随字幕激活状态切换
- 使用 `getRuntimeUrl` 加载 `icons/icon48.png` 作为图标源
- 图标展示尺寸 24×24px

# Non-goals

- 不修改其他按钮（拖拽手柄、原生 CC 按钮等）
- 不修改弹出菜单样式或布局
- 不修改插件的其他图标
- 不修改 SubtitleSelector 的构造函数或公共 API 签名

# Acceptance examples

- A1: 在 YouTube 视频页面，字幕选择器按钮显示 VidBoost 图标而非 "CC" 文本
- A2: 图标展示尺寸为 24×24px，显示清晰
- A3: 有字幕轨道激活时，图标彩色正常显示（不透明度 1.0，无滤镜）
- A4: 无字幕轨道激活时，图标以灰/半透明状态显示（灰度 + 降低不透明度）
- A5: 点击按钮仍能正常打开字幕选择菜单
- A6: 菜单功能不受影响（搜索、选择语言、关闭等行为不变）

# Constraints and invariants

- 图标 URL 必须通过 `getRuntimeUrl`（内部 `chrome.runtime.getURL` / `browser.runtime.getURL`）解析，保证扩展上下文路径正确
- 保留 `aria-label` 与 `title` 可访问性属性；图标元素本身 `aria-hidden="true"`
- 按钮宽度 48px、高度 100%、居中排布等样式保持现状
- 不破坏 `SubtitleSelector` 现有 API（`update` / `ensureMounted` / `close` / `detach` / `destroy`）
- 静默失败：若图标 URL 解析失败，回退为原有的 "CC" 文本，不影响功能

# Decisions

- D1: 使用 icon48.png 缩放至 24×24px 显示（清晰度优于 icon16.png；源图不变，仅 CSS 控制展示尺寸）
- D2: 图标跟随字幕激活状态变化 —— 有激活轨道彩色正常显示，无激活轨道灰度半透明（与 YouTube 原生 CC 按钮行为一致）
- D3: 完全移除 "CC" 文本，仅显示图标
- D4: 使用 `<img>` 元素实现图标，避免引入外部 SVG 依赖

# Open questions

（无未解决问题）

# Verification expectations

- `npm run check`（svelte-check / TypeScript）通过，无类型错误
- 功能验收：在 YouTube 视频页手动加载扩展，确认图标显示与状态切换符合 A1-A6