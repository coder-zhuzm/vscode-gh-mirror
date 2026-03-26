# vscode-gh-mirror

中文说明在前，English below.

---

# 中文说明

一个基于 **Cloudflare Workers** 的二合一下载站：

- **VSCode 插件站**：搜索 Open VSX 插件、查看详情、下载最新或历史版本 VSIX
- **GitHub Release 加速站**：把 GitHub release 附件链接转换成你自己的镜像下载链接

这个项目适合想快速搭一个：
- 自用 VSCode 插件下载站
- GitHub Release 加速站
- 插件 + 下载加速一体站

## 功能特性

### 1. VSCode 插件搜索与下载
- 支持搜索插件关键字或扩展 ID
- 支持结果页 URL 参数保留，例如 `?q=python&sort=downloads`
- 支持按以下方式排序：
  - 下载量
  - 名称
  - 更新时间
- 搜索结果显示：
  - 下载量
  - 评论数
  - 评分
- 插件详情页显示：
  - 插件介绍
  - 最新版本
  - 下载量 / 评论数 / 评分
  - 历史版本列表
- 支持下载：
  - 最新版本 VSIX
  - 历史版本 VSIX

### 2. GitHub Release 加速
- 输入 GitHub Release 附件地址
- 自动生成 Worker 镜像链接
- 支持直接下载
- 支持断点续传（Range）
- 支持缓存
- 页面内提供 Windows / macOS / Linux 快捷示例入口

### 3. 页面体验
- 首页导航
- 插件搜索页 `/extensions`
- 插件详情页 `/extensions/:namespace/:name`
- GitHub 加速页 `/github`
- 浏览器标签页图标（favicon）

## 路由说明

### 页面路由
- `/` 首页
- `/extensions` 插件搜索页
- `/extensions/:namespace/:name` 插件详情页
- `/github` GitHub 加速页
- `/health` 健康检查

### API 路由
- `/api/extensions/search?q=python`
- `/api/extensions/:namespace/:name`
- `/api/extensions/:namespace/:name/:version/download`
- `/api/github/resolve?url=...`

### GitHub 镜像下载路径
- `/:owner/:repo/releases/download/:tag/:file`

## 支持的上游源

当前仅允许以下源站被代理：

- `github.com`
- `open-vsx.org`
- `objects.githubusercontent.com`
- `release-assets.githubusercontent.com`

这意味着它**不是一个通用开放代理**，而是一个受限、面向实际下载场景的镜像站。

## 缓存策略

- 搜索结果：短缓存
- 插件详情：中等缓存
- 二进制下载（VSIX / GitHub Release 附件）：长缓存

响应头里会带：

- `X-Worker-Cache: HIT | MISS`
- `X-Proxy-Source: github | openvsx`

## 部署方式

### 1. 安装 Wrangler

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 本地开发

```bash
wrangler dev
```

### 4. 部署

```bash
wrangler deploy
```

## `wrangler.toml`

项目默认配置：

```toml
name = "vscode-gh-mirror"
main = "worker.js"
compatibility_date = "2024-01-01"
```

如果 Worker 名称冲突，可以改 `name`。

## 使用示例

### 搜索插件

```text
/ extensions?q=python&sort=downloads
```

### 插件详情

```text
/ extensions/ms-python/python
```

### 生成 GitHub 加速链接
原始地址：

```text
https://github.com/microsoft/vscode/releases/download/1.85.0/VSCode-win32-x64-1.85.0.zip
```

镜像地址：

```text
https://your-worker.workers.dev/microsoft/vscode/releases/download/1.85.0/VSCode-win32-x64-1.85.0.zip
```

## 项目定位

这个项目不是完整替代官方 Marketplace，也不是一个通用文件代理。
它的定位是：

- 一个轻量可部署的 VSCode 插件下载站
- 一个 GitHub Release 加速站
- 一个适合继续扩展的 Cloudflare Worker 下载中枢

## 后续可继续优化

- 插件详情页分页和版本折叠
- 热门插件分类
- 下载统计面板
- 自定义域名后的品牌化 UI
- 接入 KV / R2 做更强缓存和数据管理

---

# English

A dual-purpose **Cloudflare Workers** project for:

- **VSCode extension discovery and download** through Open VSX
- **GitHub Release acceleration** through Worker-based mirror URLs

It is designed for people who want a lightweight deployable site that combines extension downloads and GitHub asset acceleration.

## Features

### VSCode extensions
- Search by keyword or extension ID
- Keep search state in URL parameters, such as `?q=python&sort=downloads`
- Sort by:
  - downloads
  - name
  - updated time
- Show metrics in search results:
  - downloads
  - reviews
  - rating
- Extension detail page includes:
  - description
  - latest version
  - downloads / reviews / rating
  - history version list
- Download:
  - latest VSIX
  - historical VSIX versions

### GitHub Release mirror
- Paste a GitHub release asset URL
- Generate a Worker mirror link
- Direct download support
- Range request support
- Cache support
- Built-in OS quick examples for Windows / macOS / Linux

### Front-end pages
- Home page
- Extension search page `/extensions`
- Extension detail page `/extensions/:namespace/:name`
- GitHub mirror page `/github`
- Browser tab favicon

## Routes

### Pages
- `/`
- `/extensions`
- `/extensions/:namespace/:name`
- `/github`
- `/health`

### APIs
- `/api/extensions/search?q=python`
- `/api/extensions/:namespace/:name`
- `/api/extensions/:namespace/:name/:version/download`
- `/api/github/resolve?url=...`

### GitHub mirror path
- `/:owner/:repo/releases/download/:tag/:file`

## Allowed upstreams

Only these upstream hosts are allowed:

- `github.com`
- `open-vsx.org`
- `objects.githubusercontent.com`
- `release-assets.githubusercontent.com`

So this project is **not** an open generic proxy.

## Cache strategy

- Search: short cache
- Extension detail: medium cache
- Binary downloads: long cache

Response headers include:

- `X-Worker-Cache: HIT | MISS`
- `X-Proxy-Source: github | openvsx`

## Deploy

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

## Default `wrangler.toml`

```toml
name = "vscode-gh-mirror"
main = "worker.js"
compatibility_date = "2024-01-01"
```

## Suggested positioning

This project is best described as:

- a lightweight VSCode extension mirror site
- a GitHub Release accelerator
- a deployable download hub built on Cloudflare Workers
