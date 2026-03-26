# vscode-gh-mirror

> 默认中文说明 | [English](./README.en.md)

一个基于 **Cloudflare Workers** 的二合一下载站：

- **VSCode 插件站**：搜索 Open VSX 插件、查看详情、下载最新或历史版本 VSIX
- **GitHub Release 加速站**：把 GitHub release 附件链接转换成你自己的镜像下载链接

## 功能特性

### VSCode 插件搜索与下载
- 支持搜索插件关键字或扩展 ID
- 支持结果页 URL 参数保留，例如 `?q=python&sort=downloads`
- 支持按下载量、名称、更新时间排序
- 搜索结果显示下载量、评论数、评分
- 插件详情页显示统计信息与历史版本列表
- 支持下载最新版本和历史版本 VSIX

### GitHub Release 加速
- 输入 GitHub Release 附件地址
- 自动生成 Worker 镜像链接
- 支持缓存和断点续传
- 页面内提供 Windows / macOS / Linux 快捷示例入口

### 页面能力
- 首页 `/`
- 插件页 `/extensions`
- 插件详情页 `/extensions/:namespace/:name`
- GitHub 加速页 `/github`
- 健康检查 `/health`

## API 路由
- `/api/extensions/search?q=python`
- `/api/extensions/:namespace/:name`
- `/api/extensions/:namespace/:name/:version/download`
- `/api/github/resolve?url=...`

## GitHub 镜像路径
- `/:owner/:repo/releases/download/:tag/:file`

## 支持的上游源
- `github.com`
- `open-vsx.org`
- `objects.githubusercontent.com`
- `release-assets.githubusercontent.com`

这不是通用开放代理，而是一个受限的实际下载站。

## 缓存策略
- 搜索结果：短缓存
- 插件详情：中缓存
- 二进制下载：长缓存

响应头：
- `X-Worker-Cache: HIT | MISS`
- `X-Proxy-Source: github | openvsx`

## 部署

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

默认 `wrangler.toml`：

```toml
name = "vscode-gh-mirror"
main = "worker.js"
compatibility_date = "2024-01-01"
```

## 项目定位
- 轻量可部署的 VSCode 插件下载站
- GitHub Release 加速站
- 基于 Cloudflare Workers 的下载中枢

---

[切换到 English README](./README.en.md)
