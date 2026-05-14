# GitHub Actions 自动发布说明

## 这套流程现在做了什么

仓库已经补了一条 GitHub Actions 发布链：

- 触发条件：推送 `v*` tag，例如 `v1.6.3`
- 执行动作：
  - 校验版本一致性
  - 构建 Chrome / Firefox 产物
  - 校验打包结果
  - 生成 GitHub Release Notes
  - 创建或更新 GitHub Release，并上传附件

工作流文件：

- `.github/workflows/release.yml`

## 版本号从哪里来

当前项目的版本需要保持三处一致：

- `package.json`
- `package-lock.json`
- `public/manifest.json`

为避免手改漏掉，仓库新增了：

```bash
npm run version:set -- 1.6.3
```

这会同时更新上面三处，并告诉你下一个应该打的 tag：

```text
v1.6.3
```

另外还有一致性校验：

```bash
npm run version:check -- --expected-tag v1.6.3
```

CI 里会自动跑这条命令。如果 tag 是 `v1.6.3`，但仓库里还是 `1.6.2`，发布会直接失败。

## 更新说明怎么生成

现在改成了两层：

- 第一层：你维护 `CHANGELOG.md` 里的版本摘要
- 第二层：脚本自动整理 tag 之间的代码变更

这样做出来的效果会更接近成熟项目，而不是只有一条 commit 被机械翻译出来。

仓库新增了：

```bash
npm run release:notes -- --current-tag v1.6.3 --repo tunecc/VidBoost
```

它现在会：

1. 找到上一个 tag
2. 先尝试读取 `CHANGELOG.md` 中当前版本对应的条目
3. 再读取这两个 tag 之间的 git commits
4. 按提交前缀分类

当前优先识别这些类型：

- `feat:` -> 新功能
- `fix:` -> 修复
- `perf:` -> 性能优化
- `refactor:` -> 重构
- `docs:` / `build:` / `ci:` / `chore:` / `test:`

如果不是标准 Conventional Commit，也会尽量做中文规则归类，比如：

- `修复...` -> 修复
- `新增...` / `优化...` / `增强...` -> 新功能

所以现在的建议是：

- 用户真正关心的内容，你写进 `CHANGELOG.md`
- 代码级变更明细，交给脚本自动补全

这样你的 Release 页面会先看到“像产品公告”的摘要，再看到“像工程记录”的自动分类明细。

## 本地发版步骤

### 1. 更新版本

```bash
npm run version:set -- 1.6.3
```

### 2. 本地验证

```bash
npm run prepare:release
```

它会输出：

- `releases/chrome/vidboost-chrome-1.6.3.zip`
- `releases/firefox/vidboost-firefox-1.6.3-unsigned.xpi`
- `releases/firefox/vidboost-firefox-1.6.3-source.zip`

### 3. 查看自动生成的更新说明

```bash
npm run release:notes -- --current-tag v1.6.3 --repo tunecc/VidBoost
```

如果你要显式指定 changelog 文件，也可以传入：

```bash
npm run release:notes -- \
  --current-tag v1.6.3 \
  --repo tunecc/VidBoost \
  --changelog CHANGELOG.md
```

### 4. 提交并打 tag

```bash
git add package.json package-lock.json public/manifest.json .github/workflows/release.yml scripts docs
git commit -m "build: add GitHub Actions release workflow"
git tag v1.6.3
git push origin main --tags
```

### 5. 等 GitHub Actions 自动创建 Release

发布成功后，GitHub Release 会自动挂上附件。

GitHub Action 内部会优先读取：

- `CHANGELOG.md` 里当前版本的条目

如果当前版本在 `CHANGELOG.md` 里有内容，Release 顶部会先显示这份摘要；如果没有，就退回到纯自动生成模式。

## 这套流程不做什么

- 不会自动发布到 Chrome Web Store
- 不会自动提交到 AMO
- 不会自动签名 Firefox XPI

当前 GitHub Release 负责的是：

- 统一构建
- 统一校验
- 统一产出可下载附件
- 统一生成更新说明

商店发布仍然可以继续保留手工流程，后面如果你愿意，我们再单独补自动上传链路。

## 为什么先用 tag 触发

这是最稳的一种方式，因为：

- tag 天然就是“我要发布这个版本”的明确动作
- GitHub Release 也天然和 tag 绑定
- 你可以先本地验证，再决定要不要打 tag

对你来说可以这样理解：

- 改 `version`：声明“下一个版本是多少”
- 打 `v1.6.3` tag：声明“现在正式发布这个版本”
