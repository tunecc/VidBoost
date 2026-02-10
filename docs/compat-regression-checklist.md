# VidBoost 兼容性回归清单

目标：每次发布前用同一批站点、同一批动作做快速回归，避免“功能没改但兼容性退化”。

## 1. 测试环境

- 浏览器：Chrome Stable 最新版
- 安装方式：开发者模式加载 `dist/`
- 构建前置：`npm run check && npm run build`

## 2. 站点清单（最小集）

- YouTube（`https://www.youtube.com/watch?v=...`）
- Bilibili（`https://www.bilibili.com/video/...`）
- 任意普通 HTML5 视频站（用于通用快捷键验证）

## 3. 动作清单（每站都测）

- 播放/暂停切换
- 倍速增加、降低、重置（`C` / `X` / `Z`）
- 方向键快进/快退
- 全屏切换（`Enter`）
- 数字键相关行为（YouTube 原生跳转拦截逻辑）
- 双击全屏拦截与快速暂停（YouTube/Bilibili）

## 4. Auto Pause 专项

- 同时打开两个视频标签页
- 标签页 A 播放后，标签页 B 开始播放应触发 A 暂停
- 切换焦点窗口后，新的焦点页播放应生效
- `ap_scope=all` 与 `ap_scope=selected` 都要验证
- 自定义域名输入：带协议、端口、路径时应被规范化并正确匹配

## 5. 注入时机专项（document_start）

- 页面首次加载时快捷键可用
- `document.body` 未就绪阶段不报错
- SPA 路由跳转后视频对象可重新识别
- Shadow DOM 内视频可被识别

## 6. 回归通过标准

- `npm run check`：0 errors / 0 warnings
- `npm run build`：成功且无 `Unknown input options: manualChunks`
- 上述动作清单无双触发、无明显延迟、无异常报错
