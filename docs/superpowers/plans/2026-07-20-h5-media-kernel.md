# H5 Media Kernel (方案 E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 VidBoost 通用 h5player 增加可开关的 MAIN 世界轻量媒体内核（登记 / 选主 / 原始 setter 调速 + sticky），使大部分 H5 视频站倍速与 seek 稳定生效，并与 YT/BB/抖音专用能力零回归共存。

**Architecture:** Isolated 侧 `H5Enhancer` 只发意图；新建 `MediaBridge` 与 MAIN `media-kernel` 通过 `window.postMessage` 通信。MAIN 内核含 Registry、RateController（L0/L1）、Escalator（L2 strict）。`safe` 模式降级为现有 `VideoController` 直写。manifest 为 content + kernel 开启 `all_frames: true`。

**Tech Stack:** TypeScript、Vite IIFE page bundle（与 `vite.douyinplayback.config.ts` 同模式）、Chrome/Firefox MV3 content_scripts `world: "MAIN"`、现有 settings / i18n / Svelte popup。

**Spec:** `docs/superpowers/specs/2026-07-20-h5-media-kernel-design.md`

## Global Constraints

- 不整段复制 `/Users/tune/Downloads/h5player-master` 源码（GPL）；只自研精简实现。
- 第一期实现 L0 + L1 + L2；不做 L3、默认 `hackAttachShadow`、下载/滤镜/进度记忆。
- 默认 `h5_config.compatMode = 'compat'`；未配置迁移到 `compat`。
- 抖音 host：rate 仍走现有 `playbackRateGuard`，通用内核 `ownsRate: false`。
- YouTube / B 站 / 抖音现有功能零回归。
- `h5_config` 必须进入 `CONTENT_SETTINGS_KEYS`，否则 content 读不到模式（现状缺口，本计划一并修）。
- 纯逻辑单测用 Node 内置 `node:test` + `npx --yes tsx --test`（仓库未装 vitest）。
- 中文 UI 文案；i18n 同时补中英 key。
- 完成声明前：`npm run check` + `npm run build:chrome` + package verify + 手动抽检记录。

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/features/media-kernel/protocol.ts` | 消息常量、类型、sanitize、mode 归一化（isolated + MAIN 共享） |
| `src/features/media-kernel/pickPrimary.ts` | 纯函数：从候选 video 打分选主 |
| `src/features/media-kernel/stickyPolicy.ts` | 纯函数：是否偏离、是否应纠正、纠正次数封顶 |
| `src/features/media-kernel/registry.ts` | MAIN：媒体登记与主视频选择 |
| `src/features/media-kernel/rateController.ts` | MAIN：原始 descriptor 写入 + L1 sticky |
| `src/features/media-kernel/escalator.ts` | MAIN：L2 强 sticky / 模式切换 |
| `src/features/media-kernel/mediaKernel.page.ts` | MAIN 入口：装 Registry/Controller、收发 postMessage |
| `src/lib/MediaBridge.ts` | Isolated：ping/configure/setRate/seek、超时降级 |
| `src/lib/VideoController.ts` | 保留降级 setSpeed/seek/fullscreen；不删 API |
| `src/features/H5Enhancer.ts` | 改走 Bridge；读 rate 优先 kernel state |
| `src/lib/settings.ts` | `H5Config.compatMode`、默认值、`CONTENT_SETTINGS_KEYS` 加 `h5_config` |
| `src/popup/H5Settings.svelte` | 三档兼容模式 UI |
| `src/lib/i18n.ts` | 新文案 key |
| `src/content/index.ts` / `index.firefox.ts` | 确保 settings 含 `h5_config` 后 H5 收到 configure（经 updateSettings） |
| `public/manifest.json` | MAIN kernel 脚本 + `all_frames` |
| `vite.mediakernel.config.ts` | 打包 `assets/media-kernel.page.js` |
| `package.json` | `build:chrome` 链增加 media-kernel 构建；`test:media-kernel` |
| `scripts/verify-chrome-package.mjs` | REQUIRED_FILES 增加 kernel 产物 |
| `src/features/media-kernel/__tests__/*.test.ts` | protocol / pickPrimary / stickyPolicy |
| `docs/regression/h5-media-kernel-manual-checklist.md` | 手动抽检清单 |

---

### Task 1: Protocol + pure helpers + unit tests

**Files:**
- Create: `src/features/media-kernel/protocol.ts`
- Create: `src/features/media-kernel/pickPrimary.ts`
- Create: `src/features/media-kernel/stickyPolicy.ts`
- Create: `src/features/media-kernel/__tests__/protocol.test.ts`
- Create: `src/features/media-kernel/__tests__/pickPrimary.test.ts`
- Create: `src/features/media-kernel/__tests__/stickyPolicy.test.ts`
- Modify: `package.json`（增加 `test:media-kernel` script）

**Interfaces:**
- Produces:
  - `MEDIA_KERNEL_CHANNEL = 'vidboost:media-kernel'`
  - `MEDIA_KERNEL_ISOLATED_SOURCE = 'vidboost-media-kernel-isolated'`
  - `MEDIA_KERNEL_PAGE_SOURCE = 'vidboost-media-kernel-page'`
  - `MEDIA_KERNEL_PROTOCOL_VERSION = 1`
  - `type H5CompatMode = 'safe' | 'compat' | 'strict'`
  - `normalizeH5CompatMode(value: unknown, fallback: H5CompatMode = 'compat'): H5CompatMode`
  - `type MediaKernelToPage = { source; channel; version; type; reqId?; payload? }`
  - `type MediaKernelToIsolated = { source; channel; version; type; reqId?; payload? }`
  - `isMediaKernelEnvelope(data: unknown, expectedSource: string): data is Record<string, unknown>`
  - `pickPrimaryVideo(candidates: PrimaryVideoCandidate[]): PrimaryVideoCandidate | null`
  - `type PrimaryVideoCandidate = { id: string; width: number; height: number; paused: boolean; ended: boolean; visible: boolean; focusedBoost?: number }`
  - `shouldReconcileRate(actual: number, target: number, epsilon: number): boolean`
  - `clampReconcileCount(count: number, cap: number): number`
  - `DEFAULT_STICKY_MS = 3000`, `DEFAULT_RATE_EPSILON = 0.05`, `DEFAULT_RECONCILE_CAP = 30`

- [ ] **Step 1: Write failing tests for protocol + pickPrimary + stickyPolicy**

Create `src/features/media-kernel/__tests__/protocol.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeH5CompatMode,
  isMediaKernelEnvelope,
  MEDIA_KERNEL_CHANNEL,
  MEDIA_KERNEL_PAGE_SOURCE,
  MEDIA_KERNEL_PROTOCOL_VERSION
} from '../protocol.ts';

describe('normalizeH5CompatMode', () => {
  it('accepts safe/compat/strict', () => {
    assert.equal(normalizeH5CompatMode('safe'), 'safe');
    assert.equal(normalizeH5CompatMode('compat'), 'compat');
    assert.equal(normalizeH5CompatMode('strict'), 'strict');
  });

  it('falls back to compat for unknown', () => {
    assert.equal(normalizeH5CompatMode(undefined), 'compat');
    assert.equal(normalizeH5CompatMode('nope'), 'compat');
    assert.equal(normalizeH5CompatMode(1, 'safe'), 'safe');
  });
});

describe('isMediaKernelEnvelope', () => {
  it('rejects wrong source/channel/version', () => {
    assert.equal(
      isMediaKernelEnvelope(
        {
          source: MEDIA_KERNEL_PAGE_SOURCE,
          channel: MEDIA_KERNEL_CHANNEL,
          version: MEDIA_KERNEL_PROTOCOL_VERSION,
          type: 'pong'
        },
        MEDIA_KERNEL_PAGE_SOURCE
      ),
      true
    );
    assert.equal(
      isMediaKernelEnvelope(
        {
          source: 'other',
          channel: MEDIA_KERNEL_CHANNEL,
          version: MEDIA_KERNEL_PROTOCOL_VERSION,
          type: 'pong'
        },
        MEDIA_KERNEL_PAGE_SOURCE
      ),
      false
    );
  });
});
```

Create `src/features/media-kernel/__tests__/pickPrimary.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrimaryVideo, type PrimaryVideoCandidate } from '../pickPrimary.ts';

function v(partial: Partial<PrimaryVideoCandidate> & { id: string }): PrimaryVideoCandidate {
  return {
    width: 640,
    height: 360,
    paused: true,
    ended: false,
    visible: true,
    focusedBoost: 0,
    ...partial
  };
}

describe('pickPrimaryVideo', () => {
  it('returns null for empty list', () => {
    assert.equal(pickPrimaryVideo([]), null);
  });

  it('prefers playing visible larger video', () => {
    const smallPlaying = v({ id: 'a', width: 160, height: 90, paused: false });
    const largePaused = v({ id: 'b', width: 1280, height: 720, paused: true });
    const largePlaying = v({ id: 'c', width: 1280, height: 720, paused: false });
    assert.equal(pickPrimaryVideo([smallPlaying, largePaused, largePlaying])?.id, 'c');
  });

  it('ignores invisible candidates when any visible exists', () => {
    const hidden = v({ id: 'h', width: 1920, height: 1080, visible: false, paused: false });
    const visible = v({ id: 'v', width: 640, height: 360, visible: true, paused: false });
    assert.equal(pickPrimaryVideo([hidden, visible])?.id, 'v');
  });
});
```

Create `src/features/media-kernel/__tests__/stickyPolicy.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldReconcileRate,
  clampReconcileCount,
  DEFAULT_RATE_EPSILON
} from '../stickyPolicy.ts';

describe('shouldReconcileRate', () => {
  it('true when drift exceeds epsilon', () => {
    assert.equal(shouldReconcileRate(1, 2, DEFAULT_RATE_EPSILON), true);
    assert.equal(shouldReconcileRate(2.0, 2.02, DEFAULT_RATE_EPSILON), false);
  });
});

describe('clampReconcileCount', () => {
  it('caps count', () => {
    assert.equal(clampReconcileCount(40, 30), 30);
    assert.equal(clampReconcileCount(5, 30), 5);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (modules missing)**

Run:

```bash
npx --yes tsx --test src/features/media-kernel/__tests__/protocol.test.ts src/features/media-kernel/__tests__/pickPrimary.test.ts src/features/media-kernel/__tests__/stickyPolicy.test.ts
```

Expected: FAIL with module not found / cannot resolve.

- [ ] **Step 3: Implement pure modules**

`src/features/media-kernel/protocol.ts`:

```ts
export const MEDIA_KERNEL_CHANNEL = 'vidboost:media-kernel' as const;
export const MEDIA_KERNEL_ISOLATED_SOURCE = 'vidboost-media-kernel-isolated' as const;
export const MEDIA_KERNEL_PAGE_SOURCE = 'vidboost-media-kernel-page' as const;
export const MEDIA_KERNEL_PROTOCOL_VERSION = 1 as const;

export type H5CompatMode = 'safe' | 'compat' | 'strict';

export type MediaKernelCommandType =
  | 'ping'
  | 'configure'
  | 'setPlaybackRate'
  | 'seek'
  | 'getState';

export type MediaKernelEventType =
  | 'pong'
  | 'ack'
  | 'state'
  | 'kernel-ready';

export type MediaKernelConfigurePayload = {
  mode: H5CompatMode;
  stickyMs: number;
  maxRate: number;
  rateEpsilon: number;
  ownsRate: boolean;
  enabled: boolean;
};

export type MediaKernelStatePayload = {
  hasVideo: boolean;
  rate: number;
  escalated: boolean;
  mode: H5CompatMode;
};

export function normalizeH5CompatMode(
  value: unknown,
  fallback: H5CompatMode = 'compat'
): H5CompatMode {
  if (value === 'safe' || value === 'compat' || value === 'strict') return value;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function isMediaKernelEnvelope(
  data: unknown,
  expectedSource: string
): data is Record<string, unknown> {
  if (!isRecord(data)) return false;
  if (data.source !== expectedSource) return false;
  if (data.channel !== MEDIA_KERNEL_CHANNEL) return false;
  if (data.version !== MEDIA_KERNEL_PROTOCOL_VERSION) return false;
  if (typeof data.type !== 'string' || !data.type) return false;
  return true;
}

export function buildIsolatedMessage(
  type: MediaKernelCommandType,
  reqId: string,
  payload?: Record<string, unknown>
) {
  return {
    source: MEDIA_KERNEL_ISOLATED_SOURCE,
    channel: MEDIA_KERNEL_CHANNEL,
    version: MEDIA_KERNEL_PROTOCOL_VERSION,
    type,
    reqId,
    payload: payload ?? {}
  };
}

export function buildPageMessage(
  type: MediaKernelEventType,
  reqId: string | undefined,
  payload?: Record<string, unknown>
) {
  return {
    source: MEDIA_KERNEL_PAGE_SOURCE,
    channel: MEDIA_KERNEL_CHANNEL,
    version: MEDIA_KERNEL_PROTOCOL_VERSION,
    type,
    reqId,
    payload: payload ?? {}
  };
}
```

`src/features/media-kernel/pickPrimary.ts`:

```ts
export type PrimaryVideoCandidate = {
  id: string;
  width: number;
  height: number;
  paused: boolean;
  ended: boolean;
  visible: boolean;
  focusedBoost?: number;
};

function area(c: PrimaryVideoCandidate): number {
  return Math.max(0, c.width) * Math.max(0, c.height);
}

function score(c: PrimaryVideoCandidate): number {
  if (!c.visible || c.ended) return -1;
  let s = area(c);
  if (!c.paused) s += 1_000_000_000;
  s += (c.focusedBoost ?? 0) * 10_000;
  // Prefer reasonable main sizes over tiny thumbs when both paused.
  if (c.width < 16 || c.height < 16) s -= 1_000_000;
  return s;
}

export function pickPrimaryVideo(
  candidates: PrimaryVideoCandidate[]
): PrimaryVideoCandidate | null {
  if (!candidates.length) return null;
  const visible = candidates.filter((c) => c.visible && !c.ended);
  const pool = visible.length > 0 ? visible : candidates.filter((c) => !c.ended);
  if (!pool.length) return null;
  return pool.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
}
```

`src/features/media-kernel/stickyPolicy.ts`:

```ts
export const DEFAULT_STICKY_MS = 3000;
export const DEFAULT_RATE_EPSILON = 0.05;
export const DEFAULT_RECONCILE_CAP = 30;

export function shouldReconcileRate(
  actual: number,
  target: number,
  epsilon: number = DEFAULT_RATE_EPSILON
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return false;
  return Math.abs(actual - target) > epsilon;
}

export function clampReconcileCount(count: number, cap: number = DEFAULT_RECONCILE_CAP): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  if (!Number.isFinite(cap) || cap < 0) return 0;
  return Math.min(count, cap);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx --yes tsx --test src/features/media-kernel/__tests__/protocol.test.ts src/features/media-kernel/__tests__/pickPrimary.test.ts src/features/media-kernel/__tests__/stickyPolicy.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Add npm script and commit**

In `package.json` scripts add:

```json
"test:media-kernel": "npx --yes tsx --test src/features/media-kernel/__tests__/*.test.ts"
```

```bash
git add package.json src/features/media-kernel/
git commit -m "feat(media-kernel): add protocol and pure selection/sticky helpers"
```

---

### Task 2: Settings + i18n + H5Settings UI for compat mode

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/i18n.ts`
- Modify: `src/popup/H5Settings.svelte`

**Interfaces:**
- Produces: `H5Config.compatMode?: H5CompatMode`；默认 `'compat'`；`CONTENT_SETTINGS_KEYS` 含 `'h5_config'`

- [ ] **Step 1: Extend H5Config and defaults**

In `src/lib/settings.ts`:

```ts
export type H5CompatMode = 'safe' | 'compat' | 'strict';

export type H5Config = {
    speedStep?: number;
    maxSpeed?: number;
    restoreSpeed?: number;
    seekForward?: number;
    seekRewind?: number;
    zxcControlsEnabled?: boolean;
    blockNumKeys?: boolean;
    /** safe=isolated only; compat=MAIN sticky; strict=MAIN strong sticky */
    compatMode?: H5CompatMode;
};
```

`DEFAULT_SETTINGS.h5_config` 增加 `compatMode: 'compat'`。

`CONTENT_SETTINGS_KEYS` 数组中在 `'h5_enabled'` 后加入 `'h5_config'`：

```ts
export const CONTENT_SETTINGS_KEYS = [
    'enabled',
    'h5_enabled',
    'h5_config',
    // ...rest unchanged
] as const satisfies SettingsKey[];
```

确认 `resolveSettings` 对 `h5_config` 仍是 shallow merge（已有 `{ ...DEFAULT, ...source.h5_config }`）；无需特殊处理即可带上 `compatMode`。

- [ ] **Step 2: i18n keys**

在 `src/lib/i18n.ts` 的 key 联合类型与中英文字典增加（命名按文件现有风格对齐，实现时搜 `h5Zxc` / `h5Speed` 邻域插入）：

| key | en | zh |
|-----|----|----|
| `h5CompatMode` | Compatibility mode | 兼容模式 |
| `h5CompatModeDesc` | How aggressively VidBoost holds playback speed on stubborn sites. | 在会回写倍速的站点上，如何稳住播放速度。 |
| `h5CompatSafe` | Safe (legacy) | 安全（旧行为） |
| `h5CompatSafeDesc` | Isolated writes only. Least site interference. | 仅隔离世界直写，对页面干扰最小。 |
| `h5CompatCompat` | Compatible (recommended) | 兼容（推荐） |
| `h5CompatCompatDesc` | Page-world control with short sticky hold after you change speed. | 页面世界调速，并在改速后短时守住。 |
| `h5CompatStrict` | Strict | 强兼容 |
| `h5CompatStrictDesc` | Keeps your speed until you change it again. More aggressive. | 一直守住当前倍速直到你再次修改，更激进。 |

- [ ] **Step 3: H5Settings UI**

在 `H5Settings.svelte`：

1. `let compatMode: 'safe' | 'compat' | 'strict' = 'compat'`
2. `onMount` 从 `res.h5_config.compatMode` 读取，缺省 `DEFAULT_SETTINGS.h5_config.compatMode`
3. 保存 payload 的 `h5_config` 加入 `compatMode`
4. UI：在 ZXC 开关附近增加分段控件或 `<select>` 三档 + 说明（用 `ToggleItem` 布局风格的小卡片亦可）

示例绑定：

```svelte
<label class="block text-sm font-medium ...">{t('h5CompatMode')}</label>
<p class="text-xs opacity-70 mb-2">{t('h5CompatModeDesc')}</p>
<select bind:value={compatMode} class="...">
  <option value="safe">{t('h5CompatSafe')}</option>
  <option value="compat">{t('h5CompatCompat')}</option>
  <option value="strict">{t('h5CompatStrict')}</option>
</select>
```

- [ ] **Step 4: Typecheck**

```bash
npm run check
```

Expected: 无新增错误（允许仓库原有无关告警，但本次改动相关须干净）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/lib/i18n.ts src/popup/H5Settings.svelte
git commit -m "feat(h5): add compat mode setting and load h5_config in content"
```

---

### Task 3: MAIN MediaRegistry + RateController + Escalator + page entry

**Files:**
- Create: `src/features/media-kernel/registry.ts`
- Create: `src/features/media-kernel/rateController.ts`
- Create: `src/features/media-kernel/escalator.ts`
- Create: `src/features/media-kernel/mediaKernel.page.ts`

**Interfaces:**
- Consumes: protocol、pickPrimary、stickyPolicy
- Produces: MAIN IIFE 副作用启动；响应 isolated 消息

- [ ] **Step 1: Implement registry.ts**

要点（完整实现按此语义写）：

```ts
// Pseudo-structure — implement fully in file
export class MediaRegistry {
  private videos = new Set<HTMLVideoElement>();
  private focusedBoost = new WeakMap<HTMLVideoElement, number>();

  start(): void {
    // capture play/playing/loadedmetadata on window
    // MutationObserver on documentElement when available
    // initial scan when document exists
  }

  stop(): void { /* remove listeners, disconnect MO */ }

  register(el: HTMLVideoElement): void { /* add if HTMLVideoElement */ }

  getPrimary(): HTMLVideoElement | null {
    // map Set → PrimaryVideoCandidate via getBoundingClientRect + visible heuristic
    // pickPrimaryVideo → element
  }

  noteUserFocus(el: Element | null): void { /* boost ancestors' video */ }
}
```

可见性：`width>16 && height>16` 且 `checkVisibility?.()` 若存在则采用。  
Open shadow：递归 `element.shadowRoot` 扫 `video`（不做 attachShadow hack）。

- [ ] **Step 2: Implement rateController.ts**

```ts
export class RateController {
  // hold: HTMLMediaElement.prototype playbackRate + defaultPlaybackRate descriptors (captured at construct)
  // targetRate, stickyUntil, reconcileCount, mode, ownsRate, enabled, stickyMs, epsilon, maxRate

  applyConfigure(cfg: MediaKernelConfigurePayload): void
  setPlaybackRate(video: HTMLVideoElement, rate: number): boolean
  seek(video: HTMLVideoElement, deltaSec: number): boolean
  getNativeRate(video: HTMLVideoElement): number
  onRateChange(video: HTMLVideoElement): void  // L1 reconcile if within sticky window
  tick(): void // optional rAF/interval reconcile while sticky active
  clearSticky(): void
}
```

写入必须：

```ts
playbackRateDesc.set!.call(video, clampedRate);
defaultPlaybackRateDesc?.set?.call(video, clampedRate);
```

`ownsRate === false` 时：`setPlaybackRate` / sticky 全部 no-op 并返回 false（供抖音 defer）。

- [ ] **Step 3: Implement escalator.ts**

```ts
export class Escalator {
  // When mode==='strict' and ownsRate: after setPlaybackRate, keep reconciling
  // until clear / mode change / video detach / target set to same by user again.
  // Uses RateController APIs; does not hook Object.defineProperty (L3 out of scope).
  setMode(mode: H5CompatMode): void
  onUserSetRate(rate: number): void
  onVideoGone(): void
  shouldStaySticky(): boolean // strict → true after user set until cleared
}
```

行为表：

| mode | sticky |
|------|--------|
| safe | 不在 MAIN 调速（page 收到 configure 后 enabled 锁逻辑关） |
| compat | stickyMs 窗口 |
| strict | 持续到下次用户改速或 disable |

- [ ] **Step 4: Implement mediaKernel.page.ts**

```ts
(() => {
  const g = window as unknown as Record<string, unknown>;
  const BOOT = '__VB_MEDIA_KERNEL__';
  if (g[BOOT]) return;
  g[BOOT] = true;

  const registry = new MediaRegistry();
  const rateController = new RateController();
  const escalator = new Escalator(rateController);
  registry.start();

  window.postMessage(buildPageMessage('kernel-ready', undefined, { version: MEDIA_KERNEL_PROTOCOL_VERSION }), '*');

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isMediaKernelEnvelope(event.data, MEDIA_KERNEL_ISOLATED_SOURCE)) return;
    const { type, reqId, payload } = event.data as {
      type: string;
      reqId?: string;
      payload?: Record<string, unknown>;
    };

    // handle ping → pong with hasVideo/rate
    // configure → rateController.applyConfigure + escalator.setMode
    // setPlaybackRate → if !ownsRate || mode safe: ack ok:false reason
    //   else set on registry.getPrimary(), escalator.onUserSetRate
    // seek → currentTime delta on primary
    // getState → state payload
    // always reply with buildPageMessage('ack'|'state'|'pong', reqId, ...)
  });
})();
```

`postMessage` 目标：与抖音 guard 一致可用 `window.location.origin`；若 origin 为 `'null'`（sandbox）则用 `'*'`。推荐：

```ts
function postToIsolated(msg: ReturnType<typeof buildPageMessage>) {
  try {
    window.postMessage(msg, window.location.origin === 'null' ? '*' : window.location.origin);
  } catch {
    window.postMessage(msg, '*');
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/features/media-kernel/registry.ts src/features/media-kernel/rateController.ts src/features/media-kernel/escalator.ts src/features/media-kernel/mediaKernel.page.ts
git commit -m "feat(media-kernel): implement MAIN registry, rate control, and page entry"
```

---

### Task 4: MediaBridge + H5Enhancer integration + douyin defer

**Files:**
- Create: `src/lib/MediaBridge.ts`
- Modify: `src/features/H5Enhancer.ts`
- Modify: `src/lib/VideoController.ts`（仅当需要 `getPlaybackRate` 辅助时小改；优先不改公共 API）

**Interfaces:**
- Consumes: protocol types；H5Config
- Produces:
  - `MediaBridge.getInstance()`
  - `await bridge.ensureReady(timeoutMs?: number): boolean`
  - `bridge.configure(cfg): void`
  - `bridge.setPlaybackRate(rate): Promise<boolean>`
  - `bridge.seek(deltaSec): Promise<boolean>`
  - `bridge.getState(): Promise<MediaKernelStatePayload | null>`
  - `bridge.hasKernel: boolean`

- [ ] **Step 1: Implement MediaBridge.ts**

关键行为：

```ts
const DEFAULT_TIMEOUT_MS = 50;

export class MediaBridge {
  static getInstance(): MediaBridge { /* singleton */ }

  private pending = new Map<string, {
    resolve: (v: unknown) => void;
    timer: number;
  }>();
  private kernelReady = false;
  private lastState: MediaKernelStatePayload | null = null;

  constructor() {
    window.addEventListener('message', this.onMessage);
    // optional: listen kernel-ready
  }

  private onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (!isMediaKernelEnvelope(event.data, MEDIA_KERNEL_PAGE_SOURCE)) return;
    // resolve pending by reqId; set kernelReady on pong/kernel-ready
  };

  private request(type, payload, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Record<string, unknown> | null> {
    // reqId = `${Date.now()}-${Math.random()}`
    // postMessage buildIsolatedMessage
    // timeout → resolve null
  }

  async ensureReady(timeoutMs = 80): Promise<boolean> {
    if (this.kernelReady) return true;
    const res = await this.request('ping', {}, timeoutMs);
    this.kernelReady = Boolean(res);
    return this.kernelReady;
  }

  configure(payload: MediaKernelConfigurePayload): void {
    void this.request('configure', payload as unknown as Record<string, unknown>, 100);
  }

  async setPlaybackRate(rate: number): Promise<boolean> {
    const res = await this.request('setPlaybackRate', { rate }, 80);
    return Boolean(res && (res as { ok?: boolean }).ok !== false && res !== null);
    // Treat missing kernel as false so caller falls back
  }

  async seek(deltaSec: number): Promise<boolean> { /* analogous */ }

  async getState(): Promise<MediaKernelStatePayload | null> { /* ... */ }
}
```

注意：`request` 在无内核时必须超时返回 null，不能永久挂起。

- [ ] **Step 2: Wire H5Enhancer**

在 `H5Enhancer` 内：

1. 持有 `private bridge = MediaBridge.getInstance()` 与 `private compatMode: H5CompatMode = 'compat'`。
2. `updateLocalConfig` 从 `h5_config` 读 `compatMode`（`normalizeH5CompatMode`）。
3. 新增 `private pushKernelConfig()`：

```ts
private isDouyinHost(): boolean {
  return isSiteHost('douyin');
}

private pushKernelConfig() {
  const ownsRate = !this.isDouyinHost();
  const mode = this.compatMode;
  this.bridge.configure({
    mode,
    stickyMs: 3000,
    maxRate: this.config.maxSpeed,
    rateEpsilon: 0.05,
    ownsRate,
    enabled: this.enabled && mode !== 'safe'
  });
}
```

4. `mount()`：`void this.bridge.ensureReady().then(() => this.pushKernelConfig())`；保留抖音 guard 安装。
5. `applySpeed(rate)` 改为：

```ts
private async applySpeed(rate: number) {
  this.syncSitePlaybackGuard(rate);
  const useKernel = this.compatMode !== 'safe' && !this.isDouyinHost();
  let ok = false;
  if (useKernel) {
    ok = await this.bridge.setPlaybackRate(rate);
  }
  if (!ok) {
    this.videoCtrl.setSpeed(rate);
  }
  this.lastAppliedRate = rate;
}
```

6. `handleSeek` 类似：kernel seek 失败则 `videoCtrl.seek`。
7. 数字键 / C X Z：在需要读当前 rate 时：
   - 优先 `this.lastAppliedRate` 或 `await bridge.getState()` 的 rate；
   - 若无则 `this.videoCtrl.video?.playbackRate`。
8. Z 键 toggle 逻辑改用 `lastAppliedRate` / state，避免 isolated 读到被站点锁死的假 1x。
9. 快捷键 handler 若变 async：仍同步 `return true` 在「将处理」时；先判断是否有 video（`videoCtrl.video` **或** 最近 state.hasVideo）。为减少 async 复杂度，允许：

```ts
// fire-and-forget with sync presence check
if (!this.videoCtrl.video && !this.bridge.hasKernel) return false;
void this.applySpeed(rate);
this.showFeedback(...);
return true;
```

更好：`applySpeed` 保持同步封装：

```ts
private applySpeed(rate: number) {
  this.syncSitePlaybackGuard(rate);
  this.lastAppliedRate = rate;
  if (this.compatMode === 'safe' || this.isDouyinHost()) {
    this.videoCtrl.setSpeed(rate);
    return;
  }
  void this.bridge.setPlaybackRate(rate).then((ok) => {
    if (!ok) this.videoCtrl.setSpeed(rate);
  });
}
```

10. `unmount` / 设置变更时 `pushKernelConfig()`；`enabled=false` 时 configure `enabled: false`。

- [ ] **Step 3: Douyin regression check (code path)**

确认：`isSiteHost('douyin')` 时 `ownsRate: false` 且 `applySpeed` 走 `videoCtrl.setSpeed` + 现有 `pushDouyinPlaybackRateGuardConfig`。不要删除 douyin MAIN 脚本。

- [ ] **Step 4: check + commit**

```bash
npm run check
git add src/lib/MediaBridge.ts src/features/H5Enhancer.ts src/lib/VideoController.ts
git commit -m "feat(h5): route speed/seek through MediaBridge with safe fallback"
```

---

### Task 5: Build pipeline + manifest all_frames + package verify

**Files:**
- Create: `vite.mediakernel.config.ts`
- Modify: `package.json`（`build:chrome` 增加 vite media-kernel）
- Modify: `public/manifest.json`
- Modify: `scripts/verify-chrome-package.mjs`

**Interfaces:**
- Produces: `dist/assets/media-kernel.page.js`；manifest 注册 MAIN + all_frames

- [ ] **Step 1: vite.mediakernel.config.ts**

复制 `vite.douyinplayback.config.ts` 模式：

```ts
import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
            entry: path.resolve(__dirname, 'src/features/media-kernel/mediaKernel.page.ts'),
            name: 'VidBoostMediaKernelPage',
            formats: ['iife'],
            fileName: () => 'assets/media-kernel.page.js'
        },
        rollupOptions: {
            output: {
                extend: true
            }
        }
    }
})
```

- [ ] **Step 2: package.json build:chrome**

在 `vite.douyinplayback.config.ts` 一段后追加：

```text
&& vite build --config vite.mediakernel.config.ts
```

- [ ] **Step 3: public/manifest.json**

1. 主 content_scripts 条目（`assets/content.js`）增加 `"all_frames": true`。
2. 新增 MAIN 条目（可紧挨 douyin 段）：

```json
{
  "matches": ["<all_urls>"],
  "js": ["assets/media-kernel.page.js"],
  "run_at": "document_start",
  "all_frames": true,
  "world": "MAIN"
}
```

3. 现有 bilibili/douyin 条目建议同样加 `"all_frames": true` 仅当需要；**默认只改通用 content + media-kernel**，避免扩大 douyin/bb 注入面。保持 bb/douyin 原 matches。

- [ ] **Step 4: verify-chrome-package.mjs**

`REQUIRED_FILES` 增加 `'assets/media-kernel.page.js'`。

可选增强 assert：content_scripts 中存在 `world==='MAIN'` 且 js 含 media-kernel，且 content.js 条目 `all_frames === true`。

- [ ] **Step 5: Build and verify**

```bash
npm run build:chrome
npm run verify:chrome-package
```

Expected: 构建成功；verify 通过；`dist/assets/media-kernel.page.js` 存在；`dist/manifest.json` 含 MAIN kernel 与 all_frames。

- [ ] **Step 6: Commit**

```bash
git add vite.mediakernel.config.ts package.json public/manifest.json scripts/verify-chrome-package.mjs
git commit -m "build: ship MAIN media-kernel page script with all_frames"
```

---

### Task 6: Manual checklist + regression hardening + final verification

**Files:**
- Create: `docs/regression/h5-media-kernel-manual-checklist.md`
- Modify: 仅当抽检发现 bug 时回修 kernel/bridge（小步提交）
- Modify: `src/content/index.ts` / `index.firefox.ts` loopback preset 如需带 `h5_config.compatMode`（可选）

- [ ] **Step 1: Write manual checklist**

`docs/regression/h5-media-kernel-manual-checklist.md`：

```markdown
# H5 Media Kernel Manual Checklist

## Build
- [ ] `npm run check`
- [ ] `npm run test:media-kernel`
- [ ] `npm run build:chrome && npm run verify:chrome-package`

## Zero regression
- [ ] YouTube: 1-6 / C X Z / seek 正常；字幕等其它功能未坏
- [ ] Bilibili: 倍速与 seek 正常；CDN/字幕开关不受影响
- [ ] Douyin: >3x sticky 仍由原 guard 生效；不出现双重跳动

## Compat mode
- [ ] safe: 行为接近旧版 isolated
- [ ] compat: 至少 5 个先前失败的 H5 站，调速后 ≥3s 保持
- [ ] strict: 难站持续保持（若有样本）

## Frames
- [ ] iframe 内主视频可调速
- [ ] 无 video 的页面/frame 不抢快捷键

## Notes
| Site | Mode | Result | Notes |
|------|------|--------|-------|
|  |  |  |  |
```

- [ ] **Step 2: Run automated gates**

```bash
npm run test:media-kernel
npm run check
npm run build:chrome
npm run verify:chrome-package
```

Expected: 全部通过。

- [ ] **Step 3: Execute manual checklist on real sites**

加载 `dist/` 为未打包扩展，按清单勾选。失败则修代码并回到对应 Task 的模块提交 fix。

- [ ] **Step 4: Final commit for checklist (if not ignored)**

`docs` 在 `.gitignore` 中；与 design 相同用强制 add：

```bash
git add -f docs/regression/h5-media-kernel-manual-checklist.md
git commit -m "docs: add H5 media-kernel manual regression checklist"
```

若本轮还有代码 fix：

```bash
git add -A
git commit -m "fix(media-kernel): address manual regression findings"
```

---

## Spec Coverage Self-Check

| Spec requirement | Task |
|------------------|------|
| MAIN kernel + document_start | T3, T5 |
| Isolated bridge + 超时降级 | T4 |
| Registry 发现 + open shadow | T3 |
| pickPrimary | T1, T3 |
| 原始 descriptor 调速 | T3 |
| L1 sticky 3s | T1 policy, T3 |
| L2 strict | T3 escalator |
| safe/compat/strict + 默认 compat | T2, T4 |
| all_frames + 无 video 不抢键 | T5 + T3/T4 presence checks |
| 抖音 defer ownsRate | T4 |
| 不实现 L3/shadow hack/下载 | 全任务未包含 |
| h5_config 进 content | T2 CONTENT_SETTINGS_KEYS |
| 测试与验收 | T1, T6 |
| 包产物校验 | T5 |

## Placeholder / Consistency Scan

- 无 TBD；消息 source/channel/version 全程统一。
- `compatMode` 字段名 settings / UI / configure payload 一致。
- 构建产物名统一 `assets/media-kernel.page.js`。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-h5-media-kernel.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 新开 subagent，任务间 review，迭代快  
2. **Inline Execution** — 本会话按 executing-plans 批量执行并设检查点  

Which approach?
