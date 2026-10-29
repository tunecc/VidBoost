# B 站线程撕裂者与屏蔽 P2P 的 popup 设置界面（完整目标规格）

本规格描述归档后「B 站线程撕裂者 / 屏蔽 P2P」popup 设置能力的完整行为：设置数据模型、popup 设置界面结构、互斥规则、文案与保存链路，以及 README 功能说明。页面端加速引擎（多 CDN 并发分片下载、地区调度、PCDN 地址改写、失败回退）属于页面端实现，不在本规格展开；本规格只约束 popup 可见的设置行为与文档呈现。

## 1. 设置数据模型（不变，本能力消费）

- `src/lib/settings.ts` 顶层 key `bb_thread_ripper`＝ `{ enabled: boolean, region: 'auto' | 'mainland' | 'overseas' }`，默认 `{ enabled: false, region: 'auto' }`。
- 顶层 key `bb_no_p2p`＝ `{ enabled: boolean }`，默认 `{ enabled: false }`。
- `BILIBILI_THREAD_RIPPER_REGIONS` 为合法地区枚举；非法 region 归一化为 `'auto'`。
- 两个开关相互独立，可同时开启；不因本能力新增字段或消息通道。

## 2. popup 设置界面（`src/popup/App.svelte`）

- B 站区块（SectionCard）中，「线程撕裂者」以与其他功能一致的 `AccordionItem` 呈现（`density="main"`、`iconColor="cyan"`、CPU 芯片描边图标）：
  - 标题行：`bb_thread_ripper_title`（zh「B 站线程撕裂者」/ en "Bilibili Thread Ripper"）+ 一行式简介 `bb_thread_ripper_desc`（单行截断显示）；
  - 右侧主开关绑定 `bb_thread_ripper.enabled`（开启时青色发光，与「CDN 切换」主开关一致），点击不展开/收起；
  - 倒三角箭头随展开状态旋转，点击标题/箭头行切换本地展开状态 `bbThreadRipperOpen`（默认收起；不写入 `ui_state`）；
  - 总开关或功能关闭时图标置灰（沿用 `AccordionItem` 的 `iconMuted` 规则）；
  - 不再保留旧的独立圆角边框卡片样式（`ThreadRipperSettings.svelte` 已删除）。
- 展开区内容（默认隐藏，slide 动效展开）自上而下三部分：
  1. 「加速地区」行（`bb_thread_ripper_region_title`）：右侧下拉，选项 `bb_thread_ripper_region_auto` / `bb_thread_ripper_region_mainland` / `bb_thread_ripper_region_overseas` 三档；线程撕裂者主开关或总开关关闭时禁用；
  2. 「屏蔽 P2P」整行开关（样式对齐「CDN 切换」展开区「番剧增强模式」行）：左侧标题 `bb_no_p2p_title` + 描述 `bb_no_p2p_desc`，右侧小开关绑定 `bb_no_p2p.enabled`；只受扩展总开关禁用约束，独立于线程撕裂者主开关（主开关关闭时仍可单独开启）；
  3. 互斥提示行：`bb_thread_ripper_exclusive_hint` 小字提示。
- 文案（`src/lib/i18n.ts`）en / zh-CN 两套齐全；`bb_thread_ripper_desc` 为一行式简介（完整细节在 README），`bb_no_p2p_desc` 不再重复互斥提示已有的半句。

## 3. 互斥规则（不变，popup 内维持）

- 开启线程撕裂者 → 自动关闭 CDN 切换（`bb_cdn.enabled = false`）。
- 开启屏蔽 P2P → 自动关闭 CDN 切换。
- 开启 CDN 切换 → 自动关闭线程撕裂者与屏蔽 P2P。
- 线程撕裂者与屏蔽 P2P 可同时开启。
- 上述互斥均沿用现有 handler（`handleBilibiliThreadRipperToggle` / `handleBilibiliNoP2pToggle` / CDN 主开关回调），不重写逻辑。

## 4. 保存与回显（不变）

- 所有变更经 popup 现有防抖保存流程（`scheduleSettingsSave` / `flushSettingsSave`）写入 `bb_thread_ripper` / `bb_no_p2p`。
- 载入时回显 `res.bb_thread_ripper`（enabled / region，region 非法回退 `'auto'`）与 `res.bb_no_p2p.enabled`；重新打开 popup 回显正确。

## 5. README 功能说明

- `README.md`（简体中文）在「Bilibili 专属增强」章节下新增编号顺延条目（「CDN 切换与测速」之后），说明线程撕裂者与屏蔽 P2P：参考来源、功能说明、支持/用法列表，风格与现有条目（如「CDN 切换与测速」）一致；该条目无单独截图。
- `README.en.md` 同步新增对应英文条目。
- 两份 README 均不出现与实现不符的描述；不重排现有条目、不改其他章节。

## 6. 平台与打包约束

- 不新增 manifest 权限、host 授权或运行时依赖；不新增 Firefox 专属内容模块；Chrome 与 Firefox 构建均不因本能力产生新的平台分支。
