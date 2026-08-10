# VidBoost Popup 主页面紧凑布局实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持 `360 x 600px` Popup 和现有功能行为不变的前提下，压缩主页面外围间距，移动语言入口和滚动末尾信息区，让首屏多显示约 2-3 个功能项。

**Architecture:** 为主页面增加显式的 `main` 密度契约和作用域 token；`SectionCard`、`ToggleItem`、`AccordionItem` 只在收到该契约时采用紧凑尺寸，二级设置页继续使用默认尺寸。`App.svelte` 负责主页面顶栏、滚动内容和非固定信息区的组合，现有设置状态与事件函数保持不变。

**Tech Stack:** Svelte 4、TypeScript、Tailwind CSS 3、现有 `@/` alias、Vite、`svelte-check`。

## Global Constraints

- 只优化 Popup 主页面；不重做 H5、自动暂停和 Bilibili CDN 二级设置页。
- 保持 `360 x 600px` Popup 尺寸，不通过扩大窗口解决空间问题。
- 顶层分组保持独立展开，并继续使用现有 `ui_state` 记忆状态。
- 语言切换位于顶栏；GitHub 与版本号作为普通滚动内容放在最后一个分组之后。
- 不改变设置字段、功能逻辑、存储协议、权限或默认展开状态。
- 不通过明显缩小字体或移除功能说明换取空间；说明保持单行省略。
- 组件密度必须显式作用于主页面，不能影响 H5 二级页复用的 `ToggleItem`。
- 完成后运行 `npm run check`，并手动检查中英文、浅色/深色、展开/收起和滚动末尾状态。

---

### Task 1: 建立主页面密度契约

**Files:**
- Modify: `src/popup/App.svelte:1485-1532`
- Modify: `src/app.css:112-370`

**Interfaces:**
- Produces: `popup-main-density` 根作用域和可供子组件使用的 CSS token。
- Consumes: 现有 `main` class、`SectionCard`、`ToggleItem`、`AccordionItem` 结构。

- [ ] **Step 1: 为主页面根节点增加密度作用域**

在 `App.svelte` 的 `<main>` 上按当前视图启用 `popup-main-density`，保留现有 `w-[360px] h-[600px]` 和 `glass-card`。

```svelte
<main
  class="w-[360px] h-[600px] glass-card text-primary font-sans select-none overflow-hidden relative flex flex-col"
  class:popup-main-density={currentView === "main"}
>
```

只有 `currentView === "main"` 时启用该 class；`h5-settings`、`ap-settings` 和 `bb-cdn-settings` 视图不使用它。

- [ ] **Step 2: 定义主页面密度 token**

在 `src/app.css` 的组件层增加作用域变量，避免在多个 Svelte 文件中重复散落尺寸：

```css
.popup-main-density {
  --popup-main-header-height: 50px;
  --popup-main-content-x: 12px;
  --popup-main-section-gap: 8px;
  --popup-main-section-header-height: 36px;
  --popup-main-row-height: 45px;
  --popup-main-icon-size: 28px;
  --popup-main-footer-height: 32px;
}
```

变量只作为主页面密度的参考值；不要覆盖全局 `glass-panel`、`settings-field` 或二级页 token。

- [ ] **Step 3: 运行静态检查确认作用域改动不破坏编译**

运行：`npm run check`

预期：命令通过；此步骤不应产生 TypeScript 或 Svelte 警告。

- [ ] **Step 4: 提交主页面密度契约**

```bash
git add src/popup/App.svelte src/app.css
git commit -m "refactor: add popup main density scope"
```

### Task 2: 为共享组件增加显式主页面密度入口

**Files:**
- Modify: `src/components/SectionCard.svelte:1-85`
- Modify: `src/components/ToggleItem.svelte:1-190`
- Modify: `src/components/AccordionItem.svelte:1-170`
- Modify: `src/popup/App.svelte:1534-3178`

**Interfaces:**
- Produces: `density: "default" | "main"` 可选 prop；默认值为 `"default"`，保证二级页视觉不变。
- Consumes: Task 1 的 `.popup-main-density` 变量和 App 主页面所有组件调用点。

- [ ] **Step 1: 给 `SectionCard` 增加默认不变的 density prop**

在 `SectionCard.svelte` 增加：

```ts
export let density: "default" | "main" = "default";
```

根节点使用 `class:popup-main-card={density === "main"}`。只有 `popup-main-card` 时，将标题按钮压到约 `36px` 高、左右内边距压到 `10-12px`，内容区使用 `8px` 内边距和 `8px` 子项间距。`density === "default"` 的现有 class 和尺寸必须保留。

- [ ] **Step 2: 给 `ToggleItem` 增加 density prop 且保留 compact 语义**

在 `ToggleItem.svelte` 增加：

```ts
export let density: "default" | "main" = "default";
```

规则：

- `compact={true}` 仍优先使用现有 `24px` 图标和 `p-1.5`，用于 Fast Pause/H5 快捷键等嵌套项。
- `density="main" && compact={false}` 使用约 `28px` 图标、`gap-2` 和 `p-1.5`，普通行高度目标为 `44-46px`。
- `density="default"` 保持现有 `32px` 图标、`gap-3` 和 `p-2`。

所有条件 class 必须写成 Tailwind 可静态识别的 class（例如 `class:w-7={density === "main" && !compact}`），不要拼接运行时无法生成的 Tailwind class。

- [ ] **Step 3: 给 `AccordionItem` 增加 density prop**

在 `AccordionItem.svelte` 增加相同签名：

```ts
export let density: "default" | "main" = "default";
```

当 `density="main"` 时，标题行使用 `gap-2`、约 `36px` 的内容高度和 `28px` 图标；展开内容使用 `px-2 pb-2 space-y-2`。保留 `aria-expanded`、键盘开关、禁用态和右侧主开关事件。

- [ ] **Step 4: 只给 App 主页面调用点传入 density**

在 `App.svelte` 的通用、YouTube、Bilibili 三个主页面分组中，为每一个 `SectionCard`、`ToggleItem`、`AccordionItem` 传入：

```svelte
density="main"
```

嵌套 Fast Pause 项也传入 `density="main"`，但继续保留 `compact={true}`。不要修改 `H5Settings.svelte` 的 `ToggleItem compact={true}` 调用。

- [ ] **Step 5: 运行静态检查并确认默认调用点无变化**

运行：`npm run check`

预期：无新错误；未传 `density` 的 H5 二级页继续使用默认尺寸。

- [ ] **Step 6: 提交组件密度入口**

```bash
git add src/components/SectionCard.svelte src/components/ToggleItem.svelte src/components/AccordionItem.svelte src/popup/App.svelte
git commit -m "refactor: scope compact density to popup main"
```

### Task 3: 重组主页面顶栏与滚动末尾信息区

**Files:**
- Modify: `src/popup/App.svelte:1493-1527`
- Modify: `src/popup/App.svelte:3179-3311`

**Interfaces:**
- Consumes: Task 1 的 `popup-main-density` token 和 Task 2 的组件密度 prop。
- Produces: 顶栏语言入口、可滚动主内容和非固定 GitHub/版本信息区。

- [ ] **Step 1: 压缩主页面 Header**

将现有 `px-5 pt-6 pb-4` header 改为受 `--popup-main-header-height` 约束的 `px-4 py-2` 布局。保留 VidBoost 标题、总开关、可访问标题和点击事件；总开关视觉目标约 `44 x 24px`，其可点击按钮区域不得小于 `32px` 高。

- [ ] **Step 2: 把语言菜单移入 Header**

将当前 Footer 中的语言按钮和菜单移动到 Header 右侧工具组，保持 `auto`、`en`、`zh` 三个选项和现有 `language` 状态更新逻辑。顶栏菜单使用 `top-full right-0 mt-2` 定位，外部透明 backdrop 和 `Escape` 关闭逻辑保持可用；为按钮保留语言 tooltip/`aria-label`。

- [ ] **Step 3: 删除固定 Footer 占位并压缩滚动内容外框**

将主内容容器从 `relative z-10 px-4 py-2 space-y-3 flex-1 overflow-y-auto no-scrollbar pb-6` 调整为使用主页面 token 的约 `12px` 水平内边距、`8px` 分组间距和 `pb-3`。移除主页面 `footer` 的固定 flex 子节点，避免 `mt-auto` 和渐变背景继续占用高度。

- [ ] **Step 4: 在最后一个主页面分组后插入 inline footer**

在 Bilibili `SectionCard` 结束后插入普通流内的链接区：

```svelte
<div class="popup-main-inline-footer">
  <a
    href={GITHUB_REPO_URL}
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex h-6 w-6 items-center justify-center text-gray-400 transition-colors hover:text-gray-600 dark:text-white/30 dark:hover:text-white/50"
    title={t("github_repo")}
    aria-label={t("github_repo")}
  >
    <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  </a>
  <a
    href={GITHUB_RELEASES_URL}
    target="_blank"
    rel="noopener noreferrer"
    class="text-[10px] font-medium text-gray-400 transition-colors hover:text-gray-600 dark:text-white/30 dark:hover:text-white/50"
    title={t("github_releases")}
    aria-label={t("github_releases")}
  >
    v{manifestVersion}
  </a>
</div>
```

使用约 `32px` 高度和 `mt-1`，不使用 `fixed` 或 `sticky`。链接仍在新标签页打开并保留 `rel="noopener noreferrer"`。

- [ ] **Step 5: 运行静态检查**

运行：`npm run check`

预期：通过；语言菜单没有重复渲染，主页面不再存在固定 Footer 的布局占位。

- [ ] **Step 6: 提交主页面 Chrome 改造**

```bash
git add src/popup/App.svelte
git commit -m "feat: compact popup main chrome"
```

### Task 4: 完成主页面验收与回归检查

**Files:**
- Test/inspect: `src/popup/App.svelte`, `src/components/SectionCard.svelte`, `src/components/ToggleItem.svelte`, `src/components/AccordionItem.svelte`, `src/app.css`

**Interfaces:**
- Consumes: Tasks 1-3 的已提交 UI 改动。
- Produces: 静态检查结果和手动验收记录；不修改设置数据。

- [ ] **Step 1: 运行完整静态检查**

运行：`npm run check`

预期：`svelte-check` 通过，无新增 warning/error。

- [ ] **Step 2: 验证 Chrome 和 Firefox 包入口及资源完整**

依次运行：

```bash
npm run validate:chrome-package
npm run validate:firefox-low-memory
```

预期：两端构建和包校验成功，Popup 入口正常生成；不执行发布打包，不修改 manifest 权限。

- [ ] **Step 3: 手动验收主页面视觉状态**

在 Popup 预览中逐项检查：

1. 中文浅色：三组都展开时，首屏比基线多显示 2-3 个选项，说明单行省略且无重叠。
2. 英文浅色：长标题和设置按钮不挤压右侧开关。
3. 中文深色与英文深色：禁用态、分组色点和边界仍可辨识。
4. 折叠并重新打开通用、YouTube、Bilibili：每组独立变化，刷新后 `ui_state` 保留。
5. 滚动到内容底部：GitHub 和版本号出现；滚回顶部时不固定遮挡功能行。
6. 点击顶栏语言按钮：菜单向下、靠右显示，点击外部和 `Escape` 可关闭。
7. 从主页面进入 H5、自动暂停和 CDN 二级页：其默认密度没有被主页面样式改变。

- [ ] **Step 4: 检查工作区范围**

运行：`git status -sb`

预期：只包含本计划涉及的源码变更和明确的 `.superpowers/` 预览临时目录；不应出现生成的 `dist/`、浏览器数据或 manifest 权限变化。

- [ ] **Step 5: 提交验收中产生的必要修正**

只有 Step 1-4 发现并修复源码问题时，运行：

```bash
git add src/popup/App.svelte src/components/SectionCard.svelte src/components/ToggleItem.svelte src/components/AccordionItem.svelte src/app.css
git commit -m "fix: polish compact popup main layout"
```

如果 Step 1-4 全部通过且没有源码改动，不创建空提交。

若 `npm run check`、`npm run validate:chrome-package` 或 `npm run validate:firefox-low-memory` 失败，先修复对应源码并重新运行失败命令；手动验收未通过时只调整本计划列出的主页面密度和共享 Popup Chrome，不扩展到二级页。
