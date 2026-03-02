# VidBoost - 浏览器专属的高阶视频增强与效率插件

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Svelte](https://img.shields.io/badge/svelte-%23f1413d.svg?style=flat&logo=svelte&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)

## 🌟 为什么选择 VidBoost？

本来为了视频倍速、屏蔽特定元素等需求，在浏览器中安装了多个散杂的篡改猴脚本。但它们总是因为互相冲突、性能负担或各种 Bug 导致体验割裂。**VidBoost** 的诞生就是为了把这些高频、刚需的视频控制功能融合到一个极其精简、低内存占用、高稳定性的原生插件中。

---

<p align="center">
  <img src="./assets/light_mode.png" width="48%" alt="浅色模式主界面" />
  &nbsp;
  <img src="./assets/dark_mode.png" width="48%" alt="深色模式主界面" />
</p>

## 🧩 核心功能模块与使用场景

这里我们将 VidBoost 提供的四大核心能力拆解介绍。

### 1. ⚙️ 通用增强 (General)

**h5player - 丝滑的全局视频倍速控制**

无论是学习网课还是追剧，浏览器原生的播放器往往缺少好用的快捷键。

- **使用场景**：当你在任何网站观看 HTML5 视频时，只需要按下键盘上的数字键 `1` 到 `6`，即可瞬间切换到对应的倍速（1x 到 6x）。助你光速度过视频中的“垃圾时间”。
- **优化细节**：支持屏蔽 YouTube 原生的数字键跳跃功能，彻底解决想要切换到 3 倍速却意外跳到进度条 30% 处的痛点。

<p align="center">
  <img src="./assets/h5_setting.png" width="50%" alt="h5player 倍速控制截图" />
</p>

**Auto Pause - 智能后台视频暂停**

当你在多个标签页查阅资料时，后台标签页里的视频声音往往会干扰你。

- **使用场景**：启用此功能后，只要你切换到别的标签页或是浏览器窗口失去了焦点，当前正在播放的视频就会**自动暂停**；当你切回来时，它又能无缝继续播放。
- **高度定制**：你可以选择“全局生效”，或是“仅在指定网站生效”（例如仅在 YouTube 和 Bilibili 开启，或是自定义填入其他网址）。当然，如果你需要让它后台挂机听歌，可以直接在插件面板里一键开启“允许后台继续播放”。

<p align="center">
  <img src="./assets/auto_pause.png" width="48%" alt="Auto Pause 设置截图" />
</p>

### 2. YouTube 专属增强

<p align="center">
  <img src="./assets/youtube.png" width="70%" alt="YouTube 设置截图" />
</p>

在 YouTube 的首页推荐或是订阅流里，总会混杂着需要付费成为频道会员才能观看的视频。

- **使用场景 (智能过滤会员视频)**：如果你经常被推荐无法看的会员视频打扰，甚至点进去才发现无法观看，这个功能为你提供了三种净化模式：
  - **全部屏蔽**：一刀切，让信息流里不再出现任何会员专属视频。
  - **白名单模式 (仅允许)**：默认拦截所有会员视频，但放行你已经开通了会员的特定频道。
  - **黑名单模式 (仅屏蔽)**：只屏蔽你特别指定的不想看到其会员视频的频道，其他频道的保留。
- **操作体验**：我们设计了极简美观的频道标签输入框，你不仅可以快速添加，还能点击任意已有频道名称进行原地无缝编辑，并且完全原生支持响应式布局排版。

<p align="center">
  <img src="./assets/youtube_filter.png" width="70%" alt="YouTube 会员屏蔽设置截图" />
</p>

### 3. Bilibili 专属增强
<p align="center">
  <img src="./assets/bilibili.png" width="70%" alt="Bilibili 设置" />
</p>
针对国内最常用的弹幕视频网站做的额外适配与深度优化。

- **使用场景一 (防误触)**：在 B 站看视频频繁点击暂停/播放时，容易触发原生的“双击全屏”，导致画面乱跳。开启**禁用双击全屏**后，你的连击将变得从容。并且支持禁止观看时按空格键导致整个网页大面积滚动。
- **使用场景二 (CDN 网络切换)**：海外用户或部分网络环境下，B 站默认的 CDN 可能会卡顿。这里提供了直观且原生的 **CDN 切换器面板**，帮你一键对所有可用节点进行真实测速，以便你能够直观地手动切换到最高速的视频播放节点（同时支持番剧增强模式）。

<p align="center">
  <img src="./assets/bilibili_cdn.png" width="70%" alt="Bilibili CDN与增强功能截图" />
</p>

<details>
  <summary>📸 点击展开查看：完整的 B 站增强设置面板长截图</summary>
  <p align="center">
    <img src="./assets/bilibili_cdnset.png" width="70%" alt="Bilibili CDN与增强功能设置长截图" />
  </p>
</details>

---

## 🚀 极致性能说明

VidBoost 在性能上毫不妥协：
- **零延迟通信**：不依赖硬盘读写，通过最新的 `BroadcastChannel` 等机制进行瞬间跨标签页通信（例如一旦失去焦点立刻跨域触发暂停）。
- **静默休眠技术**：基于 `VideoDetector` 与 Shadow DOM 判断机制，只在页面真正出现真正视频标签时才会激活相关逻辑，平时处于近乎零内存占用的静默休眠状态。
- **极低内存占用**：通过统一的 `InputManager` 管理事件钩子，大幅减少浏览器层面的事件监听器堆叠。

## 🛠 技术栈

本项目完全基于现代 Web 技术重构，以确保最佳的性能和可维护性：

*   **核心语言**: [TypeScript](https://www.typescriptlang.org/) (严格类型检查，稳健可靠)
*   **UI 框架**: [Svelte](https://svelte.dev/) (无虚拟 DOM，编译为极小的原生 JS)
*   **构建工具**: [Vite](https://vitejs.dev/) (秒级热更新，极致构建优化)
*   **样式库**: [Tailwind CSS](https://tailwindcss.com/) (原子化 CSS，高效灵活)
*   **浏览器 API**: Manifest V3 (面向未来的插件底层架构)

## 📥 安装指南

### 官方商店下载 (推荐)
已上架 Chrome 插件商店，享受云端自动更新：
[👉 点我直达 Chrome Web Store 下载 VidBoost](https://chromewebstore.google.com/detail/vidboost/bjehghokgbfmceggcbpjgmahgjgpgbia?authuser=0&hl=zh-CN)

### 💻 源码安装 (开发者模式)

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/tunecc/VidBoost.git
    cd VidBoost
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
