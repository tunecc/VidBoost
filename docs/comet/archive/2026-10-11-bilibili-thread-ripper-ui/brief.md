# 目标

把 popup 面板中 B 站「线程撕裂者 / 屏蔽 P2P」的设置区从现在的自定义边框卡片（`ThreadRipperSettings.svelte`）改为与其他功能一致的统一 UI 主题：像「CDN 切换」「指定画质」一样使用 `AccordionItem`——标题行 + 一行简介 + 左侧图标 + 倒三角展开箭头 + 右侧主开关；「屏蔽 P2P」作为展开区内的子选项收纳进倒三角下方的折叠区域（默认隐藏，点击倒三角后出现），样式对齐「CDN 切换」展开区里「番剧增强模式」的整行开关模式。

同时按现有功能条目的文字风格，把「B 站线程撕裂者（多 CDN 并发分片加速）」与「屏蔽 P2P」补充进 README 的功能说明。

# 范围

## 目录结构

### 新建

（无——本 change 只调整现有文件，不新建模块。）

### 修改

- `src/popup/App.svelte`：移除 `ThreadRipperSettings` 引用，在 B 站区块内联一个 `AccordionItem`（与「CDN 切换」相同模式）：主开关绑定 `bbThreadRipper.enabled`，新增 `bbThreadRipperOpen` 展开状态（本地状态，不持久化，与 `bbCdnOpen` 等一致）；展开区含「加速地区」行、「屏蔽 P2P」整行开关、互斥提示行；复用现有 `handleBilibiliThreadRipperToggle` / `handleBilibiliThreadRipperRegion` / `handleBilibiliNoP2pToggle` 三个 handler，互斥逻辑不变。
- `src/lib/i18n.ts`：en / zh-CN 两侧微调线程撕裂者相关文案——`bb_thread_ripper_desc` 收敛为一行式简介（完整细节转入 README）；`bb_no_p2p_desc` 去掉与互斥提示重复的「与 CDN 切换互斥」半句；其余 key（标题、地区、互斥提示）沿用。
- `README.md`：「Bilibili 专属增强」下按现有条目风格新增「线程撕裂者与屏蔽 P2P」说明（编号顺延，含参考来源、功能说明与支持列表，模仿「CDN 切换与测速」等条目的写法）。
- `README.en.md`：同步新增对应英文条目。

### 删除

- `src/popup/ThreadRipperSettings.svelte`（其职责完全并入 App.svelte）。

### 明确不建

- 不新建组件文件、不新建设置 key、不新增 manifest 权限或 Firefox 专属内容模块。

# 非目标

- 不改变线程撕裂者 / 屏蔽 P2P / CDN 切换的功能行为：加速引擎、地区调度、PCDN 改写、回退逻辑、与 CDN 的互斥规则全部保持现状。
- 不改动设置数据模型（`bb_thread_ripper` / `bb_no_p2p` 的 key、字段、默认值）与保存链路。
- 不改动 B 站区块内其他条目（字幕、画质、空格翻页、CDN 切换）的 UI。
- 不新增 manifest 权限、host 授权或运行时依赖；不涉及 Firefox 专属内容模块。
- 不更新 CHANGELOG（按仓库惯例由 release 提交统一处理）。

# 验收示例

- `A1` B 站区块中「线程撕裂者」以 `AccordionItem` 呈现：标题「B 站线程撕裂者」+ 一行简介 + 左侧图标（总开关或功能关闭时置灰）+ 右侧主开关（开启时青色发光，与「CDN 切换」一致）+ 倒三角箭头；点击标题/箭头行展开收起内容（slide 动效）；不再出现旧的独立圆角边框卡片样式。
- `A2` 展开区默认隐藏，点开倒三角后可见三部分：「加速地区」下拉（auto / 大陆 / 海外，线程撕裂者主开关关闭时禁用）、「屏蔽 P2P」整行开关（标题 + 描述 + 小开关，样式对齐「番剧增强模式」行）、与 CDN 切换互斥的提示行；en / zh-CN 文案齐全。
- `A3` 互斥与组合关系保持现状：开启线程撕裂者自动关闭 CDN 切换；开启 CDN 切换自动关闭线程撕裂者与屏蔽 P2P；线程撕裂者与屏蔽 P2P 可同时开启。
- `A4` 「屏蔽 P2P」开关只受扩展总开关禁用约束，独立于线程撕裂者主开关（主开关关闭时仍可单独开启）；开启时自动关闭 CDN 切换；设置经现有防抖保存流程写入 `bb_thread_ripper` / `bb_no_p2p`，重新打开 popup 回显正确。
- `A5` `README.md` 在「Bilibili 专属增强」下新增编号顺延的「线程撕裂者与屏蔽 P2P」条目，含参考来源、功能说明与支持列表，风格与「CDN 切换与测速」等条目一致；`README.en.md` 同步新增对应英文条目；两份 README 均不出现与实现不符的描述。
- `A6` `npm run check` 通过；`npm run build:chrome` 成功；因未改 manifest / 权限且无新 Firefox 模块，不要求 Firefox 低内存验证。

# 约束与不变量

- 仅 UI 结构与文案调整：所有设置 key、字段、默认值、防抖保存（`scheduleSettingsSave` / `flushSettingsSave`）、载入回显逻辑不变。
- 互斥不变量：`bb_thread_ripper.enabled` 与 `bb_no_p2p.enabled` 相互独立；任一开启都会把 `bb_cdn.enabled` 关掉；反向开启 CDN 会同时关掉两者（沿用现有 handler 逻辑，不重写）。
- 展开状态 `bbThreadRipperOpen` 为本地 UI 状态，不写入 `ui_state`，与 `bbCdnOpen` / `bbQualityOpen` / `bbSubtitleOpen` 的处理一致。
- 新 UI 必须同时适配浅色 / 深色主题（沿用 Tailwind dark: 变体），图标置灰规则与 `AccordionItem` 现有 `iconMuted` 行为一致。
- README 修改只增不改：不重排现有条目编号，不动安装、预览、支持场景等其他章节。

# 决策

- 采用「内联 AccordionItem」而不是保留独立组件：与「CDN 切换」「指定画质」等条目的既有代码模式一致，删除 `ThreadRipperSettings.svelte` 避免双份样式。
- 图标使用 CPU 芯片线性图标（描边风格与其他条目一致）：「线程撕裂者」本身是 CPU 型号语义，与现有 CDN 云朵、画质列表等图标风格协调。
- 头部简介收敛为一行（`bb_thread_ripper_desc` 改写）：AccordionItem 头部描述为单行截断显示，长文案会截断，完整说明转移至 README；这与 `bb_cdn_desc` 等同级条目的文案长度一致。
- README 中该功能无单独截图（与「屏蔽空格翻页」条目一致，不强行配图）。
- （Q1，用户已确认）「屏蔽 P2P」保持独立可用：展开区内该开关只受扩展总开关禁用约束，线程撕裂者主开关关闭时仍可单独开启——纯视觉收纳，不改变「屏蔽 P2P 可与线程撕裂者同时开启、也可独立使用」的现有功能语义。

# 待解决问题

（无）

# 验证预期

- 静态检查：`npm run check`（svelte-check，含被删除组件引用检查）。
- 打包冒烟：`npm run build:chrome` 成功。
- 人工 / 代码核对：A1–A5 按代码阅读与（如环境可用）popup 截图核对；互斥逻辑 A3 以代码路径核对（现有 handler 未被改动）。
