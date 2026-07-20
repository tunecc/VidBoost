# H5 分层通杀媒体内核（方案 E）设计

**日期：** 2026-07-20  
**状态：** 已批准（brainstorming §1–§4）  
**范围：** VidBoost 通用 h5player 倍速/seek 通杀能力重构  
**参考：** `/Users/tune/Downloads/h5player-master`（思路借鉴，不整段复制 GPL 源码）

---

## 1. 背景与问题

### 1.1 现象

- YouTube / B 站 / 抖音表现正常。
- 其它 H5 视频站少部分可用，大部分不可用。
- 原版 h5player（油猴/扩展 inject）在同类站点可「通杀」。

### 1.2 根因（源码对比结论）

| 能力 | 原版 h5player | VidBoost 现状 |
|------|---------------|---------------|
| 运行世界 | MAIN（`unsafeWindow` / inject.js） | 通用 H5 在 **ISOLATED**；仅抖音/B 站等有专用 MAIN |
| 倍速抗干扰 | `mediaCore` 劫持原型 + lock；`hackDefineProperty`；`ratechange` 防护 | 直接 `video.playbackRate = rate`；仅抖音有 sticky guard |
| Shadow DOM | `hackAttachShadow` 强制 closed→open | 仅扫已 open 的 `shadowRoot` |
| iframe | 油猴默认进子 frame；有 iframe 协调 | manifest **无 `all_frames: true`** |
| 媒体发现 | 代理 play/src 等，创建即用即登记 | MO + play/timeupdate + DOM 扫描（事后） |

「学了 h5player」但通杀弱，主因不是快捷键少，而是缺少 **MAIN 世界的轻量媒体控制面**。

### 1.3 对原版的态度

原版是**参考样本，不是最优标准**：

- 钩子面过宽（volume/currentTime/play/pause 全家桶）。
- 默认 shadow / defineProperty 侵入偏硬。
- 单体巨大，难与 VidBoost Feature 栈 thrash-free 共存。
- GPL 大段搬迁有许可证风险。

本设计只借鉴其问题分解（MAIN + 原型原始写入 + 抗回写 + frame），**自研精简内核**。

---

## 2. 目标与非目标

### 2.1 目标（第一期）

1. 通用 H5 站上，数字键 / C X Z 倍速与快进快退**稳定生效**，不被站点轻易刷回。
2. 覆盖根因：isolated 直写失效/被回写、iframe 内 video、主视频误选/漏选。
3. **YouTube / B 站 / 抖音现有能力零回归**。
4. 用户可关：至少 `安全` / `兼容`；`强兼容` 作为进阶。
5. 思想借鉴原版，不整段复制 GPL 源码。

### 2.2 非目标（第一期）

- 截图、下载、滤镜、进度记忆、画中画。
- 全局劫持 `volume` / `play` / `pause`。
- 默认全站 `hackAttachShadow`、默认全站 `Object.defineProperty` hook。
- 复制原版 TCC 全量与 UI。
- 将 YT / BB / 抖音专用逻辑并入通用内核。

### 2.3 成功标准

| # | 标准 |
|---|------|
| 1 | 当前「大部分不行」的站中，抽检 ≥5 个常见 H5 站：调速后 **≥3s 保持**（或直到用户再改） |
| 2 | iframe 内主视频可被控制（同页存在 video 的 frame） |
| 3 | YT / bilibili / douyin 现有回归路径通过 |
| 4 | `安全` 模式行为 ≈ 当前 isolated 直写 |
| 5 | 无 video 的 frame **不抢快捷键** |

---

## 3. 方案选型

### 3.1 否决与采纳

| 方案 | 结论 |
|------|------|
| A 仅 all_frames + 更好选 video | 不够，治不好回写 |
| B 原样级 MAIN 内核 | 方向对，需现代化与克制 |
| C 深度对齐原版 | 过重，副作用与维护成本过高 |
| D 混合产品策略 | 采纳为产品壳 |
| **E 分层通杀内核** | **采纳**：D 的产品策略 + B 的内核目标 + 比原版更克制的升级机制 |

### 3.2 一句话

> isolated 管产品与输入；MAIN 只做最小、可开关的媒体控制面；默认温和，站点乱回写时再升级锁定。

---

## 4. 架构与模块边界

### 4.1 总览

```
┌──────────────────────────────────────────────────────────┐
│  Isolated content (现有)                                  │
│  InputManager → H5Enhancer → MediaBridge                 │
│  Settings (h5_compat_mode 等)                            │
└───────────────────────────────┬──────────────────────────┘
                                │ CustomEvent / postMessage
                                │ (source + version 防串)
┌───────────────────────────────▼──────────────────────────┐
│  MAIN page kernel (新建，通用)                            │
│  MediaRegistry | RateController | Escalator              │
└──────────────────────────────────────────────────────────┘

专用 MAIN（保持独立）:
  douyin-playback-rate.page.js | bb-cdn.page.js | yt-*.page.js
```

### 4.2 模块职责

| 模块 | 世界 | 职责 | 不做什么 |
|------|------|------|----------|
| H5Enhancer | isolated | 快捷键 → 意图（setRate/seek/fullscreen）；OSD | 不直接 `video.playbackRate =` 作为主路径 |
| MediaBridge | isolated | 与 MAIN 双向消息；超时/无内核时降级 VideoController | 不实现锁定逻辑 |
| VideoController | isolated | 降级路径 + 全屏 DOM 点击；安全模式 | 不再是通杀主路径 |
| MediaRegistry | MAIN | 发现/登记 media；选主视频 | 不处理快捷键 |
| RateController | MAIN | 原始 descriptor 设 rate/seek；短时 sticky | 默认不 hook volume/play |
| Escalator | MAIN | 检测回写 → 强 sticky；为 L3 预留 | 默认关闭硬黑科技 |
| 站点专用脚本 | MAIN | 各管各的深度能力 | 不依赖通用内核内部私有 API |

### 4.3 消息协议

命名空间：`vidboost:media-kernel`（实现时用稳定常量）。

**isolated → MAIN**

| type | payload | 含义 |
|------|---------|------|
| `ping` | `{ reqId }` | 探测内核 |
| `configure` | `{ mode, stickyMs, maxRate, ... }` | 同步模式/参数 |
| `setPlaybackRate` | `{ rate, reqId }` | 设倍速 |
| `seek` | `{ deltaSec, reqId }` | 相对 seek |
| `getState` | `{ reqId }` | 读状态 |

**MAIN → isolated**

| type | payload | 含义 |
|------|---------|------|
| `pong` / `ack` | `{ reqId, ok, ... }` | 回执 |
| `state` | `{ hasVideo, rate, escalated }` | 状态 |
| `kernel-ready` | `{ version }` | 启动通知 |

约束：

- 仅接受 `event.source === window` 且约定 `source` 字段匹配。
- 无 MAIN 或超时（建议约 50ms）→ 自动降级 isolated `VideoController`。

### 4.4 注入与 frame

| 项 | 决策 |
|----|------|
| 通用 MAIN | manifest `content_scripts`，`world: "MAIN"`，`run_at: "document_start"`，`matches: <all_urls>` |
| isolated | 维持现有，并 **`all_frames: true`**（与 MAIN 同步） |
| frame 激活 | 该 frame Registry 无可用 video 时，不处理 H5 快捷键 |
| 排除 | 扩展页 + 可配置黑名单（第一期内置少量已知冲突域） |
| 抖音 | rate 优先现有 guard；通用内核 defer，避免双重强锁 |

### 4.5 兼容模式

| 模式 | Layer1 | Layer2 | 说明 |
|------|--------|--------|------|
| `safe` | 不启用 MAIN 锁与 sticky | 关 | ≈ 今天 isolated 直写；可不依赖内核 |
| `compat`（默认） | 原始 setter + 短时 sticky | 关 | 通杀主路径 |
| `strict` | 开 | 强 sticky（+ 第二期 L3） | 难站；副作用最大 |

**未配置迁移：** → `compat`。

### 4.6 建议文件落点

```
src/features/media-kernel/
  mediaKernel.page.ts
  registry.ts
  rateController.ts
  escalator.ts
  protocol.ts
src/lib/
  MediaBridge.ts
  VideoController.ts          # 降级 + 全屏（职责收缩）
src/features/H5Enhancer.ts    # 改走 Bridge
public/manifest.json          # MAIN 脚本 + all_frames
vite 配置                     # 新增 MAIN 打包入口（与现有 page 脚本一致）
```

---

## 5. 媒体发现、选主、倍速与升级

### 5.1 MediaRegistry

登记来源：

1. capture：`play` / `playing` / `loadedmetadata`
2. `querySelectorAll('video')` + 遍历已 open 的 `shadowRoot`
3. 节流的 `MutationObserver`
4. 可选：`bwp-video`（仅当可映射到 `HTMLMediaElement` / 内部 video）

第一期不做：

- 默认 Proxy 全方法
- 默认 `hackAttachShadow`
- 默认登记全部 `audio`

生命周期：断开连接或长期不可见则移出候选；每 frame 独立 Registry。

### 5.2 pickPrimary

打分因子：可见性、是否播放中、可见面积、近期用户焦点；惩罚极小预览/隐藏缩略。

快捷键：仅 `hasPrimaryVideo === true` 的 frame 处理 H5 键；与浏览器焦点一致。

### 5.3 RateController

1. 使用 `HTMLMediaElement.prototype` 上**原始** `playbackRate` / `defaultPlaybackRate` descriptor 写入。
2. 不单独依赖实例属性赋值（避免站点 redefine）。
3. seek 优先原始 `currentTime` setter。

**compat 短时 sticky 默认参数：**

| 键 | 默认 | 含义 |
|----|------|------|
| `stickyMs` | `3000` | 用户调速后守护窗口 |
| `rateEpsilon` | `0.05` | 偏离阈值 |
| 监听 | `ratechange` + 轻量 reconcile | 窗口内纠正 |
| 窗口结束 | 停止纠正 | 降低长期劫持感 |

用户再次调速：更新目标 rate 并重启窗口。

### 5.4 Escalator 级别

| 级别 | 行为 | 模式 |
|------|------|------|
| L0 | 原始 setter，无守护 | `safe` |
| L1 | 短时 sticky | `compat` |
| L2 | 持续强 sticky 至用户改速/关内核/换片 | `strict` |
| L3 | 实例级 playbackRate 可控 define / 有限反 defineProperty | 第二期；仅 strict |

第一期：实现 L0 + L1 + L2。  
`autoEscalate` 默认 `false`；compat 下可将回写次数暴露为 `escalated` 供后续 UI 提示。

纠正次数封顶，防止死循环。

### 5.5 站点共存

| 站点 | 策略 |
|------|------|
| 抖音 | rate 走现有 `playbackRateGuard`；通用 L2 不抢 |
| B 站 | 通用管倍速/seek；CDN 等继续专用；注意 bwp-video |
| YouTube | 通用管倍速/seek；字幕/CDN/会员等继续专用 |
| 通用规则 | 专用脚本声明拥有 rate 时（如协议位 / dataset），通用 L2 不启用 |

通道：`vidboost:media-kernel` 与抖音 `DOUYIN_PLAYBACK_RATE_GUARD_*` 严格隔离。

### 5.6 降级矩阵

| 情况 | 行为 |
|------|------|
| MAIN 未注入 / ping 失败 | VideoController 直写 |
| 有内核无 primary | 不抢键 |
| setRate 失败 | 降级再试 isolated；仍失败可 OSD |
| `safe` | 不启用锁类 configure |
| 黑名单域 | 不注入或强制 safe |

---

## 6. 设置、错误处理、测试与风险

### 6.1 设置

- 控件：H5 设置区三档（安全 / 兼容推荐 / 强兼容）。
- 键：`h5_compat_mode: 'safe' | 'compat' | 'strict'`。
- 与 `h5_enabled`：关闭则不处理 H5 快捷键、不发 rate 命令。
- 中英文 i18n 需说明副作用差异。

### 6.2 错误与可观测

- 无主视频：快捷键静默。
- 内核超时：静默降级。
- setRate 失败：简洁 OSD。
- debug：扩展 `__VIDBOOST_DEBUG__` / loopback 字段（`mode`、`hasKernel`、`hasPrimary`、`rate`、`escalated`）。

### 6.3 测试

**自动化：** protocol sanitize、pickPrimary 打分、RateController sticky、Bridge 超时降级。

**手动抽检：**

- 零回归：YouTube、B 站、抖音
- 通杀：≥5 个当前失败站，compat 下保持 ≥3s
- iframe：子 frame 可控、父页无 video 不抢键
- 三档模式行为符合 §4.5

完成声明前必须有可核对证据（构建 + 抽检记录），符合 verification-before-completion。

### 6.4 风险与缓解

| 风险 | 缓解 |
|------|------|
| 与其它调速扩展冲突 | 可关模式；通道隔离；纠正封顶 |
| 误控小窗/广告 video | pickPrimary 惩罚；playing+面积优先 |
| all_frames 抢键/性能 | 无 video 不处理；排除列表 |
| 冲抖音 guard | host defer + 独立通道 |
| GPL 污染 | 自研，禁止粘贴原版大段 |
| 难站仍挂（无 L3/shadow） | 文档标明；第二期再开 |
| 发布回滚 | 用户切 safe；hotfix 默认 safe |

### 6.5 实现分期

| 期 | 内容 |
|----|------|
| **P0** | protocol、MAIN 入口、Registry、RateController L0/L1、MediaBridge、H5Enhancer 改道、manifest MAIN + all_frames、设置三档、默认 compat、抖音 defer |
| **P1** | L2 强 sticky（strict）、debug 状态、抽检清单落地 |
| **P2** | auto-escalate、L3、closed shadow、难站 profile |

推荐第一刀交付：**P0 + 必要 P1（strict L2）**。

---

## 7. 设计摘要

VidBoost 使用 **isolated 负责快捷键与产品**，使用 **自研 MAIN 轻量媒体内核** 负责登记、选主、原始 setter 调速；默认 **compat 短时 sticky**，**strict 强守护**；与 YT/BB/抖音专用脚本通道隔离；`safe` 与桥接超时保证可降级。第一期不做下载/滤镜/全局 defineProperty/默认 shadow 破解；不整段复制原版 h5player 源码。

---

## 8. 批准记录

- 2026-07-20：用户确认方案 E，并批准设计 §1–§4。
- 下一阶段：`writing-plans` 产出实现计划后，再进入编码。
