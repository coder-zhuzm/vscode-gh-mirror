# Download Hub Worker

A Cloudflare Worker that combines two jobs in one lightweight project:

- **GitHub Release acceleration**: turn GitHub release asset links into cached mirror links
- **VSCode extension discovery and download**: search Open VSX and download VSIX files through the same proxy layer

This project started from `creasydude/github-mirror` and was reshaped into a dual-purpose developer download hub.

## What it does

### 1. GitHub Release mirror
- Accepts GitHub release asset URLs
- Generates mirror links on your own Worker domain
- Preserves streaming downloads
- Supports `Range` requests for resumable downloads
- Uses long edge caching for binary files

### 2. VSCode extension search + download
- Searches the Open VSX registry
- Returns extension metadata and versions
- Generates worker-hosted VSIX download links
- Reuses the same binary proxy layer and cache strategy

## Current architecture

Everything is currently kept in a single `worker.js` for easy deployment.

Main route groups:

- `/` — unified landing page
- `/health` — health endpoint
- `/api/github/resolve?url=...` — resolve GitHub release URL to mirror URL
- `/api/extensions/search?q=...` — search Open VSX
- `/api/extensions/:namespace/:name` — extension detail JSON
- `/api/extensions/:namespace/:name/:version/download` — proxied VSIX download
- `/:owner/:repo/releases/download/:tag/:file` — proxied GitHub release asset download

## Supported upstreams

The Worker only proxies allowed upstream hosts:

- `github.com`
- `open-vsx.org`
- `objects.githubusercontent.com`
- `release-assets.githubusercontent.com`

This is intentional. It is **not** an open generic proxy.

## Cache strategy

- Search results: short cache (`15 min`)
- Extension detail: medium cache (`30 min`)
- Binary downloads: long cache (`1 year`)

Response headers:

- `X-Worker-Cache: HIT|MISS`
- `X-Proxy-Source: github|openvsx`

## Deploy

### 1. Install Wrangler

```bash
npm install -g wrangler
```

### 2. Login

```bash
wrangler login
```

### 3. Create `wrangler.toml`

```toml
name = "download-hub-worker"
main = "worker.js"
compatibility_date = "2024-01-01"
```

### 4. Deploy

```bash
wrangler deploy
```

## Local development

You can run it locally with Wrangler:

```bash
wrangler dev
```

## Example usage

### GitHub release mirror

Original URL:

```text
https://github.com/microsoft/vscode/releases/download/1.85.0/VSCode-win32-x64-1.85.0.zip
```

Mirror URL after deployment:

```text
https://your-worker.workers.dev/microsoft/vscode/releases/download/1.85.0/VSCode-win32-x64-1.85.0.zip
```

### Search extensions

```text
GET /api/extensions/search?q=python
```

### Extension detail

```text
GET /api/extensions/ms-python/python
```

### Download VSIX through the Worker

```text
GET /api/extensions/ms-python/python/<version>/download
```

## Notes and limitations

- The VSCode extension part currently targets **Open VSX**, not the full Microsoft Marketplace.
- The GitHub mirror part only supports **release asset paths**, not arbitrary GitHub pages.
- This is an MVP structure focused on easy Cloudflare deployment and later iteration.

## Suggested next improvements

- Split `worker.js` into route/service modules
- Add a dedicated extension detail page in the UI
- Add preset popular extension sections by category
- Add optional KV/R2 support for metadata or durable caching
- Improve GitHub URL parsing for more edge cases
- Add rate limiting if you expose the worker publicly

## Local project path

This project is currently cloned and being modified at:

```text
/root/.openclaw/workspace/projects/vscode-gh-mirror
```

## Credit

Original base project:
- `creasydude/github-mirror`
