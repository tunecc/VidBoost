# VidBoost - 高性能视频增强工具 Pro

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Svelte](https://img.shields.io/badge/svelte-%23f1413d.svg?style=flat&logo=svelte&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)

**VidBoost** 是一款专为提升网页视频观看体验而设计的高性能 Chrome/Edge 扩展程序。它采用现代架构重构，专注于极低内存占用和零延迟响应，提供倍速控制、自动暂停以及针对 Bilibili 等站点的专属优化功能。

## 🚀 核心功能

*   **⚡ 极致性能**:
    *   **极低内存占用**: 通过统一的 `InputManager` 管理全局事件，大幅减少事件监听器数量。
    *   **智能休眠**: 结合 `VideoDetector` 与 Shadow DOM 穿透技术，核心逻辑仅在检测到视频时激活，平时完全静默。
    *   **零延迟同步**: 基于 `BroadcastChannel` 实现跨标签页瞬间通信（如自动暂停其他标签页），无需读写硬盘，响应速度极快。
*   **🛠 H5 视频增强**:
    *   **精准倍速**: 使用快捷键加速 (`C`)、减速 (`X`) 或重置 (`Z`) 视频播放速度（支持 +0.1/-0.1 微调）。
    *   **秒进全屏**: 按下 `Enter` 键即可瞬间切换全屏模式。
*   **🧠 智能自动化**:
    *   **自动暂停**: 开启后，当你在一个新标签页播放视频时，其他标签页的视频会自动暂停，帮你集中带宽和注意力。
    *   **Bilibili 专属模式**: 针对 Bilibili 播放器进行深度优化，防误触双击，支持极速暂停。
*   **🛡 现代简约 UI**:
    *   使用 **Svelte** 和 **Tailwind CSS** 构建，界面轻量、响应迅速。
    *   采用精致的玻璃拟态（Glassmorphism）设计风格。

## 🛠 技术栈

本项目完全基于现代 Web 技术重构，以确保最佳的性能和可维护性：

*   **核心语言**: [TypeScript](https://www.typescriptlang.org/) (严格类型检查，稳健可靠)
*   **UI 框架**: [Svelte](https://svelte.dev/) (无虚拟 DOM，编译为极小的原生 JS)
*   **构建工具**: [Vite](https://vitejs.dev/) (秒级热更新，极致构建优化)
*   **样式库**: [Tailwind CSS](https://tailwindcss.com/) (原子化 CSS，高效灵活)
*   **浏览器 API**: Manifest V3 (面向未来的扩展架构)

## 📥 安装指南

### 源码安装 (开发者模式)

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

## 📖 使用说明

点击浏览器工具栏上的 **V** 图标打开控制面板：

*   **Master Switch (主开关)**: 一键全局开启或关闭扩展的所有功能。
*   **H5 Enhancer (视频增强)**: 开启后启用以下快捷键：
    *   `C`: 加速 (+0.1x)
    *   `X`: 减速 (-0.1x)
    *   `Z`: 重置速度为 1.0x
    *   `Enter`: 切换全屏
*   **Auto Pause (自动暂停)**: 开启此功能后，播放当前视频时会自动暂停其他标签页中的视频。
*   **Bilibili Mode (B站模式)**: 开启针对 Bilibili 的专属优化。

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

1.  Fork 本项目
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的修改 (`git commit -m 'Add some AmazingFeature'`)
4.  推送到分支 (`git push origin feature/AmazingFeature`)
5.  提交 Pull Request

## 📄 开源协议

本项目采用 MIT 协议开源。详情请参阅 `LICENSE` 文件。
