# 字幕系统完整重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整移植 read-frog 字幕渲染系统到 VidBoost，采用 Svelte 组件化架构，保留所有现有功能，新增 5 种字幕格式、Shadow DOM 隔离、噪音过滤、CJK 增强。

**Architecture:** 模块化解析器（6个独立文件） + Svelte 组件化 UI（3个组件） + Shadow DOM 隔离 + 双路径获取策略 + Hash 缓存机制。

**Tech Stack:** TypeScript 5, Svelte 4, Vitest, Vite 5, Shadow DOM API

## Global Constraints

- TypeScript strict mode 启用
- 所有新文件必须有完整的类型定义
- 测试覆盖率目标：解析器 >85%，工具类 >90%，核心逻辑 >80%
- 构建产物增量 <50KB (gzip后)
- 保持 VidBoost 现有代码风格（2空格缩进，单引号）
- 所有 commit message 遵循 Conventional Commits 规范
- 不修改 read-frog 源项目代码，仅移植逻辑

---

## Milestone 1: 核心解析与获取（Tasks 1-8）

### Task 1: 类型定义与基础设施

**Files:**
- Create: `src/features/youtube/subtitle/utils/types.ts`
- Create: `src/features/youtube/subtitle/__tests__/setup.ts`

**Interfaces:**
- Consumes: 无
- Produces: 
  - `SubtitleFragment` type: `{ text: string; start: number; end: number }`
  - `TimedTextEvent` type: YouTube API 事件类型
  - `SubtitleFormat` type: `'animated' | 'stylized-karaoke' | 'karaoke' | 'scrolling-asr' | 'standard'`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p src/features/youtube/subtitle/{core,parsers,components,utils,styles,__tests__/{parsers,utils,components}}
```

- [ ] **Step 2: 创建类型定义文件**

```typescript
// src/features/youtube/subtitle/utils/types.ts
export type SubtitleFragment = {
  text: string;
  start: number;
  end: number;
};

export type TimedTextSeg = {
  utf8: string;
  tOffsetMs?: number;
};

export type TimedTextEvent = {
  tStartMs: number;
  dDurationMs?: number;
  aAppend?: number;
  segs?: TimedTextSeg[];
  wpWinPosId?: number;
  wWinId?: number;
};

export type SubtitleFormat = 
  | 'animated'
  | 'stylized-karaoke'
  | 'karaoke'
  | 'scrolling-asr'
  | 'standard';

export type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  vssId: string;
  name?: {
    simpleText?: string;
  };
  trackName?: string;
};

export type PotToken = {
  pot: string | null;
  potc: string | null;
};
```

- [ ] **Step 3: 创建测试设置文件**

```typescript
// src/features/youtube/subtitle/__tests__/setup.ts
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Setup global test environment
});

afterAll(() => {
  // Cleanup
});
```

- [ ] **Step 4: 验证类型定义**

Run: `npx tsc --noEmit src/features/youtube/subtitle/utils/types.ts`
Expected: 无错误输出

- [ ] **Step 5: Commit**

```bash
git add src/features/youtube/subtitle/
git commit -m "feat(subtitle): add core type definitions and test setup"
```

## 文件结构概览

**新增目录结构**:
```
src/features/youtube/subtitle/
├─ core/
│  ├─ fetcher.ts
│  ├─ format-detector.ts
│  └─ cache.ts
├─ parsers/
│  ├─ standard.ts
│  ├─ karaoke.ts
│  ├─ scrolling-asr.ts
│  ├─ stylized-karaoke.ts
│  ├─ animated.ts
│  └─ index.ts
├─ components/
│  ├─ SubtitleContainer.svelte
│  ├─ SubtitleText.svelte
│  ├─ DragHandle.svelte
│  └─ shadow-host.ts
├─ utils/
│  ├─ noise-filter.ts
│  ├─ pot-token.ts
│  ├─ cjk-utils.ts
│  ├─ style-utils.ts
│  └─ types.ts
└─ styles/
   └─ theme.css
```

**修改文件**:
- `src/features/youtube/YouTubeSubtitleOverlay.ts` (重写)
- `src/features/youtube/subtitleOverlay.shared.ts` (扩展类型)
- `vite.ytsubtitleoverlay.config.ts` (添加 Svelte 插件)

**删除文件**:
- `src/features/youtube/subtitleOverlayParser.ts` (被 parsers/ 目录替代)

---


### Task 2: 噪音过滤器与 CJK 工具类

**Files:**
- Create: `src/features/youtube/subtitle/utils/noise-filter.ts`
- Create: `src/features/youtube/subtitle/utils/cjk-utils.ts`
- Create: `src/features/youtube/subtitle/__tests__/utils/noise-filter.test.ts`
- Create: `src/features/youtube/subtitle/__tests__/utils/cjk-utils.test.ts`

**Interfaces:**
- Consumes: `TimedTextEvent` from types.ts
- Produces:
  - `filterNoiseFromEvents(events: TimedTextEvent[]): TimedTextEvent[]`
  - `isCJKLanguage(languageCode?: string): boolean`
  - `getTextLength(text: string, isCJK: boolean): number`
  - `getMaxLength(isCJK: boolean): number`

**实施步骤**: TDD - 测试先行，实现 noise-filter.ts（38行）和 cjk-utils.ts（15行），测试覆盖 >90%

---

### Task 3: 标准字幕解析器

**Files:**
- Create: `src/features/youtube/subtitle/parsers/standard.ts`
- Create: `src/features/youtube/subtitle/parsers/utils.ts` (共享工具)
- Create: `src/features/youtube/subtitle/__tests__/parsers/standard.test.ts`

**Interfaces:**
- Consumes: `TimedTextEvent[]`, `SubtitleFragment` from types.ts
- Produces: `parseStandardSubtitles(events: TimedTextEvent[]): SubtitleFragment[]`

**实施步骤**: 移植 read-frog 的 standard-parser.ts 逻辑（43行），添加 normalizeFragments 共享工具

---

### Task 4: 卡拉OK解析器（Karaoke + Stylized Karaoke）

**Files:**
- Create: `src/features/youtube/subtitle/parsers/karaoke.ts`
- Create: `src/features/youtube/subtitle/parsers/stylized-karaoke.ts`
- Create: `src/features/youtube/subtitle/__tests__/parsers/karaoke.test.ts`
- Create: `src/features/youtube/subtitle/__tests__/parsers/stylized-karaoke.test.ts`

**Interfaces:**
- Consumes: `TimedTextEvent[]` from types.ts
- Produces:
  - `parseKaraokeSubtitles(events: TimedTextEvent[]): SubtitleFragment[]`
  - `parseStylizedKaraokeSubtitles(events: TimedTextEvent[]): SubtitleFragment[]`

**实施步骤**: 移植 karaoke-parser.ts（72行）和 stylized-karaoke-parser.ts（210行），重点测试主轨选择逻辑

---

### Task 5: Scrolling ASR 与 Animated 解析器

**Files:**
- Create: `src/features/youtube/subtitle/parsers/scrolling-asr.ts`
- Create: `src/features/youtube/subtitle/parsers/animated.ts`
- Create: `src/features/youtube/subtitle/__tests__/parsers/scrolling-asr.test.ts`
- Create: `src/features/youtube/subtitle/__tests__/parsers/animated.test.ts`

**Interfaces:**
- Consumes: `TimedTextEvent[]`, CJK utils
- Produces:
  - `parseScrollingAsrSubtitles(events: TimedTextEvent[], languageCode?: string): SubtitleFragment[]`
  - `parseAnimatedSubtitles(events: TimedTextEvent[]): SubtitleFragment[]`

**实施步骤**: 移植 scrolling-asr-parser.ts（131行，CJK增强）和 animated-parser.ts（40行，新增）

---

### Task 6: 格式检测器

**Files:**
- Create: `src/features/youtube/subtitle/core/format-detector.ts`
- Create: `src/features/youtube/subtitle/__tests__/core/format-detector.test.ts`

**Interfaces:**
- Consumes: `TimedTextEvent[]`, `SubtitleFormat` from types.ts
- Produces: `detectFormat(events: TimedTextEvent[]): SubtitleFormat`

**实施步骤**: 移植 format-detector.ts（174行），实现 5 种格式检测，优先级：Animated → Stylized Karaoke → Karaoke → Scrolling ASR → Standard

---

### Task 7: 解析器统一导出

**Files:**
- Create: `src/features/youtube/subtitle/parsers/index.ts`

**Interfaces:**
- Consumes: 所有解析器 + format-detector + noise-filter
- Produces: `parseYouTubeSubtitleEvents(events: TimedTextEvent[], languageCode?: string): SubtitleFragment[]`

**实施步骤**:
```typescript
// parsers/index.ts
import { filterNoiseFromEvents } from '../utils/noise-filter';
import { detectFormat } from '../core/format-detector';
import { parseStandardSubtitles } from './standard';
import { parseKaraokeSubtitles } from './karaoke';
import { parseStylizedKaraokeSubtitles } from './stylized-karaoke';
import { parseScrollingAsrSubtitles } from './scrolling-asr';
import { parseAnimatedSubtitles } from './animated';
import type { TimedTextEvent, SubtitleFragment } from '../utils/types';

export function parseYouTubeSubtitleEvents(
  events: TimedTextEvent[],
  languageCode?: string
): SubtitleFragment[] {
  const filtered = filterNoiseFromEvents(events);
  const format = detectFormat(filtered);
  
  switch (format) {
    case 'animated':
      return parseAnimatedSubtitles(filtered);
    case 'stylized-karaoke':
      return parseStylizedKaraokeSubtitles(filtered);
    case 'karaoke':
      return parseKaraokeSubtitles(filtered);
    case 'scrolling-asr':
      return parseScrollingAsrSubtitles(filtered, languageCode);
    default:
      return parseStandardSubtitles(filtered);
  }
}
```

---

### Task 8: POT Token 提取与缓存机制

**Files:**
- Create: `src/features/youtube/subtitle/utils/pot-token.ts`
- Create: `src/features/youtube/subtitle/core/cache.ts`
- Create: `src/features/youtube/subtitle/__tests__/utils/pot-token.test.ts`

**Interfaces:**
- Consumes: `CaptionTrack`, `PotToken` from types.ts
- Produces:
  - `extractPotToken(track: CaptionTrack, playerData: any): PotToken`
  - `buildTrackHash(videoId: string, track: CaptionTrack): string`
  - Cache管理类

**实施步骤**: 实现 POT token 提取优先级（audioCaptionTracks > cachedTimedtextUrl）和 Hash 缓存（5分钟过期）

---

## Milestone 2: UI 组件化与 Shadow DOM（Tasks 9-13）

### Task 9: Shadow DOM 构建器

**Files:**
- Create: `src/features/youtube/subtitle/components/shadow-host.ts`
- Create: `src/features/youtube/subtitle/styles/theme.css`

**Interfaces:**
- Consumes: Svelte 组件, CSS 字符串
- Produces: `ShadowHostBuilder` class with methods:
  - `static create(): ShadowHostBuilder`
  - `withStyles(css: string): this`
  - `mount(Component: any, props: any, target: HTMLElement): this`
  - `destroy(): void`

**实施步骤**: 移植 read-frog 的 ShadowHostBuilder，适配 Svelte 组件挂载

---

### Task 10: DragHandle 组件

**Files:**
- Create: `src/features/youtube/subtitle/components/DragHandle.svelte`
- Create: `src/features/youtube/subtitle/__tests__/components/DragHandle.test.ts`

**Interfaces:**
- Props:
  - `visible: boolean`
  - `position: { anchor: 'top' | 'bottom', percent: number }`
  - `onDrag: (percent: number) => void`

**实施步骤**: 实现拖动交互（mousedown/mousemove/mouseup），计算位置百分比

---

### Task 11: SubtitleText 组件

**Files:**
- Create: `src/features/youtube/subtitle/components/SubtitleText.svelte`
- Create: `src/features/youtube/subtitle/utils/style-utils.ts`
- Create: `src/features/youtube/subtitle/__tests__/components/SubtitleText.test.ts`

**Interfaces:**
- Props:
  - `text: string`
  - `style: YTSubtitleStyle`
- Produces: 渲染后的字幕文本，支持响应式缩放、多效果叠加

**实施步骤**: 移植 VidBoost 现有样式逻辑，添加 style-utils.ts（响应式缩放公式、多效果渲染）

---

### Task 12: SubtitleContainer 组件

**Files:**
- Create: `src/features/youtube/subtitle/components/SubtitleContainer.svelte`
- Create: `src/features/youtube/subtitle/__tests__/components/SubtitleContainer.test.ts`

**Interfaces:**
- Props:
  - `fragments: SubtitleFragment[]`
  - `currentTime: number`
  - `style: YTSubtitleStyle`
  - `position: YTSubtitlePosition`
  - `onPositionChange: (percent: number) => void`

**实施步骤**: 实现二分查找当前字幕、集成 DragHandle 和 SubtitleText

---

### Task 13: Vite 构建配置

**Files:**
- Modify: `vite.ytsubtitleoverlay.config.ts`

**Interfaces:**
- Consumes: Svelte 插件配置
- Produces: 编译后的 Svelte 组件 bundle

**实施步骤**:
```typescript
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        css: 'injected'
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
```

---

## Milestone 3: 集成与功能完整性（Tasks 14-18）

### Task 14: 字幕获取器（Fetcher）

**Files:**
- Create: `src/features/youtube/subtitle/core/fetcher.ts`
- Create: `src/features/youtube/subtitle/__tests__/core/fetcher.test.ts`

**Interfaces:**
- Consumes: Cache, POT token, parsers, 现有 YouTube API
- Produces:
  - `tryFastFetch(videoId: string): Promise<SubtitleResult | null>`
  - `fetchWithFallback(videoId: string): Promise<SubtitleResult>`
  - `fetchSubtitlesWithCache(videoId: string): Promise<SubtitleResult>`

**实施步骤**: 实现双路径获取策略（快速路径 + 降级路径），集成 Hash 缓存

---

### Task 15: Feature 入口重写（第一部分：核心逻辑）

**Files:**
- Modify: `src/features/youtube/YouTubeSubtitleOverlay.ts` (重写，保留签名)

**Interfaces:**
- Consumes: Fetcher, ShadowHostBuilder, Svelte 组件
- Produces: 新的 Feature 实现，保留现有 mount/unmount 签名

**实施步骤**: 重写核心逻辑（约 500 行），集成新的获取器和 UI 组件

---

### Task 16: Feature 入口重写（第二部分：现有功能）

**Files:**
- Continue: `src/features/youtube/YouTubeSubtitleOverlay.ts`

**Interfaces:**
- 保留所有现有功能：
  - 拖动手柄 + 位置记忆
  - 原生字幕状态记忆（全局 + 按频道）
  - 跟随原生字幕开关
  - 自定义字体导入
  - 多效果叠加
  - OSD 提示
  - 导航监听

**实施步骤**: 逐一移植现有功能到新架构

---

### Task 17: 集成测试

**Files:**
- Create: `src/features/youtube/subtitle/__tests__/integration.test.ts`

**实施步骤**: 测试完整流程（获取 → 解析 → 渲染）、轨道切换、错误降级

---

### Task 18: 清理旧代码

**Files:**
- Delete: `src/features/youtube/subtitleOverlayParser.ts`
- Verify: 构建通过，所有测试通过

**实施步骤**:
```bash
git rm src/features/youtube/subtitleOverlayParser.ts
npm run build
npm run check
npx vitest run
git commit -m "refactor(subtitle): remove old parser, complete rewrite"
```

---

## 验收标准

### 自动化测试
- [ ] 所有单元测试通过（覆盖率 >80%）
- [ ] 集成测试通过
- [ ] 构建无错误，无 TypeScript 报错
- [ ] Firefox 构建成功

### 手动测试
- [ ] 5 种字幕格式正确渲染
- [ ] 拖动手柄交互流畅
- [ ] 位置记忆持久化
- [ ] 样式零冲突（Shadow DOM 隔离）
- [ ] 响应式缩放正常
- [ ] 原生字幕联动正常
- [ ] 无内存泄漏（连续切换 20 个视频）

### 性能指标
- [ ] 首次字幕加载 <1秒
- [ ] RAF 渲染帧率 >55fps
- [ ] 构建产物增量 <50KB (gzip后)

---

## 实施建议

1. **严格按照任务顺序执行**：依赖关系明确，跳过会导致后续任务失败
2. **每个任务独立 commit**：便于 code review 和回滚
3. **TDD 优先**：测试先行，确保代码质量
4. **参考 read-frog 源码**：移植逻辑时对照 `/Users/tune/Develop/GitHub/VidBoost/read-frog`
5. **保持小步快跑**：每个步骤 2-5 分钟，频繁验证
6. **遇到阻塞及时记录**：记录问题和解决方案，避免重复踩坑

