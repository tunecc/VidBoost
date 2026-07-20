# Subtitle Passthrough-by-Shape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 成品短语字幕（含无标点中文作者轨、短语级自动轨）原样播；只有词级/极碎字幕才 `refineAsrFragments` 合并。

**Architecture:** 单一形态判断 `needsResegment(fragments, language)`（不依赖 `kind`、不以标点为主开关）。`postProcessSubtitles` 统一生产后处理：需要 resegment → refine，否则 lightClean 透传。Overlay 与 `SubtitleController` 都只走这一入口，去掉 `kind === 'asr' ? refine : optimize`。

**Tech Stack:** TypeScript、现有 subtitle processors、Vitest（`npx vitest`，仓库 devDependency 可能未写入 package.json 但 `node_modules/vitest` 可用 2.1.9）、现有 `SubtitleFragment` 类型。

**Spec:** `docs/superpowers/specs/2026-07-20-subtitle-passthrough-by-shape-design.md`

## Global Constraints

- 路径 1：仅两态（透传 / 强合并）；不做轻整理第三档、不上 LLM。
- 作者轨与 `kind=asr` **同一套形态判断**；`kind` 不得单独强制 refine。
- **无标点不单独触发合并**（中文口播成品常无标点）。
- 默认 **拿不准就透传**，避免再负功。
- 不重写 `refineAsrFragments` 内部合并公式。
- 不改选轨、字体、overlay UI、POT。
- 测试用 `npx vitest run <path>`；与 media-kernel 的 `tsx --test` 无关。
- 完成声明前：相关 vitest 全绿；生产路径已接 `postProcessSubtitles`。

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/features/youtube/subtitle/processors/subtitle-style.ts` | `needsResegment`、`lightCleanFragments`、`postProcessSubtitles`；兼容包装 `detectSubtitleStyle` / `shouldUseAsrRefine` |
| `src/features/youtube/subtitle/processors/__tests__/subtitle-style.test.ts` | 形态判断 + 透传/合并路由回归 |
| `src/features/YouTubeSubtitleOverlay.ts` | `fetchTrackFragments` 改走 `postProcessSubtitles` |
| `src/features/youtube/subtitle/core/controller.ts` | `setTrack` 后处理与 overlay 一致 |
| `src/features/youtube/subtitle/__tests__/core/controller.test.ts` | 更新路由期望（短语成品透传；词级仍合并） |
| `src/features/youtube/subtitle/processors/subtitle-optimizer.ts` | 可选：注释标明生产成品轨不再走此入口；**不删文件**；CJK 安全网可保留给直接调用 |

---

### Task 1: 形态判断 + lightClean + postProcess（TDD）

**Files:**
- Modify: `src/features/youtube/subtitle/processors/subtitle-style.ts`
- Modify: `src/features/youtube/subtitle/processors/__tests__/subtitle-style.test.ts`

**Interfaces:**
- Produces:
  - `needsResegment(fragments: SubtitleFragment[], language: string): boolean`
  - `lightCleanFragments(fragments: SubtitleFragment[]): SubtitleFragment[]`
  - `postProcessSubtitles(fragments: SubtitleFragment[], language: string): SubtitleFragment[]`
  - `detectSubtitleStyle(fragments, language): 'polished' | 'asr-like'` — `needsResegment ? 'asr-like' : 'polished'`
  - `shouldUseAsrRefine(fragments, language, trackKind?: string | null): boolean` — **忽略 trackKind**，等价 `needsResegment(fragments, language)`（保留签名以免外部调用炸）

**判定常量（写死在 `subtitle-style.ts`，测试钉死行为）：**

```ts
// CJK：字符数；非 CJK：词数（经 getTextLength）
const TINY_CUE_CJK = 4;          // ≤4 字视为「词级碎」
const TINY_CUE_NON_CJK = 3;      // ≤3 词
const TINY_RATIO = 0.5;          // ≥50% 为 tiny → resegment
const LOW_AVG_CJK = 5;           // 均长很低
const LOW_AVG_NON_CJK = 3;
const LOW_AVG_TINY_RATIO = 0.35; // 均长很低时，tiny 占比门槛略降
const FLASH_MS = 500;            // 单条时长 <500ms
const FLASH_RATIO = 0.5;
const FLASH_AVG_CJK = 6;         // 闪现多且均长仍偏低 → resegment
const FLASH_AVG_NON_CJK = 4;
const MIN_SAMPLES = 5;           // 样本太少 → 透传（拿不准不合并）
```

**`needsResegment` 算法（必须按此实现）：**

```ts
export function needsResegment(
  fragments: SubtitleFragment[],
  language: string
): boolean {
  const usable = fragments.filter(f => f.text && f.text.trim().length > 0);
  if (usable.length < MIN_SAMPLES) {
    return false;
  }

  const isCJK = isCJKLanguage(language);
  const tinyThreshold = isCJK ? TINY_CUE_CJK : TINY_CUE_NON_CJK;
  const lengths = usable.map(f => getTextLength(f.text, isCJK));
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const tinyRatio =
    lengths.filter(n => n > 0 && n <= tinyThreshold).length / lengths.length;

  let flashCount = 0;
  for (const f of usable) {
    if (f.end - f.start < FLASH_MS) flashCount += 1;
  }
  const flashRatio = flashCount / usable.length;

  // 1) 大量词级碎 cue
  if (tinyRatio >= TINY_RATIO) {
    return true;
  }

  // 2) 均长极低 + 仍有不少 tiny
  const lowAvg = isCJK ? LOW_AVG_CJK : LOW_AVG_NON_CJK;
  if (avgLen <= lowAvg && tinyRatio >= LOW_AVG_TINY_RATIO) {
    return true;
  }

  // 3) 大量闪现 + 均长仍偏低（词级 ASR 时间特征）
  const flashAvg = isCJK ? FLASH_AVG_CJK : FLASH_AVG_NON_CJK;
  if (flashRatio >= FLASH_RATIO && avgLen <= flashAvg) {
    return true;
  }

  return false;
}
```

**`lightCleanFragments`：**

```ts
import {
  CHEVRON_PATTERN,
  LEADING_CHEVRON_PATTERN,
} from './subtitle-constants';

export function lightCleanFragments(
  fragments: SubtitleFragment[]
): SubtitleFragment[] {
  const out: SubtitleFragment[] = [];
  for (const f of fragments) {
    const text = (f.text ?? '')
      .replace(LEADING_CHEVRON_PATTERN, '')
      .replace(CHEVRON_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    out.push({ text, start: f.start, end: f.end });
  }
  return out;
}
```

**`postProcessSubtitles`：**

```ts
import { refineAsrFragments } from './asr-merge';

export function postProcessSubtitles(
  fragments: SubtitleFragment[],
  language: string
): SubtitleFragment[] {
  if (fragments.length === 0) return [];
  if (needsResegment(fragments, language)) {
    return refineAsrFragments(fragments, language);
  }
  return lightCleanFragments(fragments);
}
```

**兼容 API：**

```ts
export function detectSubtitleStyle(
  fragments: SubtitleFragment[],
  language: string
): SubtitleStyle {
  return needsResegment(fragments, language) ? 'asr-like' : 'polished';
}

export function shouldUseAsrRefine(
  fragments: SubtitleFragment[],
  language: string,
  _trackKind?: string | null
): boolean {
  return needsResegment(fragments, language);
}
```

删除旧的「标点差才继续看 shortRatio/avgLen」主路径；**不再 import `isPunctuationPoor`**（若仅为此文件使用）。

- [ ] **Step 1: 重写失败测试**

将 `subtitle-style.test.ts` 替换为以下内容（完整文件）：

```ts
/**
 * Content-shape resegment gate + postProcess routing
 */
import { describe, it, expect } from 'vitest';
import type { SubtitleFragment } from '../../utils/types';
import {
  detectSubtitleStyle,
  lightCleanFragments,
  needsResegment,
  postProcessSubtitles,
  shouldUseAsrRefine,
} from '../subtitle-style';

/** Phrase-level unpunctuated Chinese (author-style), like the user SRT sample. */
const POLISHED_UNPUNCT_ZH: SubtitleFragment[] = [
  { text: '他是中共历史上唯一的三朝帝师', start: 3700, end: 6800 },
  { text: '是三任总书记的幕后智囊', start: 6966, end: 9500 },
  { text: '充当党的理论的操盘手', start: 9733, end: 12433 },
  { text: '他也是中共历史上唯一的没有主政过一方', start: 12866, end: 16300 },
  { text: '仅仅是依靠智囊身份', start: 16400, end: 18000 },
  { text: '进入最高权力圈', start: 18000, end: 19733 },
  { text: '当上政治局常委的知识分子', start: 19733, end: 22600 },
  { text: '他结了三次婚', start: 22800, end: 24066 },
  { text: '写过多本政治学著作', start: 24133, end: 26400 },
  { text: '也曾经是无数学子仰望的学术才俊', start: 26600, end: 30100 },
  { text: '但是为什么', start: 31000, end: 31966 },
  { text: '如今的中国人对他评价并不高', start: 31966, end: 34900 },
];

/** Word-level Chinese ASR crumbs. */
const WORD_LEVEL_ZH: SubtitleFragment[] = Array.from({ length: 12 }, (_, i) => ({
  text: '字',
  start: i * 200,
  end: i * 200 + 150,
}));

/** Word-level English ASR crumbs. */
const WORD_LEVEL_EN: SubtitleFragment[] = Array.from({ length: 12 }, (_, i) => ({
  text: `w${i}`,
  start: i * 180,
  end: i * 180 + 120,
}));

const PUNCT_ZH: SubtitleFragment[] = [
  { text: '大家好，今天我们来聊一个话题。', start: 0, end: 2500 },
  { text: '这件事其实并不复杂。', start: 2600, end: 4500 },
  { text: '关键在于我们如何理解它。', start: 4600, end: 7000 },
  { text: '接下来分三点说明。', start: 7100, end: 9000 },
  { text: '第一点是背景情况。', start: 9100, end: 11000 },
];

describe('needsResegment', () => {
  it('passes through polished unpunctuated Chinese phrases', () => {
    expect(needsResegment(POLISHED_UNPUNCT_ZH, 'zh-CN')).toBe(false);
  });

  it('passes through punctuated Chinese sentences', () => {
    expect(needsResegment(PUNCT_ZH, 'zh-CN')).toBe(false);
  });

  it('resegments word-level Chinese crumbs', () => {
    expect(needsResegment(WORD_LEVEL_ZH, 'zh-CN')).toBe(true);
  });

  it('resegments word-level English crumbs', () => {
    expect(needsResegment(WORD_LEVEL_EN, 'en')).toBe(true);
  });

  it('passes through when sample size is tiny (prefer no harm)', () => {
    const few: SubtitleFragment[] = [
      { text: '字', start: 0, end: 100 },
      { text: '词', start: 100, end: 200 },
    ];
    expect(needsResegment(few, 'zh-CN')).toBe(false);
  });
});

describe('shouldUseAsrRefine / detectSubtitleStyle', () => {
  it('does not force refine for kind=asr when cues are polished phrases', () => {
    expect(shouldUseAsrRefine(POLISHED_UNPUNCT_ZH, 'zh-CN', 'asr')).toBe(false);
    expect(detectSubtitleStyle(POLISHED_UNPUNCT_ZH, 'zh-CN')).toBe('polished');
  });

  it('refines word-level crumbs regardless of kind', () => {
    expect(shouldUseAsrRefine(WORD_LEVEL_ZH, 'zh-CN', undefined)).toBe(true);
    expect(shouldUseAsrRefine(WORD_LEVEL_EN, 'en', 'asr')).toBe(true);
    expect(detectSubtitleStyle(WORD_LEVEL_EN, 'en')).toBe('asr-like');
  });
});

describe('lightCleanFragments', () => {
  it('strips chevrons and drops empty cues without merging', () => {
    const input: SubtitleFragment[] = [
      { text: '>> Hello', start: 0, end: 1000 },
      { text: '   ', start: 1000, end: 2000 },
      { text: 'world >> there', start: 2000, end: 3000 },
    ];
    const out = lightCleanFragments(input);
    expect(out).toEqual([
      { text: 'Hello', start: 0, end: 1000 },
      { text: 'world there', start: 2000, end: 3000 },
    ]);
  });
});

describe('postProcessSubtitles', () => {
  it('does not cross-merge polished unpunctuated Chinese', () => {
    const out = postProcessSubtitles(POLISHED_UNPUNCT_ZH, 'zh-CN');
    expect(out.length).toBe(POLISHED_UNPUNCT_ZH.length);
    expect(out.map(f => f.text)).toEqual(POLISHED_UNPUNCT_ZH.map(f => f.text));
    expect(out.map(f => f.start)).toEqual(POLISHED_UNPUNCT_ZH.map(f => f.start));
  });

  it('merges word-level English crumbs', () => {
    const out = postProcessSubtitles(WORD_LEVEL_EN, 'en');
    expect(out.length).toBeLessThan(WORD_LEVEL_EN.length);
    expect(out.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
npx vitest run src/features/youtube/subtitle/processors/__tests__/subtitle-style.test.ts
```

Expected: FAIL（`needsResegment` / `postProcessSubtitles` 未导出或旧逻辑把 `POLISHED_UNPUNCT_ZH` 判成 asr-like）

- [ ] **Step 3: 实现 `subtitle-style.ts`**

按上面 Interfaces + 算法完整重写该文件。保留：

```ts
import type { SubtitleFragment } from '../utils/types';
import { refineAsrFragments } from './asr-merge';
import {
  CHEVRON_PATTERN,
  LEADING_CHEVRON_PATTERN,
} from './subtitle-constants';
import { getTextLength, isCJKLanguage } from './subtitle-utils';

export type SubtitleStyle = 'polished' | 'asr-like';
```

文件头注释改为说明：**按内容形态决定是否 resegment；标点不是中文主开关；kind 不强制 refine。**

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/features/youtube/subtitle/processors/__tests__/subtitle-style.test.ts
```

Expected: PASS（全部绿色）

- [ ] **Step 5: Commit**

```bash
git add \
  src/features/youtube/subtitle/processors/subtitle-style.ts \
  src/features/youtube/subtitle/processors/__tests__/subtitle-style.test.ts
git commit -m "$(cat <<'EOF'
fix(subtitle): resegment only fragmented cues by shape

Replace punctuation-led polished/asr-like routing with needsResegment:
phrase-level unpunctuated Chinese passes through; word-level crumbs still
refine. Add lightClean + postProcessSubtitles as the single post path.
EOF
)"
```

---

### Task 2: 生产 overlay 接线

**Files:**
- Modify: `src/features/YouTubeSubtitleOverlay.ts`（`fetchTrackFragments` 附近，约 45–48 import、864–879 后处理）

**Interfaces:**
- Consumes: `postProcessSubtitles(fragments, language)` from `./youtube/subtitle/processors/subtitle-style`
- 可移除对 `optimizeSubtitles` 的 import（若文件内无其它引用）
- `refineAsrFragments` 若仅用于后处理，改由 `postProcessSubtitles` 间接使用，overlay 可不再直接 import refine

- [ ] **Step 1: 改 import**

在 `YouTubeSubtitleOverlay.ts` 顶部：

删除（若存在且仅用于后处理）：

```ts
import { refineAsrFragments } from './youtube/subtitle/processors/asr-merge';
import { optimizeSubtitles } from './youtube/subtitle/processors/subtitle-optimizer';
```

改为：

```ts
import { postProcessSubtitles } from './youtube/subtitle/processors/subtitle-style';
```

- [ ] **Step 2: 改 `fetchTrackFragments` 后处理**

将：

```ts
        const fragments = parseYouTubeSubtitleEvents(events, track.languageCode);
        const language = track.languageCode || 'en';

        // ASR auto-captions: B+ refine (sentence split + adjacent merge).
        // Human captions: sentence optimizer.
        // This is the real production path — SubtitleController is not used by the overlay.
        return track.kind === 'asr'
            ? refineAsrFragments(fragments, language)
            : optimizeSubtitles(fragments, language);
```

替换为：

```ts
        const fragments = parseYouTubeSubtitleEvents(events, track.languageCode);
        const language = track.languageCode || 'en';

        // Shape-based post-process (author + ASR share the same gate):
        // polished phrase tracks pass through; only fragmented cues refine.
        return postProcessSubtitles(fragments, language);
```

- [ ] **Step 3: 静态确认无残留错误 import**

```bash
rg -n "optimizeSubtitles|refineAsrFragments|postProcessSubtitles" src/features/YouTubeSubtitleOverlay.ts
```

Expected: 仅 `postProcessSubtitles` 出现（无 optimize/refine 直接引用）

- [ ] **Step 4: Commit**

```bash
git add src/features/YouTubeSubtitleOverlay.ts
git commit -m "$(cat <<'EOF'
fix(yt-subtitle): route overlay post-process by content shape

Use postProcessSubtitles so production no longer kind-gates refine vs
optimize; polished unpunctuated human Chinese stays cue-faithful.
EOF
)"
```

---

### Task 3: Controller 对齐 + 测试更新

**Files:**
- Modify: `src/features/youtube/subtitle/core/controller.ts`（`setTrack` 后处理块）
- Modify: `src/features/youtube/subtitle/__tests__/core/controller.test.ts`（pseudo-manual / kind=asr 用例）

**Interfaces:**
- Consumes: `postProcessSubtitles` from `../processors/subtitle-style`
- 删除 controller 内对 `shouldUseAsrRefine` + 分支 refine/optimize 的组合（改为一行 postProcess）

- [ ] **Step 1: 改 controller import 与 setTrack**

将：

```ts
import { optimizeSubtitles } from '../processors/subtitle-optimizer';
import { refineAsrFragments } from '../processors/asr-merge';
import { shouldUseAsrRefine } from '../processors/subtitle-style';
```

改为：

```ts
import { postProcessSubtitles } from '../processors/subtitle-style';
```

将 setTrack 内：

```ts
      const language = track.languageCode || 'en';
      const useAsrRefine = shouldUseAsrRefine(
        result.fragments,
        language,
        track.kind
      );
      this.fragments = useAsrRefine
        ? refineAsrFragments(result.fragments, language)
        : optimizeSubtitles(result.fragments, language);
```

替换为：

```ts
      const language = track.languageCode || 'en';
      this.fragments = postProcessSubtitles(result.fragments, language);
```

删除过时注释（「True ASR kind=asr always refine / Polished → optimizer」），改为与 overlay 一致的 shape 注释。

- [ ] **Step 2: 更新 controller 测试期望**

在 `controller.test.ts` 中找到 pseudo-manual 中文用例（约「pseudo-manual」/「大家好今天」那段）：

**旧期望：** `fragments.length < pseudoManual.length`（必须合并）

**新期望（短语级应透传）：** 该 fixture 多数 cue 长于词级（5–11 字），按 Task 1 阈值应 **透传**：

```ts
      await controller.setTrack(zhTrack);

      const fragments = controller.getFragments();
      // Phrase-level unpunctuated Chinese: passthrough (no cross-cue merge)
      expect(fragments.length).toBe(pseudoManual.length);
      expect(fragments.map(f => f.text)).toEqual(pseudoManual.map(f => f.text));
```

删除对 `mega` 墙与 `maxLen<=40` 的 refine 专用断言（透传后无合并墙问题；若需保留防回归，可断言 `needsResegment(pseudoManual,'zh-CN') === false`）。

**`still refines when kind=asr` 用例：** 当前用的是 `word${i} more text here`（多词短语 + 600ms），按新规则可能 **不** resegment。改为真正词级：

```ts
    it('refines word-level crumbs even when kind is missing', async () => {
      const crumbTrack: CaptionTrack = {
        baseUrl: 'https://example.com/timedtext?v=test123&lang=en',
        languageCode: 'en',
        vssId: 'en.crumbs',
        trackName: 'English',
      };

      const crumbs: SubtitleFragment[] = Array.from({ length: 12 }, (_, i) => ({
        text: `w${i}`,
        start: i * 180,
        end: i * 180 + 120,
      }));

      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: crumbs,
        track: crumbTrack,
        videoId: 'test123',
      });

      await controller.setTrack(crumbTrack);

      const fragments = controller.getFragments();
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments.length).toBeLessThan(crumbs.length);
    });

    it('passes through phrase-level kind=asr without forced merge', async () => {
      const asrTrack: CaptionTrack = {
        baseUrl: 'https://example.com/timedtext?v=test123&lang=zh&kind=asr',
        languageCode: 'zh-CN',
        vssId: 'a.zh',
        trackName: 'Chinese (auto-generated)',
        kind: 'asr',
      };

      const phrases: SubtitleFragment[] = [
        { text: '他是中共历史上唯一的三朝帝师', start: 3700, end: 6800 },
        { text: '是三任总书记的幕后智囊', start: 6966, end: 9500 },
        { text: '充当党的理论的操盘手', start: 9733, end: 12433 },
        { text: '他也是中共历史上唯一的没有主政过一方', start: 12866, end: 16300 },
        { text: '仅仅是依靠智囊身份', start: 16400, end: 18000 },
        { text: '进入最高权力圈', start: 18000, end: 19733 },
      ];

      vi.spyOn(mockFetcher, 'fetchWithFallback').mockResolvedValue({
        fragments: phrases,
        track: asrTrack,
        videoId: 'test123',
      });

      await controller.setTrack(asrTrack);

      const fragments = controller.getFragments();
      expect(fragments.length).toBe(phrases.length);
      expect(fragments.map(f => f.text)).toEqual(phrases.map(f => f.text));
    });
```

（将原 `still refines when kind=asr` 换成上面两条，或等价改写。）

- [ ] **Step 3: 跑 controller + style 测试**

```bash
npx vitest run \
  src/features/youtube/subtitle/processors/__tests__/subtitle-style.test.ts \
  src/features/youtube/subtitle/__tests__/core/controller.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add \
  src/features/youtube/subtitle/core/controller.ts \
  src/features/youtube/subtitle/__tests__/core/controller.test.ts
git commit -m "$(cat <<'EOF'
fix(subtitle): align controller post-process with shape gate

Controller uses postProcessSubtitles; tests expect phrase passthrough and
word-level refine without kind forcing.
EOF
)"
```

---

### Task 4: optimizer 旁路说明 + 全量相关回归

**Files:**
- Modify: `src/features/youtube/subtitle/processors/subtitle-optimizer.ts`（仅文件头/入口注释，可选保留 CJK 安全网给直接调用者）
- 跑既有 optimizer / asr-merge 测试确保未误伤

- [ ] **Step 1: 在 `optimizeSubtitles` 文件头与 export 上注明**

在 `optimizeSubtitles` 上方注释增加：

```ts
/**
 * NOTE (2026-07-20): Production overlay/controller no longer route polished
 * tracks here. Use postProcessSubtitles() for display paths. This function
 * remains for direct callers / future mid-tier experiments.
 */
```

**不要删除** CJK `isPunctuationPoor` 安全网（直接调用 optimize 时仍可防墙）；生产成品轨已不进入此函数。

- [ ] **Step 2: 跑字幕相关测试包**

```bash
npx vitest run src/features/youtube/subtitle
```

Expected: PASS（若个别用例仍假设「kind=asr 必 refine」或「无标点中文必 refine」，按 Task 1 原则改期望为 shape 结果，禁止改回强制 kind）

- [ ] **Step 3: Commit（若有注释或测试微调）**

```bash
git add \
  src/features/youtube/subtitle/processors/subtitle-optimizer.ts \
  src/features/youtube/subtitle
git commit -m "$(cat <<'EOF'
docs(subtitle): note optimizeSubtitles is off production display path

Keep optimizer for direct use; display routing is postProcessSubtitles only.
EOF
)"
```

若 working tree 干净（仅注释已在前序 commit），可 skip 空 commit。

---

### Task 5: 手工验收清单（不写代码则记结果）

**Files:** 无强制代码；可选在对话中回报。

- [ ] **Step 1: 逻辑自检（可用 node/vitest 已覆盖）**

确认：

| 样本 | 期望 |
|------|------|
| `POLISHED_UNPUNCT_ZH` | 透传 |
| 用户 SRT 形态（avg≈12 字） | 透传 |
| `WORD_LEVEL_ZH` / `WORD_LEVEL_EN` | refine |
| `kind=asr` + 短语 | 透传 |
| `kind` 空 + 词级 | refine |

- [ ] **Step 2:（可选）浏览器** 打开带作者中文字幕的 YouTube，开自渲染：字幕条数/断句应接近原生作者轨，不再出现两句粘成一堵墙。

- [ ] **Step 3: 最终 commit 仅当有未提交修复**；否则报告完成。

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|-----------|------|
| 成品无标点中文透传 | Task 1 测试 + 算法；Task 2/3 接线 |
| 词级才 refine | Task 1 `WORD_LEVEL_*` |
| 标点不主开关 | Task 1 去掉 isPunctuationPoor 主路径 |
| kind 不强制 | Task 1 `shouldUseAsrRefine` 忽略 kind；Task 3 asr 短语透传 |
| overlay 生产路径 | Task 2 |
| controller 一致 | Task 3 |
| optimize 不作为成品默认 | Task 2/3 移除调用；Task 4 注释 |
| lightClean 不跨条合并 | Task 1 lightClean 测试 |
| 不重写 refine 内部 | 全任务未改 asr-merge 公式 |
| 验收金标准 | Task 1 `POLISHED_UNPUNCT_ZH` + Task 5 |

**Placeholder scan:** 无 TBD；阈值与完整测试文件已写出。  
**Type consistency:** `postProcessSubtitles` / `needsResegment` / `lightCleanFragments` 签名在 Task 1 定义，Task 2–3 只消费这些名字。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-subtitle-passthrough-by-shape.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每任务新开 subagent，任务间审查，迭代快  
2. **Inline Execution** — 本会话按 executing-plans 批量执行并设检查点  

**Which approach?**
