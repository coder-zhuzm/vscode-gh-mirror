/**
 * Cloudflare Worker: VSCode Extensions + GitHub Release Mirror
 *
 * Combined features:
 * - GitHub release acceleration with edge caching and range support
 * - VS Code extension search/detail via Open VSX
 * - VSIX download acceleration via the same proxy core
 *
 * Notes:
 * - Only whitelisted upstreams are proxied
 * - Download streaming is preserved for large files
 * - Search/detail endpoints use shorter cache TTLs than binary downloads
 */

const GITHUB_URL = 'https://github.com';
const OPEN_VSX_API = 'https://open-vsx.org/api';
const OPEN_VSX_HOST = 'open-vsx.org';
const DOWNLOAD_CACHE_TTL = 31536000; // 1 year
const SEARCH_CACHE_TTL = 900; // 15 min
const DETAIL_CACHE_TTL = 1800; // 30 min

const HOT_EXTENSIONS = [
  'ms-python.python',
  'esbenp.prettier-vscode',
  'dbaeumer.vscode-eslint',
  'ms-vscode.cpptools',
  'golang.go',
  'ms-azuretools.vscode-docker',
  'redhat.java',
  'eamodio.gitlens'
];

const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Download Hub · VSCode Extensions + GitHub Mirror</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b1020;
      --panel: rgba(255,255,255,0.06);
      --panel-border: rgba(255,255,255,0.12);
      --panel-strong: rgba(255,255,255,0.09);
      --text: #eef2ff;
      --muted: rgba(238,242,255,0.66);
      --subtle: rgba(238,242,255,0.45);
      --primary: #7c3aed;
      --primary-2: #2563eb;
      --success: #10b981;
      --danger: #ef4444;
      --chip: rgba(255,255,255,0.08);
      --chip-border: rgba(255,255,255,0.1);
      --shadow: 0 12px 40px rgba(0,0,0,0.35);
      --radius: 20px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(37,99,235,0.22), transparent 35%),
        radial-gradient(circle at top right, rgba(124,58,237,0.22), transparent 35%),
        radial-gradient(circle at bottom, rgba(16,185,129,0.12), transparent 35%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .container {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    .hero {
      text-align: center;
      padding: 28px 0 18px;
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(32px, 4vw, 52px);
      letter-spacing: -0.04em;
    }
    .hero p {
      margin: 16px auto 0;
      max-width: 760px;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.7;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 20px;
      margin-top: 28px;
      align-items: start;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      overflow: hidden;
    }
    .panel-head {
      padding: 20px 22px 8px;
    }
    .panel-title {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
    }
    .panel-desc {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }
    .panel-body {
      padding: 20px 22px 22px;
    }
    .field {
      margin-bottom: 14px;
    }
    .label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 600;
    }
    input {
      width: 100%;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.24);
      color: var(--text);
      border-radius: 14px;
      padding: 15px 16px;
      font: inherit;
      outline: none;
      transition: 0.18s ease;
    }
    input:focus {
      border-color: rgba(99,102,241,0.75);
      box-shadow: 0 0 0 4px rgba(99,102,241,0.18);
    }
    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button, .btn {
      border: 0;
      border-radius: 14px;
      padding: 14px 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: 0.18s ease;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn-primary {
      color: white;
      background: linear-gradient(135deg, var(--primary), var(--primary-2));
      box-shadow: 0 10px 24px rgba(79,70,229,0.32);
    }
    .btn-primary:hover { transform: translateY(-1px); }
    .btn-secondary {
      color: var(--text);
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.11); }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }
    .chip {
      border: 1px solid var(--chip-border);
      background: var(--chip);
      color: var(--text);
      border-radius: 999px;
      padding: 10px 14px;
      font-size: 13px;
      cursor: pointer;
    }
    .status {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      font-size: 14px;
      display: none;
      line-height: 1.5;
    }
    .status.show { display: block; }
    .status.info { background: rgba(59,130,246,0.14); color: #bfdbfe; border: 1px solid rgba(59,130,246,0.28); }
    .status.success { background: rgba(16,185,129,0.14); color: #bbf7d0; border: 1px solid rgba(16,185,129,0.28); }
    .status.error { background: rgba(239,68,68,0.14); color: #fecaca; border: 1px solid rgba(239,68,68,0.28); }
    .section-title {
      margin: 18px 0 12px;
      font-size: 14px;
      color: var(--muted);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .results {
      display: grid;
      gap: 12px;
      margin-top: 10px;
    }
    .ext-card {
      background: var(--panel-strong);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 16px;
    }
    .ext-top {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .ext-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
      flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .ext-icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ext-name {
      margin: 0;
      font-size: 17px;
    }
    .ext-meta {
      margin-top: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    .ext-desc {
      margin-top: 10px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .ext-actions {
      margin-top: 14px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      word-break: break-all;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 20px;
    }
    .feature {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 16px;
    }
    .feature h4 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .feature p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    footer {
      margin-top: 28px;
      text-align: center;
      color: var(--subtle);
      font-size: 13px;
    }
    a { color: #c4b5fd; }
    @media (max-width: 920px) {
      .grid { grid-template-columns: 1fr; }
      .features { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <section class="hero">
      <h1>Download Hub</h1>
      <p>
        One Cloudflare Worker for two jobs: accelerate GitHub release downloads and make VSCode extension search and VSIX downloads easier through Open VSX.
      </p>
    </section>

    <div class="grid">
      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">VSCode Extensions</h2>
          <p class="panel-desc">Search Open VSX, inspect extension metadata, then download via this worker for a faster and more consistent path.</p>
        </div>
        <div class="panel-body">
          <div class="field">
            <label class="label" for="extQuery">Search by name, publisher, or extension id</label>
            <input id="extQuery" placeholder="python, prettier, dbaeumer.vscode-eslint">
          </div>
          <div class="row">
            <button class="btn-primary" id="searchBtn">Search extensions</button>
          </div>

          <div class="section-title">Hot extensions</div>
          <div class="chips" id="hotChips"></div>

          <div class="status info" id="extStatus"></div>
          <div class="results" id="extResults"></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2 class="panel-title">GitHub Release Mirror</h2>
          <p class="panel-desc">Turn a GitHub release asset URL into a worker URL with edge caching, resumable downloads, and stable copy/paste flow.</p>
        </div>
        <div class="panel-body">
          <div class="field">
            <label class="label" for="ghUrl">GitHub release asset URL</label>
            <input id="ghUrl" placeholder="https://github.com/user/repo/releases/download/v1.0/file.zip">
          </div>
          <div class="row">
            <button class="btn-primary" id="ghBtn">Generate mirror link</button>
            <button class="btn-secondary" id="ghCopyBtn" style="display:none;">Copy</button>
          </div>
          <div class="status info" id="ghStatus"></div>
          <div class="results" id="ghResults"></div>
        </div>
      </section>
    </div>

    <section class="features">
      <div class="feature">
        <h4>Shared download core</h4>
        <p>GitHub releases and VSIX downloads go through the same streaming proxy layer with source whitelisting.</p>
      </div>
      <div class="feature">
        <h4>Cache-aware responses</h4>
        <p>Short cache for metadata, long cache for binary downloads, plus explicit response headers for easier debugging.</p>
      </div>
      <div class="feature">
        <h4>Cloudflare-friendly MVP</h4>
        <p>No heavy backend. Just one worker entry that you can later split, restyle, or expand with KV/R2 if needed.</p>
      </div>
    </section>

    <footer>
      Built from a GitHub mirror base and extended into a dual-purpose developer download hub.
    </footer>
  </div>

  <script>
    const HOT_EXTENSIONS = ${JSON.stringify(HOT_EXTENSIONS)};
    const extQuery = document.getElementById('extQuery');
    const searchBtn = document.getElementById('searchBtn');
    const extStatus = document.getElementById('extStatus');
    const extResults = document.getElementById('extResults');
    const hotChips = document.getElementById('hotChips');

    const ghUrl = document.getElementById('ghUrl');
    const ghBtn = document.getElementById('ghBtn');
    const ghCopyBtn = document.getElementById('ghCopyBtn');
    const ghStatus = document.getElementById('ghStatus');
    const ghResults = document.getElementById('ghResults');

    let currentMirrorLink = '';

    function setStatus(el, type, message) {
      el.className = 'status show ' + type;
      el.textContent = message;
    }

    function clearStatus(el) {
      el.className = 'status';
      el.textContent = '';
    }

    function escapeHtml(str = '') {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderHotExtensions() {
      hotChips.innerHTML = HOT_EXTENSIONS.map(id => '<button class="chip" data-id="' + escapeHtml(id) + '">' + escapeHtml(id) + '</button>').join('');
      hotChips.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => {
          extQuery.value = btn.dataset.id;
          searchExtensions();
        });
      });
    }

    function extCard(ext) {
      const icon = ext.iconUrl ? '<img src="' + escapeHtml(ext.iconUrl) + '" alt="icon">' : '';
      const downloadBtn = ext.downloadUrl
        ? '<a class="btn btn-primary" href="' + escapeHtml(ext.downloadUrl) + '" target="_blank" rel="noopener noreferrer">Download latest</a>'
        : '';
      const detailBtn = ext.namespace && ext.name
        ? '<a class="btn btn-secondary" href="/api/extensions/' + encodeURIComponent(ext.namespace) + '/' + encodeURIComponent(ext.name) + '" target="_blank" rel="noopener noreferrer">View JSON</a>'
        : '';
      const sourceBtn = ext.sourceUrl
        ? '<a class="btn btn-secondary" href="' + escapeHtml(ext.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Open source</a>'
        : '';

      return '<article class="ext-card">'
        + '<div class="ext-top">'
        + '<div class="ext-icon">' + icon + '</div>'
        + '<div>'
        + '<h3 class="ext-name">' + escapeHtml(ext.displayName || (ext.namespace + '.' + ext.name)) + '</h3>'
        + '<div class="ext-meta mono">' + escapeHtml(ext.namespace + '.' + ext.name) + ' · v' + escapeHtml(ext.version || 'unknown') + '</div>'
        + (ext.publisher ? '<div class="ext-meta">Publisher: ' + escapeHtml(ext.publisher) + '</div>' : '')
        + '</div></div>'
        + '<div class="ext-desc">' + escapeHtml(ext.description || 'No description available.') + '</div>'
        + '<div class="ext-actions">' + downloadBtn + detailBtn + sourceBtn + '</div>'
        + '</article>';
    }

    async function searchExtensions() {
      const q = extQuery.value.trim();
      extResults.innerHTML = '';
      if (!q) {
        setStatus(extStatus, 'error', 'Enter an extension keyword or extension id first.');
        return;
      }

      setStatus(extStatus, 'info', 'Searching Open VSX...');
      try {
        const res = await fetch('/api/extensions/search?q=' + encodeURIComponent(q));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed');

        if (!data.results || !data.results.length) {
          setStatus(extStatus, 'error', 'No matching extensions found.');
          return;
        }

        setStatus(extStatus, 'success', 'Found ' + data.results.length + ' extension(s).');
        extResults.innerHTML = data.results.map(extCard).join('');
      } catch (err) {
        setStatus(extStatus, 'error', err.message || 'Search failed.');
      }
    }

    function generateMirrorLink() {
      clearStatus(ghStatus);
      ghResults.innerHTML = '';
      ghCopyBtn.style.display = 'none';
      const input = ghUrl.value.trim();
      if (!input) {
        setStatus(ghStatus, 'error', 'Enter a GitHub release asset URL first.');
        return;
      }

      try {
        const url = new URL(input);
        if (url.hostname !== 'github.com') {
          throw new Error('Only github.com release URLs are supported here.');
        }
        if (!/\/releases\/download\//.test(url.pathname)) {
          throw new Error('This does not look like a GitHub release asset URL.');
        }

        currentMirrorLink = window.location.origin + url.pathname;
        ghResults.innerHTML = '<article class="ext-card">'
          + '<div class="ext-desc"><strong>Mirror URL</strong></div>'
          + '<div class="ext-meta mono" style="margin-top:10px;">' + escapeHtml(currentMirrorLink) + '</div>'
          + '<div class="ext-actions" style="margin-top:14px;">'
          + '<a class="btn btn-primary" href="' + escapeHtml(currentMirrorLink) + '" target="_blank" rel="noopener noreferrer">Open mirror link</a>'
          + '</div></article>';
        ghCopyBtn.style.display = 'inline-flex';
        setStatus(ghStatus, 'success', 'Mirror link generated.');
      } catch (err) {
        setStatus(ghStatus, 'error', err.message || 'Invalid URL.');
      }
    }

    async function copyMirrorLink() {
      if (!currentMirrorLink) return;
      try {
        await navigator.clipboard.writeText(currentMirrorLink);
        setStatus(ghStatus, 'success', 'Mirror link copied to clipboard.');
      } catch {
        setStatus(ghStatus, 'error', 'Copy failed. Please copy manually.');
      }
    }

    searchBtn.addEventListener('click', searchExtensions);
    extQuery.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchExtensions(); });
    ghBtn.addEventListener('click', generateMirrorLink);
    ghUrl.addEventListener('keypress', (e) => { if (e.key === 'Enter') generateMirrorLink(); });
    ghCopyBtn.addEventListener('click', copyMirrorLink);

    renderHotExtensions();
  </script>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return htmlResponse(HTML_PAGE);
    }

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'download-hub-worker' });
    }

    if (url.pathname === '/api/extensions/search') {
      return handleSearch(request, ctx);
    }

    if (url.pathname.startsWith('/api/extensions/')) {
      return handleExtensionRoutes(request, ctx);
    }

    if (url.pathname.startsWith('/api/github/resolve')) {
      return handleGitHubResolve(request);
    }

    if (isGitHubReleasePath(url.pathname)) {
      return proxyBinaryRequest(request, ctx, {
        upstreamUrl: GITHUB_URL + url.pathname,
        cacheTtl: DOWNLOAD_CACHE_TTL,
        source: 'github'
      });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }
};

async function handleSearch(request, ctx) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return jsonResponse({ error: 'Missing query parameter: q' }, 400);
  }

  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return withCacheHeader(cached, 'HIT');
  }

  const upstreamUrl = new URL(OPEN_VSX_API + '/-/search');
  upstreamUrl.searchParams.set('query', q);
  upstreamUrl.searchParams.set('size', '12');

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    headers: { 'User-Agent': 'download-hub-worker' }
  });

  if (!upstreamRes.ok) {
    return jsonResponse({ error: 'Open VSX search failed' }, 502);
  }

  const payload = await upstreamRes.json();
  const results = Array.isArray(payload.extensions) ? payload.extensions.map(mapExtensionSearchResult) : [];
  const response = jsonResponse({ query: q, results }, 200, {
    'Cache-Control': `public, max-age=${SEARCH_CACHE_TTL}`,
    'X-Worker-Cache': 'MISS'
  });

  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

async function handleExtensionRoutes(request, ctx) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/extensions/:namespace/:name or /api/extensions/:namespace/:name/:version/download
  if (parts.length < 4) {
    return jsonResponse({ error: 'Invalid extension route' }, 400);
  }

  const namespace = decodeURIComponent(parts[2] || '');
  const name = decodeURIComponent(parts[3] || '');
  if (!namespace || !name) {
    return jsonResponse({ error: 'Missing namespace or name' }, 400);
  }

  if (parts.length === 4) {
    return handleExtensionDetail(request, ctx, namespace, name);
  }

  if (parts.length === 6 && parts[5] === 'download') {
    const version = decodeURIComponent(parts[4] || '');
    return handleExtensionDownload(request, ctx, namespace, name, version);
  }

  return jsonResponse({ error: 'Unsupported extension route' }, 404);
}

async function handleExtensionDetail(request, ctx, namespace, name) {
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return withCacheHeader(cached, 'HIT');
  }

  const upstreamUrl = `${OPEN_VSX_API}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
  const upstreamRes = await fetch(upstreamUrl, {
    headers: { 'User-Agent': 'download-hub-worker' }
  });

  if (!upstreamRes.ok) {
    return jsonResponse({ error: 'Extension not found in Open VSX' }, upstreamRes.status === 404 ? 404 : 502);
  }

  const payload = await upstreamRes.json();
  const versions = Array.isArray(payload.allVersions)
    ? payload.allVersions.map(v => ({
        version: v.version,
        downloadUrl: buildExtensionDownloadUrl(request, namespace, name, v.version),
        sourceUrl: v.files?.download || null
      }))
    : [];

  const response = jsonResponse({
    namespace,
    name,
    extensionId: `${namespace}.${name}`,
    displayName: payload.displayName || `${namespace}.${name}`,
    description: payload.description || '',
    version: payload.version || null,
    iconUrl: payload.files?.icon || null,
    sourceUrl: payload.repository || payload.homepage || null,
    openvsxUrl: payload.reviewUrl || payload.namespaceUrl || `https://open-vsx.org/extension/${namespace}/${name}`,
    downloadUrl: buildExtensionDownloadUrl(request, namespace, name, payload.version),
    versions
  }, 200, {
    'Cache-Control': `public, max-age=${DETAIL_CACHE_TTL}`,
    'X-Worker-Cache': 'MISS'
  });

  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

async function handleExtensionDownload(request, ctx, namespace, name, version) {
  if (!version) {
    return jsonResponse({ error: 'Missing version' }, 400);
  }

  const upstreamUrl = `${OPEN_VSX_API}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/file/${encodeURIComponent(namespace)}.${encodeURIComponent(name)}-${encodeURIComponent(version)}.vsix`;

  return proxyBinaryRequest(request, ctx, {
    upstreamUrl,
    cacheTtl: DOWNLOAD_CACHE_TTL,
    source: 'openvsx'
  });
}

async function handleGitHubResolve(request) {
  const url = new URL(request.url);
  const input = (url.searchParams.get('url') || '').trim();
  if (!input) {
    return jsonResponse({ error: 'Missing url query parameter' }, 400);
  }

  try {
    const parsed = new URL(input);
    if (parsed.hostname !== 'github.com' || !isGitHubReleasePath(parsed.pathname)) {
      return jsonResponse({ error: 'Only GitHub release asset URLs are supported' }, 400);
    }

    return jsonResponse({
      originalUrl: input,
      mirrorUrl: url.origin + parsed.pathname
    });
  } catch {
    return jsonResponse({ error: 'Invalid URL' }, 400);
  }
}

async function proxyBinaryRequest(request, ctx, { upstreamUrl, cacheTtl, source }) {
  const allowed = isAllowedUpstream(upstreamUrl);
  if (!allowed) {
    return jsonResponse({ error: 'Upstream is not allowed' }, 400);
  }

  const cache = caches.default;
  const cacheable = request.method === 'GET' && !request.headers.get('Range');
  if (cacheable) {
    const cached = await cache.match(request);
    if (cached) {
      return withSourceAndCacheHeaders(cached, source, 'HIT');
    }
  }

  try {
    const upstreamRes = await fetch(new Request(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request)
    }));

    if (!upstreamRes.ok && upstreamRes.status !== 206 && upstreamRes.status !== 304) {
      return passthroughError(upstreamRes, source);
    }

    const headers = new Headers(upstreamRes.headers);
    applyCors(headers);
    headers.set('X-Proxy-Source', source);
    headers.set('X-Worker-Cache', 'MISS');
    if (upstreamRes.status === 200) {
      headers.set('Cache-Control', `public, max-age=${cacheTtl}`);
    }

    const response = new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers
    });

    if (cacheable && upstreamRes.status === 200) {
      ctx.waitUntil(cache.put(request, response.clone()));
    }

    return response;
  } catch (error) {
    return jsonResponse({ error: error.message || 'Proxy request failed', source }, 500);
  }
}

function mapExtensionSearchResult(item) {
  const namespace = item.namespace || item.namespaceName || item.namespaceId || '';
  const name = item.name || '';
  const version = item.version || item.latestVersion || null;
  return {
    namespace,
    name,
    publisher: item.namespaceDisplayName || namespace,
    displayName: item.displayName || `${namespace}.${name}`,
    description: item.description || '',
    version,
    iconUrl: item.files?.icon || item.iconUrl || null,
    sourceUrl: item.repository || item.homepage || null,
    downloadUrl: version ? `/api/extensions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/download` : null
  };
}

function buildExtensionDownloadUrl(request, namespace, name, version) {
  if (!version) return null;
  const origin = new URL(request.url).origin;
  return `${origin}/api/extensions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/download`;
}

function isAllowedUpstream(input) {
  try {
    const url = new URL(input);
    const allowedHosts = new Set([
      'github.com',
      'open-vsx.org',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com'
    ]);
    return allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function isGitHubReleasePath(pathname) {
  return /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/.+/.test(pathname);
}

function buildUpstreamHeaders(request) {
  const headers = new Headers();
  headers.set('User-Agent', 'download-hub-worker');
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);
  const accept = request.headers.get('Accept');
  if (accept) headers.set('Accept', accept);
  return headers;
}

function passthroughError(upstreamRes, source) {
  const headers = new Headers(upstreamRes.headers);
  applyCors(headers);
  headers.set('X-Proxy-Source', source);
  headers.set('X-Worker-Cache', 'MISS');
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers
  });
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json;charset=UTF-8',
    ...corsHeaders(),
    ...extraHeaders
  });
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range'
  };
}

function applyCors(headers) {
  const cors = corsHeaders();
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
}

function withCacheHeader(response, value) {
  const headers = new Headers(response.headers);
  headers.set('X-Worker-Cache', value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function withSourceAndCacheHeaders(response, source, cacheValue) {
  const headers = new Headers(response.headers);
  headers.set('X-Proxy-Source', source);
  headers.set('X-Worker-Cache', cacheValue);
  applyCors(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
