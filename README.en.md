# vscode-gh-mirror

> [中文](./README.md) | English

An integrated **Cloudflare Workers** download service for:

- **VSCode extension discovery and download** through Open VSX
- **GitHub Release mirroring** through Worker-based download URLs

## Features

### VSCode extensions
- Search by keyword or extension ID
- Keep search state in URL parameters such as `?q=python&sort=downloads`
- Sort by downloads, name, or updated time
- Show downloads, reviews, and rating in search results
- Show metrics and history versions in extension detail pages
- Download latest and historical VSIX versions

### GitHub Release mirror
- Paste a GitHub Release asset URL
- Generate a Worker mirror download link
- Support caching and range requests
- Built-in example entries for Windows / macOS / Linux

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

This is not a generic open proxy. It is a restricted mirror service for defined download scenarios.

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
- Lightweight and easy-to-deploy VSCode extension mirror site
- GitHub Release download entry point
- Unified download proxy layer built on Cloudflare Workers

---

[Switch to 中文 README](./README.md)
