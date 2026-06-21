# VidBoost 字幕系统完整重构设计

**日期**: 2025-06-21  
**状态**: Draft  
**作者**: Claude Code  
**类型**: 完整架构重构

## 执行摘要

完整移植 read-frog 的字幕渲染系统到 VidBoost，采用 Svelte 组件化架构，保留所有现有功能，新增 5 种字幕格式支持、Shadow DOM 隔离、噪音过滤、CJK 增强等特性。

### 关键决策
- **移植范围**: 完整架构重构（最接近 read-frog）
- **UI 框架**: Svelte 组件化（与项目技术栈统一）
- **目录结构**: 紧凑型模块化
- **Shadow DOM**: 自定义 ShadowHostBuilder
- **功能兼容**: 完全保留现有功能（拖动/状态记忆/字体导入/多效果）
- **构建策略**: 扩展现有 Vite 配置
- **迁移策略**: 完整重写 + 充分测试
- **测试策略**: 自动化 + 手动双保险

### 核心改进
- ✅ 5 种字幕格式（新增 Animated）
- ✅ Shadow DOM 完全样式隔离
- ✅ 噪音过滤（自动去除 `[Music]`/`♪`）
- ✅ CJK 语言增强（中文字幕更准确分割）
- ✅ 双路径获取（快速 + 降级）
- ✅ Hash 缓存机制
- ✅ 模块化架构（6 个独立解析器）

## 一、架构概览

### 1.1 新旧架构对比

**当前架构（V1）**
```
YouTubeSubtitleOverlay.ts (1748行)
  ├─ 解析器内联 (298行)
  ├─ 原生DOM渲染
  ├─ 无样式隔离
  └─ 单路径获取 (6次重试)
```

**新架构（V2）**
```
src/features/youtube/subtitle/
├─ core/
│  ├─ fetcher.ts          # 双路径获取 + Hash缓存
│  ├─ format-detector.ts  # 5种格式检测
│  └─ cache.ts            # 轨道变化检测
├─ parsers/
│  ├─ standard.ts         # 标准字幕
│  ├─ karaoke.ts          # 卡拉OK
│  ├─ scrolling-asr.ts    # 滚动ASR (CJK增强)
│  ├─ stylized-karaoke.ts # 样式化卡拉OK (主轨选择)
│  └─ animated.ts         # 动画字幕 (新增)
├─ components/            # Svelte组件
│  ├─ SubtitleContainer.svelte     # 主容器
│  ├─ SubtitleText.svelte          # 字幕文本
│  ├─ DragHandle.svelte            # 拖动手柄
│  └─ shadow-host.ts               # ShadowHostBuilder
├─ utils/
│  ├─ noise-filter.ts     # 噪音过滤
│  ├─ pot-token.ts        # POT token提取
│  ├─ cjk-utils.ts        # CJK语言处理
│  └─ types.ts            # 类型定义
└─ YouTubeSubtitleOverlay.ts  # Feature入口 (重写)
```

### 1.2 核心技术栈

| 层级 | 技术选型 | 来源 |
|-----|---------|-----|
| UI框架 | Svelte 4 | VidBoost现有栈 |
| 样式隔离 | Shadow DOM + ShadowHostBuilder | read-frog移植 |
| 构建工具 | Vite 5 + @sveltejs/vite-plugin-svelte | VidBoost现有 |
| 测试框架 | Vitest | VidBoost现有 |
| 类型系统 | TypeScript 5 | VidBoost现有 |

## 二、详细设计

### 2.1 字幕获取层（core/fetcher.ts）

**关键改进：双路径 + Hash缓存**

**快速路径（Fast Path）**
1. 立即请求 PlayerData
2. 提取 POT token
3. 如果 POT 可用，直接获取字幕
4. 失败则降级

**降级路径（Fallback Path）**
1. 等待播放器状态 >= 1
2. 轮询 POT token（10次 × 300ms）
3. 最后降级：监听 XHR cachedTimedtextUrl

**Hash 缓存机制**
- 缓存键：`videoId:languageCode:kind:vssId`
- 缓存时长：5分钟
- 轨道变化检测：Hash 不匹配时重新获取

**保留的 VidBoost 功能**
- ✅ 轨道选择优先级（用户选择 > 人工无名 > 人工有名 > ASR）
- ✅ 403 错误自动开启原生字幕重试
- ✅ 6 次重试机制（整合到降级路径）

### 2.2 格式检测层（core/format-detector.ts）

**支持的格式类型**

1. **Animated（新增）**
   - 检测条件：50+ 事件 && 50% 事件时长 < 100ms && 有 wpWinPosId
   - 场景：快速闪现的动画字幕
   - 解析策略：合并相同文本的连续事件

2. **Stylized Karaoke（增强）**
   - 检测条件：斜杠/零宽空格标记 + 400ms 内重复渲染 + 多轨道
   - 场景：样式化卡拉OK字幕
   - 解析策略：主轨选择（优先 ID=3）+ 多轨合并

3. **Karaoke**
   - 检测条件：同时刻多个 wpWinPosId
   - 场景：标准卡拉OK字幕
   - 解析策略：选择主轨道

4. **Scrolling ASR（增强）**
   - 检测条件：wWinId + aAppend=1
   - 场景：滚动自动生成字幕
   - 解析策略：跨事件累积 + CJK 长度检测 + 句末分割

5. **Standard**
   - 默认格式
   - 场景：常规字幕
   - 解析策略：逐段解析

**检测优先级**
Animated → Stylized Karaoke → Karaoke → Scrolling ASR → Standard

### 2.3 解析器层（parsers/）

#### 2.3.1 Animated 解析器（新增）

**核心逻辑**
- 合并相同文本的连续事件
- 过滤空白事件
- 规范化时间戳（避免重叠）

**适用场景**
- 快速闪现的片头字幕
- 动画效果字幕

#### 2.3.2 Scrolling ASR 增强（CJK 支持）

**CJK 语言处理**
- 语言检测：`zh/ja/ko` 前缀
- 长度计算：CJK 按字符数，拉丁按单词数
- 长度限制：CJK 40 字符，拉丁 80 单词
- 空格处理：英语自动插入空格

**句末检测**
- 支持多语言标点：中文句号 `。`、阿拉伯问号 `؟`、乌尔都句号 `۔`
- 正则表达式：`/[,.。?？！!；;…؟۔]/`

**Pending Split 机制**
- 标记分割点但延迟到 separator 事件才输出
- 避免过早截断完整句子

#### 2.3.3 Stylized Karaoke 增强（主轨选择）

**主轨选择算法**
1. 按轨道 ID 分组统计事件数
2. 优先选择 ID=3（YouTube 主轨道惯例）
3. 其次选择事件数最多的轨道

**文本归一化**
- 去除斜杠 `/` 和零宽空格 `​`
- 转小写
- 判断相同家族（前缀/后缀关系）

**合并策略**
- 400ms 内的相同家族文本合并
- 保留最长版本的文本

#### 2.3.4 噪音过滤（统一预处理）

**过滤模式**
- `[Music]`, `[Applause]`, `[Laughter]` 等方括号标注
- `(音乐)`, `(掌声)` 等圆括号标注
- `♪ ... ♪` 音符包围
- `🎵`, `🎶` 表情符号

**应用时机**
- 格式检测前全局过滤
- 保留原始事件结构，仅过滤 segs 数组

### 2.4 UI 层（components/）

#### 2.4.1 Shadow DOM 隔离（shadow-host.ts）

**ShadowHostBuilder 类**
- 职责：创建 Shadow Host + Shadow Root
- 样式注入：独立的 CSS 作用域
- Svelte 组件挂载：到 Shadow Root 内部
- 清理逻辑：组件销毁 + Host 移除

**关键特性**
- 样式完全隔离（页面 CSS 不影响字幕，字幕 CSS 不污染页面）
- 事件桥接（从 Shadow DOM 内部传递到外部）
- 字体继承控制（可选择是否继承页面字体）

#### 2.4.2 Svelte 组件架构

**SubtitleContainer.svelte（主容器）**
- 职责：布局、位置控制、拖动状态管理
- Props：fragments, currentTime, style, position, onPositionChange
- 子组件：DragHandle + SubtitleText
- 逻辑：二分查找当前字幕

**SubtitleText.svelte（文本渲染）**
- 职责：字幕文本样式渲染
- Props：text, style
- 功能：响应式缩放、多效果叠加、字体加载
- 样式：fontSize, fontFamily, fontWeight, textShadow, stroke

**DragHandle.svelte（拖动手柄）**
- 职责：拖动交互、位置调整
- Props：visible, position, onDrag
- 状态：dragging, hover
- 交互：mousedown/mousemove/mouseup

#### 2.4.3 样式处理策略

**CSS 文件**
- 独立文件：`styles/theme.css`
- 构建时内联：Vite `?inline` 导入
- 注入到 Shadow Root：通过 `<style>` 标签

**:host 选择器**
- 重置样式：`all: initial`
- 避免页面样式污染

**响应式缩放**
- 基准高度：720px
- 阻尼系数：0.55（避免全屏时字幕过大）
- 最大缩放：1.35x

### 2.5 Feature 入口层（YouTubeSubtitleOverlay.ts 重写）

**核心职责**
- 生命周期管理：mount/unmount
- 视频绑定：video element 事件监听
- 字幕加载：调用 fetcher + parser
- UI 渲染：ShadowHostBuilder 挂载 Svelte 组件
- RAF 渲染循环：currentTime 同步

**保留的现有功能**
- ✅ 拖动手柄 + 位置记忆（持久化到 storage）
- ✅ 原生字幕状态记忆（全局 + 按频道）
- ✅ 跟随原生字幕开关
- ✅ 自定义字体导入（FontFace API）
- ✅ 多效果叠加（outline/raised/depressed/drop-shadow）
- ✅ OSD 提示（降级时显示消息）
- ✅ 导航监听（yt-navigate-start/finish）

**架构变化**
- 原 1748 行单文件 → 拆分为模块 + 重写入口（约 500 行）
- 原生 DOM 操作 → Svelte 响应式组件
- 直接 DOM 插入 → Shadow DOM 隔离

## 三、构建配置

### 3.1 扩展 vite.ytsubtitleoverlay.config.ts

**新增配置**
```typescript
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        css: 'injected' // 手动控制样式注入到 Shadow DOM
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true // 避免拆分 chunk
      }
    }
  }
});
```

**样式处理**
- CSS 文件通过 `?inline` 导入为字符串
- 运行时注入到 Shadow Root 的 `<style>` 标签

**Firefox 适配**
- 复用现有 Firefox 构建流程
- 确保 Svelte 编译产物兼容 Firefox content script 环境

## 四、测试策略

### 4.1 自动化测试（Vitest）

#### 4.1.1 单元测试

**解析器测试**
- `parsers/__tests__/animated.test.ts`
  - 合并相同文本事件
  - 过滤空白事件
  - 时间戳规范化
  
- `parsers/__tests__/scrolling-asr.test.ts`
  - CJK 长度限制
  - 英文空格插入
  - 句末标点检测
  
- `parsers/__tests__/stylized-karaoke.test.ts`
  - 主轨选择算法
  - 文本归一化
  - 相同家族合并

**工具类测试**
- `utils/__tests__/noise-filter.test.ts`
  - 方括号标注过滤
  - 音符符号过滤
  - 多语言标注过滤
  
- `utils/__tests__/cjk-utils.test.ts`
  - 语言检测
  - 长度计算（字符 vs 单词）
  - 最大长度判断

**核心逻辑测试**
- `core/__tests__/format-detector.test.ts`
  - 5 种格式检测准确性
  - 边缘场景处理
  
- `core/__tests__/fetcher.test.ts`
  - 缓存命中/未命中
  - 快速路径 vs 降级路径
  - 轨道变化检测

**覆盖率目标**
- 解析器：>85%
- 工具类：>90%
- 核心逻辑：>80%

#### 4.1.2 组件测试

**Svelte Testing Library**
- `components/__tests__/SubtitleText.test.ts`
  - 文本渲染
  - 样式应用
  - 响应式缩放
  
- `components/__tests__/DragHandle.test.ts`
  - 拖动交互
  - 位置计算
  - 状态管理

**集成测试**
- 完整流程：获取 → 解析 → 渲染
- 轨道切换场景
- 错误降级场景

### 4.2 手动测试清单

#### 4.2.1 字幕格式覆盖

**准备测试视频列表**（存储在独立文档）
- Standard 格式：英文/中文标准字幕
- Karaoke 格式：多轨卡拉OK字幕
- Scrolling ASR 格式：英文/中文滚动ASR
- Stylized Karaoke 格式：样式化卡拉OK + 多轨冲突
- Animated 格式：快速闪现动画字幕
- 噪音标注：含 [Music]/[Applause]/♪ 的字幕

#### 4.2.2 功能完整性

**核心渲染**
- [ ] 字幕正确显示在视频上方
- [ ] 文本准确无乱码
- [ ] 时间同步准确（±100ms）
- [ ] Shadow DOM 隔离生效

**拖动与位置**
- [ ] 拖动手柄显示/隐藏
- [ ] 拖动调整位置流畅
- [ ] 位置记忆持久化
- [ ] Top/Bottom 锚点切换

**样式自定义**
- [ ] 字体大小/系列调整
- [ ] 自定义字体导入加载
- [ ] 颜色/透明度调整
- [ ] 多效果叠加渲染
- [ ] 响应式缩放（全屏）

**原生字幕联动**
- [ ] 跟随原生字幕开关
- [ ] 状态记忆（全局 + 按频道）

**轨道切换**
- [ ] 切换语言自动重新加载
- [ ] 人工 ↔ ASR 切换正常

**边缘场景**
- [ ] 无字幕视频降级
- [ ] 加载失败 OSD 提示
- [ ] 快速切换视频无泄漏
- [ ] 高倍速字幕同步

#### 4.2.3 跨浏览器测试

**Chrome/Edge**
- [ ] 字幕渲染正常
- [ ] Shadow DOM 样式隔离
- [ ] 所有交互功能正常

**Firefox**
- [ ] 字幕渲染正常
- [ ] 构建产物独立
- [ ] Content Script 注入正常

## 五、实现计划

### 5.1 分阶段交付（内部里程碑）

**Milestone 1: 核心解析与获取（1-2周）**
- 模块化解析器（6个文件）
- 格式检测器
- 噪音过滤器
- 双路径获取 + Hash缓存
- 单元测试覆盖 >80%

**Milestone 2: UI组件化与Shadow DOM（1-2周）**
- ShadowHostBuilder实现
- Svelte组件（Container/Text/DragHandle）
- 样式隔离验证
- 组件测试
- 与Feature入口集成

**Milestone 3: 功能完整性与测试（1周）**
- 保留所有现有功能
- 手动测试清单全覆盖
- Firefox构建适配
- 性能优化（RAF渲染/内存管理）

### 5.2 风险控制

**风险1：Svelte组件编译到Shadow DOM的兼容性**
- 缓解：提前验证最小Demo
- 备选：降级到原生DOM操作 + Shadow DOM包装

**风险2：read-frog React逻辑转译遗漏**
- 缓解：逐组件对比，关键逻辑标注源码位置
- 验证：组件测试 + 手动对比渲染效果

**风险3：现有功能回归**
- 缓解：详尽的手动测试清单
- 保险：beta测试期（内部使用1周）

### 5.3 代码行数估算

| 模块 | 预估行数 | 说明 |
|-----|---------|-----|
| 解析器（6个文件） | ~800 | 移植read-frog逻辑 |
| 获取器 + 缓存 | ~400 | 双路径 + Hash机制 |
| 工具类（CJK/噪音/POT） | ~200 | 新增功能 |
| Svelte组件（3个） | ~400 | 转译React逻辑 |
| ShadowHostBuilder | ~100 | 移植基础设施 |
| Feature入口重写 | ~500 | 保留现有功能逻辑 |
| 测试代码 | ~600 | 单元+集成测试 |
| **总计** | **~3000** | 净增约1200行（删除旧代码1800行） |

## 六、成功标准

### 6.1 功能完整性
- ✅ 所有现有功能100%保留
- ✅ 5种字幕格式正确解析
- ✅ 噪音过滤自动生效
- ✅ CJK语言字幕分割准确

### 6.2 质量指标
- ✅ 单元测试覆盖率 >80%
- ✅ 手动测试清单100%通过
- ✅ Chrome + Firefox双平台验证
- ✅ 无内存泄漏（连续切换20个视频）

### 6.3 性能指标
- ✅ 首次字幕加载 <1秒（快速路径）
- ✅ RAF渲染帧率 >55fps
- ✅ 构建产物增量 <50KB（gzip后）

### 6.4 用户体验
- ✅ 样式零冲突（Shadow DOM隔离）
- ✅ 无闪烁/跳动
- ✅ 拖动手柄交互流畅
- ✅ 降级提示友好（OSD消息）

## 七、关键技术细节

### 7.1 CJK 语言处理

**语言检测**
```typescript
const CJK_LANGUAGE_CODES = ['zh', 'ja', 'ko'];

function isCJKLanguage(languageCode?: string): boolean {
  if (!languageCode) return false;
  return CJK_LANGUAGE_CODES.some(code => 
    languageCode.toLowerCase().startsWith(code)
  );
}
```

**长度计算**
```typescript
function getTextLength(text: string, isCJK: boolean): number {
  if (isCJK) {
    return text.length; // 字符数
  } else {
    return text.split(/\s+/).filter(Boolean).length; // 单词数
  }
}

function getMaxLength(isCJK: boolean): number {
  return isCJK ? 40 : 80;
}
```

### 7.2 POT Token 提取优先级

1. **audioCaptionTracks**（最可靠）
   - 匹配优先级：vssId > (languageCode + kind) > languageCode
   
2. **cachedTimedtextUrl**（XHR监听降级）
   - 从 page script 的 XHR 拦截器获取

3. **返回 null**（触发降级路径）

### 7.3 响应式缩放公式

```typescript
const PLAYER_HEIGHT_BASELINE_PX = 720;
const RESPONSIVE_GROWTH_DAMPING = 0.55;
const MAX_RESPONSIVE_SCALE = 1.35;

function resolveResponsiveScale(): number {
  const playerHeight = getPlayerHeight();
  if (playerHeight <= PLAYER_HEIGHT_BASELINE_PX) return 1;
  
  // 阻尼增长曲线
  const growthRatio = playerHeight / PLAYER_HEIGHT_BASELINE_PX;
  const scale = 1 + (growthRatio - 1) * RESPONSIVE_GROWTH_DAMPING;
  
  return Math.min(scale, MAX_RESPONSIVE_SCALE);
}
```

### 7.4 多效果叠加渲染

**效果类型**
- `outline`: 描边 + 光晕
- `raised`: 浮雕效果（光影在左上，暗影在右下）
- `depressed`: 压印效果（暗影在左上，光影在右下）
- `drop-shadow`: 投影（偏移 + 模糊）

**合并策略**
- textShadow: 所有效果的阴影拼接
- textStroke: 只保留最后一个 outline 效果的描边
- paintOrder: 由 outline 效果控制

## 八、与 read-frog 的差异点

### 8.1 技术栈差异

| 维度 | read-frog | VidBoost（重构后） |
|-----|-----------|------------------|
| UI 框架 | React | Svelte |
| 状态管理 | React Context | Svelte Store |
| 样式方案 | CSS Modules | Inline CSS + Shadow DOM |
| 构建工具 | WXT Framework | Vite |

### 8.2 不移植的功能

**翻译相关**
- ✗ 字幕翻译功能（AI 翻译）
- ✗ 双语字幕显示
- ✗ 翻译 SRT 导出

**YouTube Shorts**
- ✗ Shorts 专用适配（当前 VidBoost 不支持 Shorts）

**MCP 工具集成**
- ✗ read-frog 的 MCP 服务器集成（VidBoost 无此需求）

### 8.3 VidBoost 独有功能保留

**高级样式**
- ✅ 多效果叠加（read-frog 只支持单效果）
- ✅ 自定义字体导入（read-frog 无此功能）
- ✅ 字体变体设置（font-variation-settings）

**状态记忆**
- ✅ 按频道记忆原生字幕开关（read-frog 只有全局记忆）

**拖动交互**
- ✅ 拖动手柄自动显示/隐藏（read-frog 无拖动功能）

## 九、未来扩展可能性

### 9.1 短期（3-6个月）

**性能优化**
- 虚拟滚动（超长字幕列表）
- Web Worker 解析（大字幕文件）
- IndexedDB 缓存（长期缓存）

**格式支持**
- 外挂 SRT/VTT 文件支持
- 本地字幕文件拖拽

### 9.2 长期（6-12个月）

**翻译功能**
- 集成翻译 API
- 双语字幕显示
- 术语库支持

**YouTube Shorts 支持**
- Shorts 页面适配
- 竖屏布局优化

**AI 增强**
- 智能断句
- 字幕校正

## 十、文件清单

### 10.1 新增文件

```
src/features/youtube/subtitle/
├─ core/
│  ├─ fetcher.ts                    # 字幕获取器
│  ├─ format-detector.ts            # 格式检测器
│  └─ cache.ts                      # 缓存管理
├─ parsers/
│  ├─ standard.ts                   # 标准解析器
│  ├─ karaoke.ts                    # 卡拉OK解析器
│  ├─ scrolling-asr.ts              # 滚动ASR解析器
│  ├─ stylized-karaoke.ts           # 样式化卡拉OK解析器
│  ├─ animated.ts                   # 动画解析器
│  └─ index.ts                      # 统一导出
├─ components/
│  ├─ SubtitleContainer.svelte      # 主容器组件
│  ├─ SubtitleText.svelte           # 文本组件
│  ├─ DragHandle.svelte             # 拖动手柄组件
│  └─ shadow-host.ts                # Shadow DOM构建器
├─ utils/
│  ├─ noise-filter.ts               # 噪音过滤
│  ├─ pot-token.ts                  # POT token提取
│  ├─ cjk-utils.ts                  # CJK工具
│  ├─ style-utils.ts                # 样式工具
│  └─ types.ts                      # 类型定义
├─ styles/
│  └─ theme.css                     # Shadow DOM样式
└─ __tests__/
   ├─ parsers/
   ├─ utils/
   └─ components/
```

### 10.2 修改文件

```
src/features/youtube/
├─ YouTubeSubtitleOverlay.ts        # 重写（1748行 → ~500行）
└─ subtitleOverlay.shared.ts        # 新增类型定义

vite.ytsubtitleoverlay.config.ts    # 添加Svelte插件

package.json                         # 无变化（Svelte已存在）
```

### 10.3 删除文件

```
src/features/youtube/
└─ subtitleOverlayParser.ts         # 删除（298行，被parsers/目录替代）
```

## 十一、交付物

### 11.1 代码交付物

- [ ] 完整的源代码（约3000行）
- [ ] 单元测试（覆盖率 >80%）
- [ ] 组件测试
- [ ] 集成测试

### 11.2 文档交付物

- [ ] 本设计文档
- [ ] 测试视频清单（subtitle-test-videos.md）
- [ ] 手动测试清单（完整版）
- [ ] API 文档（主要模块的 TSDoc）

### 11.3 验证交付物

- [ ] 自动化测试通过报告
- [ ] 手动测试完成清单
- [ ] Chrome 验证截图
- [ ] Firefox 验证截图
- [ ] 性能测试报告（加载时间/帧率）

## 十二、总结

本设计完整移植 read-frog 的字幕系统核心能力到 VidBoost，同时保留所有现有功能。通过模块化架构、Svelte 组件化和 Shadow DOM 隔离，实现了代码质量、可维护性和用户体验的全面提升。

**核心价值**
- ✅ 5 种字幕格式支持（覆盖 >95% YouTube 视频）
- ✅ 零样式冲突（Shadow DOM 完全隔离）
- ✅ 更准确的 CJK 字幕处理
- ✅ 更快的字幕加载（双路径策略）
- ✅ 更清晰的代码结构（模块化 + 组件化）

**用户无感知升级**
- ✅ 所有现有功能完整保留
- ✅ 性能持平或更优
- ✅ 视觉体验一致

**技术债务清理**
- ✅ 删除 1800 行单文件代码
- ✅ 引入测试覆盖（当前无测试）
- ✅ 建立清晰的模块边界

