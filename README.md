# VideoTools Pro (High Performance Edition)

这是经过架构重构的高性能版本，采用 **TypeScript + Svelte + Vite** 构建。

## 🌟 核心升级
1.  **极低内存占用**: 通过 `InputManager` 统一管理页面的所有键盘/鼠标事件，大幅减少监听器数量。
2.  **智能休眠**: 使用 `VideoDetector` 配合 Shadow DOM 穿透技术，只有在检测到视频时才激活核心逻辑。
3.  **零延迟同步**: 使用 `BroadcastChannel` 进行跨标签页通信（自动暂停），不读写硬盘，瞬间响应。

## 📥 安装说明 Since 2.0
1. 打开 Chrome/Edge 的扩展管理页 (`chrome://extensions`)。
2. 开启右上角的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择 `VideoTools-Pro/dist` 文件夹（注意选 `dist`，不要选外层目录）。

## 🎮 使用指南
点击浏览器右上角的 **V** 图标打开控制台：
- **Master Switch**: 一键关闭所有功能。
- **H5 Enhancer**: 开启后可用 `C` (加速), `X` (减速), `Z` (重置), `Enter` (全屏)。
- **Auto Pause**: 智能后台暂停。
- **Bilibili Mode**: 双击防误触 + 极速暂停。
