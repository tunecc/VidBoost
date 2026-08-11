# YouTube 自渲染字幕选择器设计

- **日期：** 2026-08-11
- **状态：** 已通过讨论确认，等待实现计划
- **范围：** YouTube 自渲染字幕的单语言选择、自动翻译和全局目标语言偏好

## 1. 背景

VidBoost 当前会从 YouTube 播放器数据读取 `captionTracks`，优先跟随 YouTube 当前选中的字幕轨道，并在无法识别选择时回退到作者字幕、自动生成字幕或首条轨道。字幕通过 timedtext `json3` 接口获取，再由现有解析器、后处理器和 Overlay 渲染。

当前缺口是：

1. VidBoost 没有自己的字幕语言选择入口。
2. `playerCaptionsTracklistRenderer.translationLanguages` 没有进入 Page Bridge 数据模型。
3. 自渲染请求不能表达 YouTube 的 `tlang` 自动翻译目标。
4. 用户不能设置跨视频持续生效的目标语言偏好。

本设计在现有自渲染链路上增加一个独立字幕目录和选择解析层。它不调用 YouTube 私有切轨接口，也不改变 YouTube 原生字幕菜单中的选择。

## 2. 已确认的产品决策

| 项目 | 决策 |
| --- | --- |
| 渲染模式 | 同一时间只请求、解析和渲染一条字幕 |
| 入口 | YouTube 播放器控制栏中的 VidBoost 字幕按钮 |
| 菜单 | 带搜索框的单层菜单，按“视频提供”和“自动翻译”分组 |
| 与原生播放器关系 | 只改变 VidBoost 自渲染字幕，不同步 YouTube 原生轨道 |
| 偏好记忆 | 全局记住目标语言，不记住具体轨道类型 |
| 同语言优先级 | 作者字幕优先，其次自动生成字幕，最后自动翻译 |
| 默认行为 | 尚未选择全局目标语言时保持现有跟随与回退逻辑 |

## 3. 目标与非目标

### 3.1 目标

- 在播放器内快速选择视频自带字幕或 YouTube 自动翻译语言。
- 用户选择后立即切换当前 VidBoost 字幕，并在后续视频中继续优先使用该目标语言。
- 优先使用视频提供的高质量目标语言字幕；缺失时才请求自动翻译。
- 保持现有高倍速同步、字幕样式、原生 CC 开关、字幕状态记忆和 Immersive Translate 兼容行为。
- 将目录、选择和菜单职责从现有大型 Overlay 类中隔离，便于独立测试。

### 3.2 非目标

- 不显示原文与译文双字幕。
- 不同时加载两条字幕轨道，不做双轨时间轴对齐。
- 不修改或伪造 YouTube 原生字幕菜单状态。
- 不调用 YouTube 私有 `setOption('captions', ...)` 一类切轨接口。
- 不引入第三方翻译服务、后台服务、权限或运行时依赖。
- 不扩展到 Bilibili、Douyin 或其他站点。
- 不借本功能重构整个 YouTube 字幕 Overlay，也不整理仓库现有测试脚本体系。

## 4. 外部调研依据

2026-08-11 使用 Grok Search MCP 实际检索并核对以下资料：

- [YouTube Captions API](https://developers.google.com/youtube/v3/docs/captions)：官方字幕资源文档确认 `tlang` 表示翻译目标语言。网页播放器 timedtext 接口并非公开稳定 API，但参数语义一致。
- [yt-dlp #6443](https://github.com/yt-dlp/yt-dlp/issues/6443)：展示从 `captionTracks` 与 `translationLanguages` 构造翻译字幕选项的成熟实践。
- [yt-dual-sub](https://github.com/reza-nzri/yt-dual-sub)：同类扩展采用 player response、timedtext、`tlang` 与 Overlay 的数据链路。
- [caption translation Gist](https://gist.github.com/RogerRordo/937d37a6bd19c20f1ce094cfe4fb48ea)：展示遍历 `translationLanguages` 并构造目标语言请求的实现思路。

外部资料只能证明该链路当前可行，不能把 YouTube 内部字段视为稳定契约。因此缺字段、字段变形和请求失败必须进入正常回退路径。

## 5. 架构

```text
YouTube player response
  -> Page Bridge: tracks + translation languages + selected track
  -> SubtitleCatalog: normalized unique target-language options
  -> SubtitleResolver: preferred language -> one active option
  -> timedtext: source track URL (+ tlang for translated option)
  -> existing parser and post-processor
  -> existing single Subtitle Overlay
```

### 5.1 Page Bridge

`subtitleOverlay.page.ts` 继续只读取播放器状态，不执行字幕切轨。Bridge 响应增加：

- `captionTracks[].isTranslatable`
- `translationLanguages[]`
- 可供 UI 使用的本地化语言名称

新增共享类型：

```ts
type YouTubeSubtitleTranslationLanguage = {
    languageCode: string;
    languageName: YouTubeTextValue;
};

type YouTubeTextValue = {
    simpleText?: string;
    runs?: Array<{ text: string }>;
};
```

Bridge 负责对相对 `baseUrl` 做现有规范化，并把 YouTube text value 展平为可预测的数据。Bridge 不负责选项去重、偏好解析或 UI 排序。

### 5.2 SubtitleCatalog

新增纯逻辑目录模块，输入当前 `YouTubeSubtitlePlayerData`，输出统一的单字幕选项：

```ts
type SubtitleOption =
    | {
        kind: 'provided';
        id: string;
        targetLanguageCode: string;
        label: string;
        sourceTrack: YouTubeSubtitleCaptionTrack;
        sourceKind: 'author' | 'asr';
    }
    | {
        kind: 'translated';
        id: string;
        targetLanguageCode: string;
        label: string;
        sourceTrack: YouTubeSubtitleCaptionTrack;
        translationLanguageCode: string;
    };
```

目录规则：

1. 规范化语言代码和显示名称。
2. 同一目标语言只保留一个视频提供选项，作者字幕优先于自动生成字幕。
3. 自动翻译组选取 YouTube 返回的 `translationLanguages`，排除已经由视频提供的兼容目标语言。
4. 每个自动翻译选项绑定一条可翻译源轨道，但它仍表示一个目标语言，而不是第二条并行字幕。
5. 选项 ID 必须包含来源类型、源轨道标识和目标语言，保证运行时状态与缓存可区分。

语言匹配先比较规范化后的完整 BCP-47 代码，再进行安全的兼容匹配。中文必须区分简体与繁体族，不能仅凭 `zh` 主语言子标签把 `zh-Hans` 与 `zh-Hant` 视为同一目标。无法可靠判断时保留为不同选项。

### 5.3 SubtitleResolver

新增纯逻辑选择解析器，输入字幕目录、全局目标语言和 YouTube 当前选择，输出最多一个 `SubtitleOption`。

当 `preferredLanguageCode` 非空时：

1. 目标语言的作者字幕。
2. 目标语言的自动生成字幕。
3. 目标语言的自动翻译选项。
4. YouTube 当前选中的视频提供轨道。
5. 现有作者字幕、自动生成字幕、首条轨道回退。

当 `preferredLanguageCode` 为空时，保持当前 `selectTrack()` 行为，不改变已有用户的默认体验。

自动翻译源轨道按以下顺序选择：

1. YouTube 当前选中的可翻译轨道。
2. 可翻译的作者字幕。
3. 可翻译的自动生成字幕。

解析器不读写存储、不发网络请求，也不操作 DOM。

### 5.4 SubtitleSelector

新增播放器菜单模块，职责仅包括：

- 挂载和移除控制栏按钮。
- 展示、搜索和选择 `SubtitleOption`。
- 管理菜单打开、关闭、焦点和键盘交互。
- 通过回调报告目标语言选择。

它不读取 Page Bridge、不解析字幕、不构造 timedtext URL，也不直接持久化设置。Overlay 负责向它提供目录、当前活动语言和选择回调。

### 5.5 现有 Overlay 的职责变化

`YouTubeSubtitleOverlay` 继续拥有视频生命周期、请求取消、字幕加载、渲染和原生字幕显隐。新增职责限定为协调：

1. 获取 Player Data。
2. 构建目录并解析一个活动选项。
3. 把目录交给 Selector。
4. 把活动选项交给现有加载链路。
5. 用户选择时保存目标语言并触发当前视频重载。

目录、解析和菜单不得以内联条件继续堆进 Overlay 主文件。

## 6. 设置与运行时状态

`YTSubtitleConfig` 增加：

```ts
preferredLanguageCode: string;
```

默认值为空字符串。设置规范化逻辑必须接受旧配置缺少此字段的情况，并回退为空字符串。

状态分为两类：

- **持久状态：** `preferredLanguageCode`，表示跨视频的用户目标语言。
- **运行时状态：** `activeOption`，表示当前视频实际加载成功的字幕选项。

偏好不可用或加载失败时，运行时选项可以回退，但不得覆盖持久偏好。显式选择失败时显示一次上下文明确的 OSD，菜单继续用选中标记表示实际活动语言；保存的偏好可用“默认”标记区分。自动跨视频回退不重复弹出干扰性提示。

## 7. 请求、解析与缓存

### 7.1 URL 构造

视频提供选项沿用源轨道 `baseUrl`。自动翻译选项在相同 URL 上增加：

```text
tlang=<targetLanguageCode>
```

现有固定参数、DEVICE 参数、客户端版本和 POT 参数保持不变。POT 始终从自动翻译选项的 `sourceTrack` 解析。

### 7.2 单轨保证

每次加载只把一个 `SubtitleOption` 传入 timedtext 获取流程。不得为了菜单预览预取全部语言，也不得同时保留原文和翻译两套活动 fragments。

### 7.3 解析语言

视频提供选项使用轨道语言代码；自动翻译选项使用目标语言代码调用现有字幕解析和后处理。这样 CJK 判断、断句和长度处理以最终显示语言为准。

### 7.4 Key 与缓存隔离

当前轨道 key 和字幕缓存 key 必须包含：

- video ID
- 源轨道标识
- 目标语言代码
- 选项类型

原文、不同目标语言的翻译结果以及同视频不同源轨道不得共用缓存项。

## 8. 播放器交互设计

### 8.1 挂载位置

当自渲染字幕启用且当前视频存在字幕数据时，在 `.ytp-right-controls` 内、设置按钮附近挂载一个图标按钮。按钮使用 tooltip 和可访问名称“VidBoost 字幕”，不依赖带文字的宽按钮。

YouTube 重建控制栏时重新挂载。找不到挂载点时字幕加载和渲染继续工作，Selector 在后续轮询或定向 DOM 观察中重试，不能因此回退整条字幕链路。

### 8.2 菜单结构

菜单包含：

1. 自动聚焦的语言搜索框。
2. “视频提供”分组。
3. “自动翻译”分组。

搜索同时匹配本地化语言名称和语言代码。选项使用紧凑标签区分“作者”“自动生成”“自动翻译”。当前实际活动语言显示选中标记。

### 8.3 选择行为

用户选择目标语言后：

1. 更新并持久化 `preferredLanguageCode`。
2. 关闭菜单并把焦点返回控制按钮。
3. 取消当前未完成加载。
4. 对当前视频解析并加载新选项。
5. 加载成功后原子替换 fragments。

同一视频加载期间保留旧字幕，避免视觉闪空。失败时保留旧的活动选项和字幕，并显示一次 OSD。

### 8.4 可访问性与关闭条件

- 按钮声明菜单弹出状态和关联关系。
- 搜索框、选项和分组具备明确语义。
- 支持方向键、回车、`Escape` 和 Tab 焦点顺序。
- 点击菜单外部、YouTube SPA 路由切换、功能关闭或播放器销毁时关闭菜单。
- 菜单不能遮挡或重排 YouTube 控制栏，也不能因为动态标签导致播放器布局跳动。

### 8.5 与原生 CC 的关系

YouTube 原生 CC 按钮仍是字幕显示开关。启用 `followNativeToggle` 时，CC 关闭继续暂停 VidBoost Overlay；VidBoost Selector 只改变语言，不主动打开 CC，也不改变原生播放器轨道。

## 9. 生命周期与并发

- Player Data 更新或 SPA 路由切换后重建目录。
- 全局目标语言跨路由、刷新和视频保留。
- 用户快速切换语言时先取消旧请求，再增加现有 load serial。
- 只有当前 video ID、load serial 和 AbortController 均匹配的响应可以成为活动字幕。
- 控制栏被 YouTube 重建时销毁旧按钮引用并幂等重挂载，不能产生重复按钮或重复事件监听器。
- Selector 销毁时释放 document 级点击监听、键盘监听和 DOM 观察器。

## 10. 异常与回退

| 场景 | 行为 |
| --- | --- |
| 没有 `translationLanguages` | 只展示视频提供分组 |
| 目标语言在当前视频不可用 | 保留全局偏好，本视频回退到当前轨道和现有默认逻辑 |
| 没有任何字幕轨道 | 不显示 Selector，不创建 Overlay |
| 翻译请求 `403` | 刷新 Player Data 与 POT，保持相同目标语言重试一次 |
| 网络、空响应或解析失败 | 同视频保留旧字幕；新视频无旧字幕时恢复原生字幕 |
| Player Data 字段变形 | 忽略非法项，目录为空时进入现有原生字幕回退 |
| 快速切换产生迟到响应 | AbortController 与 load serial 共同丢弃旧响应 |
| 控制栏挂载失败 | 继续字幕渲染，后续重试挂载，不影响主功能 |

所有错误信息必须包含 video ID、源轨道、目标语言和失败阶段，但不得记录完整 POT、URL 查询凭据或其他敏感播放器令牌。

## 11. Immersive Translate 兼容

兼容判断改用活动选项的最终目标语言，而不是自动翻译使用的源轨道语言：

- 英文源字幕翻译为中文：视为中文字幕，VidBoost 正常渲染。
- 最终目标语言为非中文且开启兼容开关：保持现有让出逻辑，恢复原生字幕供 Immersive Translate 处理。

Selector 的偏好仍可保存；让出行为不清除全局目标语言。

## 12. 测试设计

### 12.1 纯逻辑测试

测试沿用仓库已有 Vitest 文件风格，重点覆盖：

- 目录对作者字幕、ASR 和翻译语言的分组与去重。
- 同语言作者字幕优先于自动生成字幕。
- BCP-47 规范化及简体、繁体中文不会错误合并。
- 有偏好和无偏好时的完整解析顺序。
- 自动翻译源轨道选择顺序。
- `tlang`、解析语言、轨道 key 和缓存 key。
- 缺失字段、不可翻译、空列表和非法语言项。
- 设置默认值和旧配置兼容。
- 请求取消和迟到响应保护。

本功能不新增或整理全仓统一字幕测试脚本；实现阶段运行仓库当前可用的定向 Vitest 入口，并把可复现性现状记录在验证结果中。

### 12.2 浏览器验收矩阵

Chrome 与 Firefox 至少覆盖：

1. 视频存在作者中文字幕：全局中文直接使用作者字幕，不增加 `tlang`。
2. 视频只有英文 ASR：全局中文选择产生单个 `tlang=zh-*` 请求。
3. 同语言同时存在作者字幕和 ASR：菜单只显示一个目标语言并选择作者字幕。
4. 切换视频与刷新页面：保持全局目标语言。
5. 目标语言不可用：偏好保留，本视频安全回退。
6. 搜索、键盘导航、外部点击、`Escape` 和焦点恢复正确。
7. 普通、剧场、全屏与 SPA 路由切换后按钮幂等挂载。
8. 快速连续切换语言：最终字幕与最后一次选择一致。
9. 每次只有一条字幕请求和一层字幕显示。
10. 原生 CC、字幕状态记忆与 Immersive Translate 兼容无回归。

### 12.3 工程验证

- `npm run check`
- `npm run validate:chrome-package`
- `npm run validate:firefox-low-memory`
- `git diff --check`

## 13. 成功标准

- 用户能从播放器内 VidBoost 按钮搜索并选择目标字幕语言。
- 选中语言立即作用于当前自渲染字幕，并跨视频与刷新保留。
- 有目标语言视频字幕时不调用自动翻译；没有时才使用 `tlang`。
- 任意时刻只存在一套活动 fragments 和一层 VidBoost 字幕。
- 不改变 YouTube 原生字幕轨道选择。
- YouTube 字段、网络或挂载失败时可回退，且不清除用户偏好。
- Chrome 与 Firefox 构建验证通过，关键目录和解析逻辑有定向测试覆盖。

## 14. 预计代码边界

实现计划应优先把改动限制在以下边界：

- `src/features/youtube/subtitleOverlay.shared.ts`：Bridge 数据类型。
- `src/features/youtube/subtitleOverlay.page.ts`：读取翻译语言和可翻译标记。
- `src/features/youtube/subtitle/selector/`：目录、解析器、菜单及其测试。
- `src/features/YouTubeSubtitleOverlay.ts`：生命周期协调、单选项加载和现有回退集成。
- `src/lib/settings.ts`：全局目标语言字段、默认值与配置规范化。
- `src/lib/i18n.ts`：菜单、标签、搜索和错误提示文案。

若实现阶段发现必须修改 manifest、权限、依赖、构建配置或其他站点模块，应停止并单独说明原因、影响和回滚方式；这些变化不属于本设计的默认授权范围。
