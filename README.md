# VidBoost - 高性能视频增强工具 Pro

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Svelte](https://img.shields.io/badge/svelte-%23f1413d.svg?style=flat&logo=svelte&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)

**VidBoost** 是一款专为提升网页视频观看体验而设计的高性能 Chrome/Edge 扩展程序。它采用现代架构重构，专注于极低内存占用和零延迟响应，提供倍速控制、自动暂停以及针对 Bilibili 等站点的专属优化功能。

## 🖼️ 预览

<p align="center">
  <a href="https://files.catbox.moe/e14v7g.png">
    <img src="https://files.catbox.moe/e14v7g.png" width="22%" />
  </a>
  <a href="https://files.catbox.moe/ak2mfg.png">
    <img src="https://files.catbox.moe/ak2mfg.png" width="22%" />
  </a>
  <a href="https://files.catbox.moe/c9ol0e.png">
    <img src="https://files.catbox.moe/c9ol0e.png" width="22%" />
  </a>
  <a href="https://files.catbox.moe/nlwgth.png">
    <img src="https://files.catbox.moe/nlwgth.png" width="22%" />
  </a>
</p>

## 为什么有这个项目？
我在使用下面三个仓库的代码时，篡改猴总是崩溃，导致使用体验割裂，所以有了这个项目

https://github.com/tunecc/h5player
https://github.com/tunecc/bilibili-no-dblclick
https://github.com/tunecc/video-auto-pause


## 🚀 核心功能


*   **🛠 H5 视频增强**:
    *   **数字键倍速**: 按下数字键 (0-9) 即可瞬间切换视频倍速。助你光速度过视频中的“垃圾时间”。
    *   **冲突屏蔽**: 智能禁用 YouTube 等站点的原生数字键跳转进度功能，防止调节倍速时误触进度条，体验更纯粹。
*   **🧠 智能焦点流**:
    *   **自动暂停**: 采用“前台优先”策略，让浏览器焦点的视频拥有最高播放权重。一旦失去焦点（切换标签页或窗口），视频自动暂停，从不干扰你的当前操作。
*   **🛡 交互体验优化**:
    *   **禁用双击全屏**: 拦截播放器双击全屏行为，防止高频点击时的误触，让暂停/播放操作更加从容。
---
*   **⚡ 极致性能**:
    *   **极低内存占用**: 通过统一的 `InputManager` 管理全局事件，大幅减少事件监听器数量。
    *   **智能休眠**: 结合 `VideoDetector` 与 Shadow DOM 穿透技术，核心逻辑仅在检测到视频时激活，平时完全静默。
    *   **零延迟同步**: 基于 `BroadcastChannel` 实现跨标签页瞬间通信（如自动暂停其他标签页），无需读写硬盘，响应速度极快。

## 🛠 技术栈

本项目完全基于现代 Web 技术重构，以确保最佳的性能和可维护性：

*   **核心语言**: [TypeScript](https://www.typescriptlang.org/) (严格类型检查，稳健可靠)
*   **UI 框架**: [Svelte](https://svelte.dev/) (无虚拟 DOM，编译为极小的原生 JS)
*   **构建工具**: [Vite](https://vitejs.dev/) (秒级热更新，极致构建优化)
*   **样式库**: [Tailwind CSS](https://tailwindcss.com/) (原子化 CSS，高效灵活)
*   **浏览器 API**: Manifest V3 (面向未来的扩展架构)

## 📥 安装指南
### 📦 快速安装 (推荐)

1.  **下载**: 前往 [Releases 页面](https://github.com/tunecc/VidBoost/releases) 下载最新版本的压缩包。
2.  **解压**: 将压缩包解压到本地任意目录。
3.  **安装**:
    *   打开 Chrome/Edge 浏览器，输入 `chrome://extensions`。
    *   开启右上角的 **开发者模式 (Developer mode)**。
    *   点击 **加载已解压的扩展程序 (Load unpacked)**。
    *   选择解压后的文件夹即可使用。

### 💻 源码安装 (开发者模式)

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/yourusername/VideoTools-Pro.git
    cd VideoTools-Pro
    ```

2.  **安装依赖**:
    ```bash
    npm install
    ```

3.  **构建项目**:
    ```bash
    npm run build
    ```
    构建完成后会生成一个 `dist` 文件夹，其中包含了编译好的扩展程序。

4.  **加载到浏览器**:
    *   打开 Chrome/Edge 浏览器，输入 `chrome://extensions` 进入扩展管理页。
    *   开启右上角的 **开发者模式 (Developer mode)**。
    *   点击 **加载已解压的扩展程序 (Load unpacked)**。
    *   选择项目目录下的 `dist` 文件夹（注意选 `dist`，不是外层目录）。

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

1.  Fork 本项目
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  提交 Pull Request

## 📄 开源协议

本项目采用 MIT 协议开源。详情请参阅 `LICENSE` 文件。
