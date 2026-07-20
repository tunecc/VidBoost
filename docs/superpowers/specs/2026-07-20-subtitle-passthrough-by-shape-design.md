# 字幕按形态透传（路径 1）设计

**日期：** 2026-07-20  
**状态：** 已讨论确认，待实现计划  
**范围：** YouTube 自渲染字幕的后处理路由（不改选轨、不改渲染 UI、不重写 refine 内部公式）

---

## 1. 问题

作者上传的中文字幕（常无标点，但按语速切好）被当前后处理当成「质量差」：

1. 生产路径 `YouTubeSubtitleOverlay.fetchTrackFragments` 对非 ASR 走 `optimizeSubtitles`。
2. `optimizeSubtitles` 在 CJK + 标点差时安全网降级到 `refineAsrFragments`。
3. `refineAsrFragments` 按 gap≤300ms / ≤32 字 / ≤7s 相邻强合并。

结果：成品短语被粘成更长句，条数下降、语义边界糊掉——**负优化**。

根因不是「中文缺规则」，而是 **把「已切好的成品轨」误判成「待修的碎片轨」**。

---

## 2. 目标与非目标

### 目标

- **成品短语字幕原样播**（含无标点中文作者轨、已是短语级的自动轨）。
- **只有碎得没法看的字幕才强合并**（词级 / 极短闪现等）。
- **有没有句号不当中文主开关**。
- **作者轨与 `kind=asr` 自动轨用同一套形态判断**（方案 B）。
- 用真实样本回归：类似「无标点、平均约 12 字、时间正常」的作者中文 **条数与时间轴基本不变**。

### 非目标（本迭代不做）

- 三档「轻整理」中间态（路径 3）。
- LLM 断句。
- 重写 `refineAsrFragments` 合并阈值（除非透传后仍有个案再开）。
- 改选轨、字体、overlay 样式、POT 拉取。

---

## 3. 决策摘要

| 项 | 选择 |
|----|------|
| 实现厚度 | **路径 1**：两态——透传 / 强合并 |
| 自动轨 | **也看形态**（B），不 `kind=asr` 无脑 refine |
| 标点 | **不作为中文「必须合并」的主判据** |
| 默认态度 | **拿不准就当成品（透传）**，避免再负功 |
| 中间态 optimize | 第一期不对「成品轨」调用；碎轨走 refine |

---

## 4. 路由设计

### 4.1 生产数据流

```
timedtext json3
  → parseYouTubeSubtitleEvents
  → 形态判断 isFragmented / shouldResegment
       ├─ false（成品）→ lightClean → 显示
       └─ true（太碎） → refineAsrFragments → 显示
```

替换现有：

```
kind === 'asr' ? refineAsrFragments : optimizeSubtitles
```

### 4.2 形态判断原则

同一函数服务作者轨与 ASR 轨，输入为 `fragments[]` + `language`，**不依赖** `kind` 才能判「成品」。

`kind` 仅可作弱信号（可选），**不得**单独强制 refine 或强制透传。

「太碎（应 resegment）」需同时偏「输入像词级/半截」，而不是「无标点」：

| 信号方向 | 倾向成品（透传） | 倾向太碎（refine） |
|----------|------------------|-------------------|
| 平均长度（CJK 字符 / 非 CJK 词） | 常见短语区（约 8–25 字量级） | 大量极短（词级） |
| 短 cue 占比 | 低 | 高 |
| 单条时长 | 约 1–4s 可读 | 大量极短闪现（如 ≪ 0.5s） |
| 标点比例 | **不单独否决成品** | 仅辅助，不可单独触发 refine |

具体阈值在实现计划中落成常量，并以测试钉死；调参时优先保证：

1. **无标点、avg≈12 字的作者中文 → 透传**
2. **一词/一字级 ASR → refine**

### 4.3 与现有 `subtitle-style.ts` 的关系

已有 `detectSubtitleStyle` / `shouldUseAsrRefine`，但：

- 生产 overlay **未接线**；
- 当前逻辑用「标点差 + 短 cue / 低均长」判 `asr-like`，会把「无标点但切好的中文」打成 asr-like。

本设计要求：

- **改写**该模块的判定语义为「是否需要 resegment（太碎）」，而不是「有没有标点的 polished」。
- 导出清晰 API（名称可在实现时微调，语义必须稳定），例如：
  - `needsResegment(fragments, language): boolean`  
    或保留 `shouldUseAsrRefine` 但改语义与测试：  
    `true` = 走 refine；`false` = 透传。
- **删除或旁路**「仅因 CJK + 标点差就 refine」对成品轨的路径（含 `optimizeSubtitles` 入口安全网对**已被判为成品**的内容不应再降级粘连；实现上成品轨根本不进 optimize/refine）。

### 4.4 透传时的 lightClean

允许：

- 去首尾空白
- 去掉 YouTube `>>` 类标记（与现有 clean 一致）
- 过滤纯噪声标签（若解析层已做可不再重复）

禁止：

- 跨 cue 文本合并
- 改 start/end（除噪声丢弃整条外）
- 按长度 rebalance

### 4.5 `optimizeSubtitles`

第一期生产路径 **不再**作为默认人工轨处理。

- 碎轨：`refineAsrFragments`
- 成品轨：lightClean / identity

`optimizeSubtitles` 可保留供测试与将来中间态；不在本迭代删除文件。

### 4.6 `SubtitleController`

若仍被测试或非生产路径使用，路由与 overlay **一致**（同一 `needsResegment` / 同一 refine-or-passthrough），避免两套行为。

---

## 5. 验收标准

### 5.1 金标准：成品无标点中文

以用户提供的 `[Chinese (Simplified)] .srt` 一类数据为代表（约 578 条、avg≈12.5 字、标点≈0.5%、gap 中位≈200ms）：

| 检查项 | 期望 |
|--------|------|
| 条数 | ≈ 输入（允许极少噪声过滤，**禁止**因合并明显减少） |
| 文本 | 不跨原始 cue 粘连 |
| 时间 | start/end 保持（清洗不改时轴） |
| 路由 | `needsResegment === false` |

### 5.2 碎轨仍须合并

词级 / 极短中英样例：

| 检查项 | 期望 |
|--------|------|
| 路由 | `needsResegment === true` |
| 输出条数 | 明显少于输入 |
| 可读性 | 不再大量单字/单词闪现 |

### 5.3 有标点整齐中文

→ 透传（或仅 lightClean）。

### 5.4 回归

- 更新 `subtitle-style` 测试：无标点作者中文 ≠ 必须 refine。
- 修正与新原则冲突的旧断言（例如「伪人工无标点一律 refine」若样本实际是短语成品，应改为透传；真词级样本保留 refine）。
- 相关 vitest 通过。

---

## 6. 风险

| 风险 | 缓解 |
|------|------|
| 阈值过松，真碎不合并 | 词级样例单测卡死 |
| 阈值过紧，好中文再被粘 | 成品中文 SRT 样例卡死 |
| controller / overlay 不一致 | 共用同一判断函数 |
| lightClean 误伤 | 规则保持现有最小集 |

---

## 7. 实现触点（供计划拆任务）

1. 改 `src/features/youtube/subtitle/processors/subtitle-style.ts` 判定与命名/注释。
2. 改 `src/features/YouTubeSubtitleOverlay.ts` 的 `fetchTrackFragments` 路由。
3. 对齐 `src/features/youtube/subtitle/core/controller.ts`（若仍路由后处理）。
4. 收紧/移除「成品却进 optimize → CJK 无标点安全网」的生产路径依赖。
5. 更新 `processors/__tests__/subtitle-style.test.ts` 及必要 optimizer/controller 测试。
6. 增加基于「短语级无标点中文」的透传回归（可用精简 fixture，不必提交整份 578 条，但阈值与真实样本一致）。

---

## 8. 成功定义（一句话）

**成品短语字幕（含无标点中文作者轨、短语级自动轨）原样播；只有碎得没法看的才合并。**
