# Bilibili 画质选择（完整目标规格）

本规格描述归档后 Bilibili 画质能力（`bb_quality`）的完整行为：设置数据模型与归一化、popup 设置界面、设置同步、内容脚本生命周期、画质选择链与屏蔽画质列表、播放器设置快照恢复。UP 主识别细节属 `uploaderProfile` 共享模块，B 站 CDN 加速与测速属各自能力，此处不展开。本次 change 在既有能力上新增「屏蔽画质列表」，其余行为保持不变。

## 1. 设置数据模型

- `BilibiliQualityConfig`（`src/lib/settings.ts`）＝ `{ enabled, targets, targetQn, defaultQn, blockedQns }`：
  - `enabled: boolean`，功能总开关，默认 `false`；
  - `targets: string[]`，UP 主名单（UID / 空间链接 / 昵称，允许 `|` 后备注）；
  - `targetQn: string`，名单内视频的目标画质，默认 `'80'`；
  - `defaultQn: string`，其余视频的默认画质，默认 `'64'`；
  - `blockedQns: string[]`（本次新增），被屏蔽的画质档位（B 站 qn 字符串，如 `['112']` 表示屏蔽 1080P 高码率），默认 `[]`（不屏蔽）。
- `resolveSettings` 归一化：`targetQn` / `defaultQn` 仍经 `normalizeBilibiliQualityValue` 校验（非法值回退默认）；`blockedQns` 必须是字符串数组，逐项保留属于 `BILIBILI_QUALITY_OPTIONS` 的合法 qn 并去重，非法项丢弃，缺失或非法时回退 `[]`。顺序无语义，行为不得依赖顺序。
- 存储：沿用顶层 key `bb_quality`（`browser.storage.local`，每设置一个 key），不新增消息通道；内容脚本经 `onSettingsChanged`（`storage.onChanged` 包装）感知变更并 `updateSettings`。

## 2. popup 设置界面（`src/popup/App.svelte`）

- 「指定画质」AccordionItem 内，在现有「默认画质」「目标画质」两个下拉之后新增「屏蔽画质」区块（多选勾选列表，本次新增）：
  - 选项来自 `BILIBILI_QUALITY_OPTIONS`（按 8K → 360P 顺序平铺，与下拉一致）；
  - 每档一个可勾选项，勾选＝屏蔽该档，全部未勾选＝不屏蔽（默认）；
  - 功能关闭（总开关或 `bb_quality` 主开关关闭）时与现有控件一起禁用；
  - 勾选状态即时进入 popup 现有防抖保存流程（`scheduleSettingsSave` / `flushSettingsSave`），保存 payload 的 `bb_quality` 增加 `blockedQns: string[]`；
  - 载入设置时回显 `res.bb_quality.blockedQns`（缺失时回退 `[]`），重新打开 popup 回显正确。
- 文案：`src/lib/i18n.ts` 新增屏蔽区块标题与说明（en / zh-CN 两套），中文出现「屏蔽」与档位语义（如「屏蔽画质」），英文如 "Blocked qualities"；说明文案解释被屏蔽档位不会自动选中、画质不足时向下取最近可用档。

## 3. 内容脚本选择链（`src/features/BilibiliAutoQuality.ts`）

- 生命周期不变：仅 B 站宿主挂载；初始延迟 1400ms 应用，`popstate` / `<title>` MutationObserver 感知 SPA 导航（延迟 1800ms），`visibilitychange` 回前台补一次（350ms）；按页面 key 去重；菜单未渲染时以 600ms 间隔最多重试 18 次。
- 画质计划 `resolveQualityPlan`：命中 UP 名单 → `desired = targetQn`、`fallback = defaultQn`；未命中 → `desired = defaultQn`、`fallback = null`。
- 候选收集：从画质菜单 DOM 收集菜单项（`data-value` / `data-qn` / 文本别名解析 qn），得到当前可用档位 `availableQnValues`；播放器容器未渲染或无菜单项时重试。
- **屏蔽过滤（本次新增核心）**：在进入选择链前，把 `blockedQns` 中的档位从 `availableQnValues` 剔除；若剔除后为空（全部可用档均被屏蔽），则忽略屏蔽、按未过滤的可用档继续——宁可选中被屏蔽档，也不放弃对画质的管理。
- 三级选择链（作用在过滤后的候选上，语义与现状一致）：`desired` → `fallback` → 最佳可用，每级经 `pickBilibiliQualityAtOrBelow`：命中期望档用期望档；否则取不高于期望档的最近可用档；全部可用档都高于期望档时取最佳可用档。
- 选中档与当前激活档相同则不点击；不同则点击对应菜单项。点击前后沿用 `bilibili_player_settings` localStorage 快照 / 恢复机制（延时 120 / 480 / 1200ms 恢复），防止 B 站「记忆画质」污染后续默认。
- 屏蔽列表只约束扩展的自动选择；不监听、不回退用户播放中途手动切换的画质（与现状一致，仅加载 / 导航 / 回前台时应用）。

## 4. 共享画质工具（`src/lib/bilibiliQuality.ts`）

- `BILIBILI_QUALITY_ORDER`、`BILIBILI_QUALITY_OPTIONS`、`normalizeBilibiliQualityValue`、`getBilibiliQualityLabel`、`getBilibiliQualityAliases`、`getBilibiliQualityRank`、`pickBilibiliQualityAtOrBelow` 的既有语义不变。
- 新增屏蔽过滤辅助函数（如 `filterBilibiliBlockedQualities(values, blockedValues)`）：输入可用档位与被屏蔽档位，返回剔除被屏蔽项（并按既有规则去重、过滤未知 qn）后的列表；被屏蔽列表为空时原样返回；剔除后为空时返回未过滤输入（第 3 节的不变量在该函数内兜底）。popup 与内容脚本共用同一实现，不出现第二份过滤逻辑。

## 5. 平台与打包约束

- 不新增 manifest 权限、host 授权或运行时依赖；不新增 Firefox 专属内容模块（复用现有 `firefox-feature-bilibili-auto-quality` 模块与设置链路，`blockedQns` 随设置自然生效）。
- Chrome 与 Firefox 构建均不因本 change 产生新的平台分支。
