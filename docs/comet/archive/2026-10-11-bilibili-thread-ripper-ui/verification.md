---
generated_from_state_version: 8
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 1
- 验证器尝试次数: 1
- 完成时间: 2026-10-11T11:08:05.908Z
- 摘要: 独立验收通过：线程撕裂者/屏蔽 P2P 已按规格内联为与 CDN 切换同模式的 AccordionItem，旧卡片组件删除干净；展开区三部分齐全、中英文案齐全；三条互斥规则与保存/回显链路逐行核对无改动；两份 README 新条目编号顺延、参考来源与实现相符；Runtime 检查 svelte-check 与 build-chrome 均由 Runtime 实际执行并通过（exitCode 0）。verdict=pass。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | `A1` B 站区块中「线程撕裂者」以 `AccordionItem` 呈现：标题「B 站线程撕裂者」+ 一行简介 + 左侧图标（总开关或功能关闭时置灰）+ 右侧主开关（开启时青色发光，与「CDN 切换」一致）+ 倒三角箭头；点击标题/箭头行展开收起内容（slide 动效）；不再出现旧的独立圆角边框卡片样式。 | App.svelte:3453-3569 将线程撕裂者内联为 AccordionItem（iconColor=cyan、density=main、标题 bb_thread_ripper_title=「B 站线程撕裂者」、一行简介、CPU 芯片描边图标），masterChecked 绑定 bbThreadRipper.enabled；AccordionItem.svelte:46 iconMuted=disabled\|\|!masterChecked 实现总开关或功能关闭时图标置灰，:133-146 开启时主开关为青色 #06b6d4 并带 0 0 10px rgba(6,182,212,0.5) 发光，与同为 iconColor=cyan 的 CDN 切换（App.svelte:3340）走同一组件完全一致；倒三角（M19 9l-7 7-7-7）随 isOpen rotate-180，标题/箭头按钮 on:click={onToggleOpen} 切换展开，内容用 {#if isOpen}+transition:slide；主开关点击 stopPropagation 不展开。ThreadRipperSettings.svelte 已删除且全仓库 grep 无残留引用，旧圆角边框卡片不再存在。 |
| A2 | passed | brief.md | `A2` 展开区默认隐藏，点开倒三角后可见三部分：「加速地区」下拉（auto / 大陆 / 海外，线程撕裂者主开关关闭时禁用）、「屏蔽 P2P」整行开关（标题 + 描述 + 小开关，样式对齐「番剧增强模式」行）、与 CDN 切换互斥的提示行；en / zh-CN 文案齐全。 | bbThreadRipperOpen 默认 false（App.svelte:155）且不写入 ui_state，内容默认隐藏、slide 展开后依次为：①加速地区行（App.svelte:3484-3510，select 三档 auto/mainland/overseas，disabled={!globalEnabled \|\| !bbThreadRipper.enabled} 即主开关关闭时禁用）；②屏蔽 P2P 整行开关（3513-3547，标题+描述+小开关，按钮与开关 class 与「番剧增强模式」行 3414-3448 逐字一致）；③互斥提示行（3550-3567）。i18n.ts en（79-89 行）与 zh-CN（320-330 行）两侧 10 个 bb_thread_ripper_*/bb_no_p2p_* key 全部齐全。 |
| A3 | passed | brief.md | `A3` 互斥与组合关系保持现状：开启线程撕裂者自动关闭 CDN 切换；开启 CDN 切换自动关闭线程撕裂者与屏蔽 P2P；线程撕裂者与屏蔽 P2P 可同时开启。 | 三条互斥路径均保持且未被重写：toggleBilibiliThreadRipper（App.svelte:744-752）开启线程撕裂者时置 bbCdnEnabled=false；toggleBilibiliNoP2p（762-770）开启屏蔽 P2P 时置 bbCdnEnabled=false；CDN 主开关 onToggleMaster（3346-3354）开启 CDN 时同时置 bbThreadRipper.enabled=false 与 bbNoP2p.enabled=false。线程撕裂者与屏蔽 P2P 的 handler 互不触碰对方状态，可同时开启。 |
| A4 | passed | brief.md | `A4` 「屏蔽 P2P」开关只受扩展总开关禁用约束，独立于线程撕裂者主开关（主开关关闭时仍可单独开启）；开启时自动关闭 CDN 切换；设置经现有防抖保存流程写入 `bb_thread_ripper` / `bb_no_p2p`，重新打开 popup 回显正确。 | 屏蔽 P2P 整行仅 disabled={!globalEnabled}（App.svelte:3516），toggleBilibiliNoP2p 仅守卫 globalEnabled（763 行），完全独立于线程撕裂者主开关（受主开关约束的只有地区下拉 3494 行）；开启时自动关闭 CDN（767-769 行）。保存链路未动：App.svelte:1419-1478 响应式块读取 bbThreadRipper/bbNoP2p（1476-1477 行），任一变更触发 scheduleSettingsSave→防抖 flushSettingsSave→setSettings 写入顶层 bb_thread_ripper/bb_no_p2p key；onMount 载入回显（1360-1368 行）恢复 enabled/region（非法 region 经 BILIBILI_THREAD_RIPPER_REGIONS 校验回退 'auto'）与 bbNoP2p.enabled，重新打开 popup 回显正确。 |
| A5 | passed | brief.md | `A5` `README.md` 在「Bilibili 专属增强」下新增编号顺延的「线程撕裂者与屏蔽 P2P」条目，含参考来源、功能说明与支持列表，风格与「CDN 切换与测速」等条目一致；`README.en.md` 同步新增对应英文条目；两份 README 均不出现与实现不符的描述。 | README.md:292-306 在「Bilibili 专属增强」下「CDN 切换与测速」之后新增编号顺延的「#### 4. 线程撕裂者与屏蔽 P2P」，含参考来源（SukkaW/Make-Bilibili-Great-Than-Ever-Before 的 thread-ripper 模块，与 src/features/bilibili/threadRipper/ 各源文件头部移植注释一致）、功能说明与「目前支持」列表，结构与第 3 条 CDN 条目一致且无单独截图；README.en.md:276-290 同步新增「#### 4. Thread Ripper and No P2P」对应英文条目。描述经与实现核对相符：engine.ts 存在分片/attempt/alternative 调度与 fallbackToNative()（对应多 CDN 并发分片、自动调度、失败回退原生加载），noP2pPolicy.ts 将 P2P 主机改写回官方源站或官方代理域名（对应屏蔽 P2P 改写官方 CDN），地区三档与互斥关系同 UI 实现，屏蔽 P2P 可单独开启也可与线程撕裂者同开。现有条目编号与其余章节未改动。 |
| A6 | passed | brief.md | `A6` `npm run check` 通过；`npm run build:chrome` 成功；因未改 manifest / 权限且无新 Firefox 模块，不要求 Firefox 低内存验证。 | Runtime 检查记录（evidence=runtime）两项均 passed：svelte-check exitCode 0，日志尾部「svelte-check found 0 errors and 0 warnings」（含被删组件引用检查）；build-chrome exitCode 0，vite 各 chunk 构建成功。git status 显示仅 README.md/README.en.md/i18n.ts/App.svelte 修改与 ThreadRipperSettings.svelte 删除，public/manifest*.json 与 src/features 零改动，无新 Firefox 模块，按 brief 免 Firefox 低内存验证。本验证者未自行运行任何构建/检查命令。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| npm run check | run check | . | passed | 0 | 2861 ms |
| npm run build:chrome | run build:chrome | . | passed | 0 | 5157 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- npm run check: passed — svelte-check 0 errors 0 warnings（含 ThreadRipperSettings 删除后的引用检查）。
- npm run build:chrome: passed — Chrome 构建成功，无报错。
- 已知限制: 未做真实浏览器人工截图核对；展开动效与深浅色外观以代码审查和构建验证为准。
- 已知限制: README 新条目未配截图（与「屏蔽空格翻页」条目一致，属既定决策）。

## 阻塞项

_无。_

## 风险与跳过的工作

- 未做真实浏览器人工截图核对，展开动效与深浅色外观以共享 AccordionItem 组件行为与构建验证为准（该组件已被 CDN 切换条目长期使用，风险很低）。
- 仓库根目录出现未跟踪的 .zcodeignore（Agent 工具忽略配置，疑似环境工具生成而非本候选产物），与 6 项验收无关，建议提交前确认是否纳入版本管理。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 独立验收通过：线程撕裂者/屏蔽 P2P 已按规格内联为与 CDN 切换同模式的 AccordionItem，旧卡片组件删除干净；展开区三部分齐全、中英文案齐全；三条互斥规则与保存/回显链路逐行核对无改动；两份 README 新条目编号顺延、参考来源与实现相符；Runtime 检查 svelte-check 与 build-chrome 均由 Runtime 实际执行并通过（exitCode 0）。verdict=pass。 | 2026-10-11T11:08:05.908Z |



## 结论

独立验收通过：线程撕裂者/屏蔽 P2P 已按规格内联为与 CDN 切换同模式的 AccordionItem，旧卡片组件删除干净；展开区三部分齐全、中英文案齐全；三条互斥规则与保存/回显链路逐行核对无改动；两份 README 新条目编号顺延、参考来源与实现相符；Runtime 检查 svelte-check 与 build-chrome 均由 Runtime 实际执行并通过（exitCode 0）。verdict=pass。
