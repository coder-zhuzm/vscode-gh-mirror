# 🚀 GitHub Mirror

A high-speed GitHub release mirror powered by Cloudflare Workers. Transform GitHub release URLs into blazing-fast, globally cached download links.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

## ✨ Features

- **⚡ Edge Cached** - Files are cached at Cloudflare's global CDN for maximum download speeds
- **🔄 Resumable Downloads** - Full support for Range requests and download managers
- **🌍 Global Network** - Served from 300+ data centers worldwide
- **🎨 Modern UI** - Beautiful, responsive interface with glassmorphism design
- **📋 One-Click Copy** - Easily copy mirror links to clipboard
- **🔒 Reliable** - Powered by Cloudflare's robust infrastructure

## 🚀 Quick Start

### Deploy to Cloudflare Workers

1. **Clone the repository**

   ```bash
   git clone https://github.com/creasydude/github-mirror.git
   cd github-mirror
   ```

2. **Install Wrangler CLI**

   ```bash
   npm install -g wrangler
   ```

3. **Login to Cloudflare**

   ```bash
   wrangler login
   ```

4. **Deploy**
   ```bash
   wrangler deploy
   ```

### Configuration

Create a `wrangler.toml` file in the project root:

```toml
name = "github-mirror"
main = "worker.js"
compatibility_date = "2024-01-01"
```

## 📖 Usage

1. Visit your deployed worker URL
2. Paste a GitHub release URL (e.g., `https://github.com/user/repo/releases/download/v1.0/file.zip`)
3. Click "Generate Mirror Link"
4. Use the generated mirror URL for faster downloads

### Example

**Original URL:**

```
https://github.com/microsoft/vscode/releases/download/1.85.0/VSCode-win32-x64-1.85.0.zip
```

**Mirror URL:**

```
https://your-worker.workers.dev/microsoft/vscode/releases/download/1.85.0/VSCode-win32-x64-1.85.0.zip
```

## 🔧 How It Works

1. **Request Received** - User requests a file through the mirror
2. **Cache Check** - Worker checks Cloudflare's edge cache
3. **Cache Hit** - If cached, serve immediately (blazing fast!)
4. **Cache Miss** - Fetch from GitHub, cache for 1 year, then serve
5. **Global Distribution** - Cached files available at all edge locations

## 📊 Performance

| Metric  | Direct GitHub | GitHub Mirror     |
| ------- | ------------- | ----------------- |
| Latency | Variable      | Low (edge-served) |
| Speed   | Standard      | Accelerated       |
| Caching | None          | 1 Year TTL        |
| Resume  | Limited       | Full Support      |

## 🛠️ Technical Details

- **Cache TTL**: 1 year (31,536,000 seconds)
- **CORS**: Enabled for all origins
- **Headers**: Custom `X-Worker-Cache` header indicates HIT/MISS
- **Streaming**: Low memory footprint with response streaming

## 📄 License

MIT License - feel free to use this project for any purpose.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 👤 Author

**[@creasydude](https://github.com/creasydude)**

---

<p align="center">
  Made with ❤️ and powered by <a href="https://workers.cloudflare.com">Cloudflare Workers</a>
</p>
