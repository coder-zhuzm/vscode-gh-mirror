# vscode-gh-mirror

> [中文](./README.md) | English

A dual-purpose **Cloudflare Workers** project for:

- **VSCode extension discovery and download** through Open VSX
- **GitHub Release acceleration** through Worker-based mirror URLs

## Features

### VSCode extensions
- Search by keyword or extension ID
- Keep search state in URL parameters such as `?q=python&sort=downloads`
- Sort by downloads, name, or updated time
- Show downloads, reviews, and rating in search results
- Show metrics and history versions in extension detail pages
- Download latest and historical VSIX versions

### GitHub Release mirror
- Paste a GitHub release asset URL
- Generate a Worker mirror link
- Support cache and range requests
- Built-in OS quick examples for Windows / macOS / Linux

### Pages
- Home page `/`
- Extension page `/extensions`
- Extension detail page `/extensions/:namespace/:name`
- GitHub mirror page `/github`
- Health check `/health`

## API routes
- `/api/extensions/search?q=python`
- `/api/extensions/:namespace/:name`
- `/api/extensions/:namespace/:name/:version/download`
- `/api/github/resolve?url=...`

## GitHub mirror path
- `/:owner/:repo/releases/download/:tag/:file`

## Allowed upstreams
- `github.com`
- `open-vsx.org`
- `objects.githubusercontent.com`
- `release-assets.githubusercontent.com`

This is not an open generic proxy. It is a focused download site.

## Cache strategy
- Search: short cache
- Extension detail: medium cache
- Binary downloads: long cache

Response headers:
- `X-Worker-Cache: HIT | MISS`
- `X-Proxy-Source: github | openvsx`

## Deploy

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

Default `wrangler.toml`:

```toml
name = "vscode-gh-mirror"
main = "worker.js"
compatibility_date = "2024-01-01"
```

## Positioning
- Lightweight VSCode extension mirror site
- GitHub Release accelerator
- Download hub built on Cloudflare Workers

---

[Switch to 中文 README](./README.md)
