# Changelog

## 2026-02-10

本次更新聚焦：稳定性、兼容性、构建可用性（非功能扩张）。

### 1) 内容脚本构建修复（关键）
- 修复 `content.js` 被打包为 ESM 导致的运行时错误：`Unexpected token 'export'`。
- 将构建拆分为两段：
- `vite.config.ts` 仅构建 `popup/background`。
- 新增 `vite.content.config.ts`，单独输出 `assets/content.js`（IIFE 单文件）。
- 更新 `package.json`：`build` 改为 `vite build && vite build --config vite.content.config.ts`。
- 结果：`dist/assets/content.js` 不再含 `import/export`，内容脚本可正常执行。

### 2) 注入时机与启动稳定性
- `manifest` 内容脚本保持 `run_at: document_start`。
- 内容脚本启动增加安全兜底，防止设置读取异常时功能整段失效。
- 处理 `document.body` 未就绪场景，避免早期注入报错。

### 3) 站点适配收口（TCC-lite）
- 新增 `src/lib/siteProfiles.ts`：统一管理站点域名匹配、全屏按钮、Fast Pause 区域/排除规则、AutoPause 容器选择器。
- 新增 `src/lib/domain.ts`：统一域名规范化与列表去重逻辑。
- 降低站点改版时“多文件分散修复”的维护成本。

### 4) 输入与快捷键稳定性
- `InputManager` 事件注册去重，避免重复 mount 导致双触发。
- 增强可编辑区域识别（输入框/富文本等），减少误拦截。
- 动态视频存在判断策略优化，减少“有视频但快捷键不生效”的边界问题。

### 5) 播放控制与站点行为兼容
- `VideoController` 对 `play()` / `requestFullscreen()` Promise 失败增加吞错兜底，降低页面策略差异导致的中断。
- YouTube 数字键原生跳转拦截逻辑重整，与倍速快捷键行为解耦。
- Bilibili / YouTube 快速暂停相关监听改为可重复挂载安全模式（防重复绑定）。

### 6) AutoPause 稳定性增强
- AutoPause 容器重建后自动重绑定（适配 SPA/播放器重建）。
- 对跨标签页状态同步与监听解绑做了稳态处理，减少焦点切换抖动。

### 7) 设置模型与写入策略
- settings 读写模型统一，减少 popup/content schema 漂移风险。
- Popup/H5/AutoPause 设置写入增加 debounce，降低频繁写 `chrome.storage` 的抖动与覆盖风险。

### 8) 工程与回归保障
- 新增回归文档：`docs/compat-regression-checklist.md`。
- 本次已通过：
- `npm run check`（0 errors / 0 warnings）
- `npm run build`（成功，且无 `Unknown input options: manualChunks`）

### 9) 说明
- 控制台中大量 `doubleclick / googlesyndication / data.bilibili.com` 的 `ERR_*` 网络错误为站点广告/埋点请求异常，通常不属于本扩展逻辑错误。
