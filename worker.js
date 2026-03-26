/**
 * Cloudflare Worker: VSCode Extensions + GitHub Release Mirror
 *
 * Product goals:
 * - A real front-end landing experience instead of a bare utility page
 * - GitHub release acceleration with cache and resumable download support
 * - VS Code extension search, detail, and VSIX download via Open VSX
 * - A single deployable Worker file for simple Cloudflare deployment
 */

const GITHUB_URL = 'https://github.com';
const OPEN_VSX_API = 'https://open-vsx.org/api';
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return htmlResponse(renderHomePage(url.origin));
    }

    if (url.pathname === '/extensions' || url.pathname === '/extensions/') {
      return htmlResponse(renderExtensionsPage(url.origin));
    }

    const extensionPageMatch = url.pathname.match(/^\/extensions\/([^/]+)\/([^/]+)$/);
    if (extensionPageMatch) {
      const namespace = decodeURIComponent(extensionPageMatch[1]);
      const name = decodeURIComponent(extensionPageMatch[2]);
      return htmlResponse(renderExtensionDetailPage(url.origin, namespace, name));
    }

    if (url.pathname === '/github' || url.pathname === '/github/') {
      return htmlResponse(renderGitHubPage(url.origin));
    }

    if (url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'vscode-gh-mirror' });
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

    return htmlResponse(renderNotFoundPage(url.origin), 404);
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
  upstreamUrl.searchParams.set('size', '18');

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    headers: { 'User-Agent': 'vscode-gh-mirror-worker' }
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
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
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
    headers: { 'User-Agent': 'vscode-gh-mirror-worker' }
  });

  if (!upstreamRes.ok) {
    return jsonResponse({ error: 'Extension not found in Open VSX' }, upstreamRes.status === 404 ? 404 : 502);
  }

  const payload = await upstreamRes.json();
  const versions = payload.allVersions && typeof payload.allVersions === 'object'
    ? Object.entries(payload.allVersions)
        .filter(([version]) => version !== 'latest')
        .map(([version, sourceUrl]) => ({
          version,
          downloadUrl: buildExtensionDownloadUrl(request, namespace, name, version),
          sourceUrl: sourceUrl || null
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
    versions,
    stats: {
      averageRating: payload.averageRating || null,
      reviewCount: payload.reviewCount || null,
      downloadCount: payload.downloadCount || null,
      timestamp: payload.timestamp || null
    }
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
      mirrorUrl: url.origin + parsed.pathname,
      path: parsed.pathname
    });
  } catch {
    return jsonResponse({ error: 'Invalid URL' }, 400);
  }
}

async function proxyBinaryRequest(request, ctx, { upstreamUrl, cacheTtl, source }) {
  if (!isAllowedUpstream(upstreamUrl)) {
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
    downloadCount: item.downloadCount || 0,
    averageRating: item.averageRating || null,
    reviewCount: item.reviewCount || 0,
    timestamp: item.timestamp || null,
    iconUrl: item.files?.icon || item.iconUrl || null,
    sourceUrl: item.repository || item.homepage || null,
    detailPage: `/extensions/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
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
    return new Set([
      'github.com',
      'open-vsx.org',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com'
    ]).has(url.hostname);
  } catch {
    return false;
  }
}

function isGitHubReleasePath(pathname) {
  return /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/.+/.test(pathname);
}

function buildUpstreamHeaders(request) {
  const headers = new Headers();
  headers.set('User-Agent', 'vscode-gh-mirror-worker');
  const range = request.headers.get('Range');
  const accept = request.headers.get('Accept');
  if (range) headers.set('Range', range);
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range'
  };
}

function applyCors(headers) {
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      ...corsHeaders()
    }
  });
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

function renderHomePage(origin) {
  return baseHtml({
    title: 'VSCode 插件 + GitHub 加速站',
    active: 'home',
    body: `
      <section class="hero hero-home">
        <div class="hero-copy">
          <span class="badge">Cloudflare Worker</span>
          <h1>插件下载 + GitHub 加速，放到一个站里</h1>
          <p>搜索 VSCode 插件、查看版本、下载 VSIX；同时把 GitHub Release 链接转换成你自己的镜像下载地址。现在是一个能直接上手用的前端版本，不只是接口页。</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="/extensions">搜索插件</a>
            <a class="btn btn-secondary" href="/github">GitHub 加速</a>
          </div>
        </div>
        <div class="hero-side card glass">
          <div class="mini-block">
            <div class="mini-title">快速入口</div>
            <a class="quick-link" href="/extensions">/extensions</a>
            <a class="quick-link" href="/github">/github</a>
            <a class="quick-link" href="/health">/health</a>
          </div>
        </div>
      </section>

      <section class="feature-grid">
        <article class="card glass feature-card">
          <h3>VSCode 插件搜索</h3>
          <p>接 Open VSX 搜索接口，支持关键字搜索、热门插件、详情查看和版本下载。</p>
          <a class="text-link" href="/extensions">去插件页 →</a>
        </article>
        <article class="card glass feature-card">
          <h3>GitHub Release 加速</h3>
          <p>把标准 release 附件链接转换成你的 Worker 链接，支持边缘缓存和断点续传。</p>
          <a class="text-link" href="/github">去加速页 →</a>
        </article>
        <article class="card glass feature-card">
          <h3>统一下载代理层</h3>
          <p>GitHub 和 VSIX 下载共用一套代理逻辑，限制白名单源站，避免做成任意开放代理。</p>
          <a class="text-link" href="${origin}/health">看健康状态 →</a>
        </article>
      </section>

      <section class="card glass section-block">
        <div class="section-head">
          <h2>热门插件</h2>
          <a class="text-link" href="/extensions">查看更多 →</a>
        </div>
        <div class="hot-grid">
          ${HOT_EXTENSIONS.map(id => `<a class="hot-chip" href="/extensions?q=${encodeURIComponent(id)}">${escapeHtml(id)}</a>`).join('')}
        </div>
      </section>
    `,
    scripts: ''
  });
}

function renderExtensionsPage(origin) {
  return baseHtml({
    title: '插件搜索',
    active: 'extensions',
    body: `
      <section class="page-head">
        <div>
          <span class="badge">Open VSX</span>
          <h1>搜索 VSCode 插件</h1>
          <p>支持按关键字或扩展 ID 搜索，结果里直接点详情或下载最新 VSIX。</p>
        </div>
      </section>

      <section class="card glass section-block">
        <div class="search-bar-row">
          <input id="ext-search-input" class="search-input" placeholder="例如：python / prettier / ms-python.python" />
          <select id="ext-sort-select" class="toolbar-input compact-select">
            <option value="downloads">按下载量</option>
            <option value="name">按名称</option>
            <option value="updated">按更新时间</option>
          </select>
          <button id="ext-search-btn" class="btn btn-primary">搜索</button>
        </div>
        <div class="hot-grid compact" id="ext-hot-list">
          ${HOT_EXTENSIONS.map(id => `<button class="hot-chip hot-button" data-query="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join('')}
        </div>
        <div id="ext-search-status" class="status-box hidden"></div>
      </section>

      <section class="results-layout">
        <div class="results-main">
          <div id="ext-search-results" class="results-list"></div>
        </div>
        <aside class="results-side">
          <div class="card glass side-panel">
            <h3>使用提示</h3>
            <ul>
              <li>可以直接搜扩展 ID，例如 <code>ms-python.python</code></li>
              <li>点击“查看详情”会进入详情页</li>
              <li>点击“下载最新 VSIX”会走本站代理</li>
            </ul>
          </div>
        </aside>
      </section>
    `,
    scripts: `
      <script>
        const input = document.getElementById('ext-search-input');
        const sortSelect = document.getElementById('ext-sort-select');
        const btn = document.getElementById('ext-search-btn');
        const results = document.getElementById('ext-search-results');
        const statusBox = document.getElementById('ext-search-status');
        const hotButtons = Array.from(document.querySelectorAll('.hot-button'));

        function setStatus(message, type = 'info') {
          statusBox.className = 'status-box ' + type;
          statusBox.textContent = message;
        }

        function clearStatus() {
          statusBox.className = 'status-box hidden';
          statusBox.textContent = '';
        }

        function stateFromUrl() {
          const params = new URLSearchParams(window.location.search);
          const q = params.get('q') || '';
          const sort = params.get('sort') || 'downloads';
          if (q) input.value = q;
          sortSelect.value = sort;
          return { q, sort };
        }

        function sortResults(list, sort) {
          const cloned = [...list];
          if (sort === 'name') {
            return cloned.sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));
          }
          if (sort === 'updated') {
            return cloned.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          }
          return cloned.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
        }

        function card(item) {
          const icon = item.iconUrl ? '<img src="' + escapeHtml(item.iconUrl) + '" alt="icon">' : '<div class="icon-fallback">VS</div>';
          const stats = [];
          stats.push('下载量 ' + (item.downloadCount || 0));
          stats.push('评论 ' + (item.reviewCount || 0));
          stats.push('评分 ' + (item.averageRating ?? '暂无'));
          return (
            '<article class="result-card card glass">'
            + '<div class="result-top">'
            + '<div class="result-icon">' + icon + '</div>'
            + '<div class="result-info">'
            + '<h3>' + escapeHtml(item.displayName || (item.namespace + '.' + item.name)) + '</h3>'
            + '<div class="meta-line"><code>' + escapeHtml(item.namespace + '.' + item.name) + '</code><span>v' + escapeHtml(item.version || 'unknown') + '</span>' + (stats.length ? '<span>' + escapeHtml(stats.join(' · ')) + '</span>' : '') + '</div>'
            + '<p>' + escapeHtml(item.description || '暂无简介') + '</p>'
            + '</div></div>'
            + '<div class="result-actions">'
            + '<a class="btn btn-secondary" href="' + item.detailPage + '">查看详情</a>'
            + (item.downloadUrl ? '<a class="btn btn-primary" href="' + item.downloadUrl + '" target="_blank">下载最新 VSIX</a>' : '')
            + '</div>'
            + '</article>'
          );
        }

        async function search(q, pushState = true) {
          if (!q) {
            setStatus('先输入关键字或扩展 ID。', 'error');
            results.innerHTML = '';
            return;
          }
          setStatus('正在搜索插件...', 'info');
          results.innerHTML = '';
          const sort = sortSelect.value || 'downloads';
          if (pushState) {
            const next = new URL(window.location.href);
            next.searchParams.set('q', q);
            next.searchParams.set('sort', sort);
            history.replaceState(null, '', next.toString());
          }
          try {
            const res = await fetch('/api/extensions/search?q=' + encodeURIComponent(q));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '搜索失败');
            if (!data.results || !data.results.length) {
              setStatus('没有找到匹配结果。', 'error');
              return;
            }
            clearStatus();
            const sorted = sortResults(data.results, sort);
            results.innerHTML = sorted.map(card).join('');
          } catch (err) {
            setStatus(err.message || '搜索失败', 'error');
          }
        }

        btn.addEventListener('click', () => search(input.value.trim()));
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') search(input.value.trim()); });
        sortSelect.addEventListener('change', () => {
          if (input.value.trim()) search(input.value.trim());
        });
        hotButtons.forEach(btn => btn.addEventListener('click', () => {
          input.value = btn.dataset.query;
          search(btn.dataset.query);
        }));

        const initialState = stateFromUrl();
        if (initialState.q) search(initialState.q, false);
      </script>
    `
  });
}

function renderExtensionDetailPage(origin, namespace, name) {
  const encodedNs = encodeURIComponent(namespace);
  const encodedName = encodeURIComponent(name);
  return baseHtml({
    title: `${namespace}.${name}`,
    active: 'extensions',
    body: `
      <section class="page-head">
        <div>
          <span class="badge">Extension Detail</span>
          <h1 id="detail-title">${escapeHtml(namespace)}.${escapeHtml(name)}</h1>
          <p id="detail-subtitle">正在加载插件信息...</p>
        </div>
        <div class="page-head-actions">
          <a class="btn btn-secondary" href="/extensions">返回搜索</a>
        </div>
      </section>

      <section class="detail-layout">
        <div class="detail-main">
          <div id="detail-status" class="status-box info">正在拉取详情...</div>
          <article id="detail-summary" class="card glass detail-summary hidden"></article>
          <article class="card glass section-block">
            <div class="section-head stack-mobile">
              <div>
                <h2>版本列表</h2>
                <p class="section-sub">支持直接下载历史版本 VSIX</p>
              </div>
              <div class="section-tools">
                <input id="version-filter-input" class="toolbar-input" placeholder="筛选版本，如 2024 / 1.2" />
                <a id="detail-openvsx-link" class="text-link" href="#" target="_blank" rel="noopener">Open VSX 页面</a>
              </div>
            </div>
            <div id="detail-version-list" class="version-list"></div>
          </article>
        </div>
        <aside class="detail-side">
          <div class="card glass side-panel">
            <h3>接口地址</h3>
            <p><a class="text-link wrap" href="/api/extensions/${encodedNs}/${encodedName}" target="_blank">/api/extensions/${escapeHtml(encodedNs)}/${escapeHtml(encodedName)}</a></p>
          </div>
        </aside>
      </section>
    `,
    scripts: `
      <script>
        const detailStatus = document.getElementById('detail-status');
        const detailTitle = document.getElementById('detail-title');
        const detailSubtitle = document.getElementById('detail-subtitle');
        const detailSummary = document.getElementById('detail-summary');
        const versionList = document.getElementById('detail-version-list');
        const openvsxLink = document.getElementById('detail-openvsx-link');
        const versionFilterInput = document.getElementById('version-filter-input');
        let allVersions = [];

        function setDetailStatus(message, type = 'info') {
          detailStatus.className = 'status-box ' + type;
          detailStatus.textContent = message;
        }

        function formatStat(label, value) {
          if (value === null || value === undefined || value === '') return '';
          return '<div class="stat-item"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(String(value)) + '</strong></div>';
        }

        function renderVersions(list) {
          if (!list || !list.length) {
            versionList.innerHTML = '<div class="empty-box">没有匹配的版本。</div>';
            return;
          }
          versionList.innerHTML = list.slice(0, 60).map(v =>
            '<div class="version-item">'
            + '<div class="version-meta">'
            + '<strong>' + escapeHtml(v.version) + '</strong>'
            + '<span class="version-sub">历史版本 VSIX 下载</span>'
            + '</div>'
            + '<div class="result-actions">'
            + '<a class="btn btn-primary" href="' + escapeHtml(v.downloadUrl) + '" target="_blank">下载</a>'
            + (v.sourceUrl ? '<a class="btn btn-secondary" href="' + escapeHtml(v.sourceUrl) + '" target="_blank">源地址</a>' : '')
            + '</div></div>'
          ).join('');
        }

        async function loadDetail() {
          try {
            const res = await fetch('/api/extensions/${encodedNs}/${encodedName}');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '详情加载失败');

            detailTitle.textContent = data.displayName || data.extensionId;
            detailSubtitle.textContent = data.extensionId + (data.version ? ' · 最新版本 ' + data.version : '');
            openvsxLink.href = data.openvsxUrl || '#';

            detailSummary.className = 'card glass detail-summary';
            detailSummary.innerHTML = 
              '<div class="detail-hero">'
              + '<div class="detail-icon">' + (data.iconUrl ? '<img src="' + escapeHtml(data.iconUrl) + '" alt="icon">' : '<div class="icon-fallback">VS</div>') + '</div>'
              + '<div class="detail-copy">'
              + '<h2>' + escapeHtml(data.displayName || data.extensionId) + '</h2>'
              + '<div class="meta-line"><code>' + escapeHtml(data.extensionId) + '</code></div>'
              + '<p>' + escapeHtml(data.description || '暂无简介') + '</p>'
              + '<div class="result-actions">'
              + (data.downloadUrl ? '<a class="btn btn-primary" href="' + escapeHtml(data.downloadUrl) + '" target="_blank">下载最新 VSIX</a>' : '')
              + (data.sourceUrl ? '<a class="btn btn-secondary" href="' + escapeHtml(data.sourceUrl) + '" target="_blank">项目主页</a>' : '')
              + '</div>'
              + '</div></div>'
              + '<div class="stats-grid">'
              + formatStat('最新版本', data.version || '未知')
              + formatStat('下载量', (data.stats && data.stats.downloadCount) ?? 0)
              + formatStat('评分', (data.stats && data.stats.averageRating) ?? '暂无')
              + formatStat('评论数', (data.stats && data.stats.reviewCount) ?? 0)
              + '</div>';

            allVersions = Array.isArray(data.versions) ? data.versions : [];
            if (allVersions.length) {
              renderVersions(allVersions);
            } else {
              versionList.innerHTML = '<div class="empty-box">没有拿到版本列表。</div>';
            }

            detailStatus.className = 'status-box hidden';
            detailStatus.textContent = '';
          } catch (err) {
            setDetailStatus(err.message || '详情加载失败', 'error');
          }
        }

        versionFilterInput.addEventListener('input', () => {
          const keyword = versionFilterInput.value.trim().toLowerCase();
          if (!keyword) {
            renderVersions(allVersions);
            return;
          }
          renderVersions(allVersions.filter(v => String(v.version || '').toLowerCase().includes(keyword)));
        });

        loadDetail();
      </script>
    `
  });
}

function renderGitHubPage(origin) {
  return baseHtml({
    title: 'GitHub 加速',
    active: 'github',
    body: `
      <section class="page-head">
        <div>
          <span class="badge">GitHub Release Mirror</span>
          <h1>生成 GitHub 下载加速链接</h1>
          <p>把标准 GitHub release 附件地址贴进来，转换成你这个站自己的镜像下载链接。</p>
        </div>
      </section>

      <section class="card glass section-block">
        <div class="search-bar-row">
          <input id="gh-url-input" class="search-input" placeholder="https://github.com/user/repo/releases/download/v1.0/file.zip" />
          <button id="gh-generate-btn" class="btn btn-primary">生成链接</button>
        </div>
        <div class="os-selector-row">
          <span class="selector-label">快捷选择系统</span>
          <div class="hot-grid compact">
            <button class="hot-chip hot-button gh-os-btn" data-os="windows">Windows</button>
            <button class="hot-chip hot-button gh-os-btn" data-os="macos">macOS</button>
            <button class="hot-chip hot-button gh-os-btn" data-os="linux">Linux</button>
          </div>
        </div>
        <div id="gh-status" class="status-box hidden"></div>
        <div id="gh-os-suggestions" class="results-list"></div>
        <div id="gh-result" class="result-card card glass hidden"></div>
      </section>

      <section class="tips-grid">
        <article class="card glass side-panel">
          <h3>支持</h3>
          <ul>
            <li>标准 GitHub Release 附件地址</li>
            <li>缓存加速</li>
            <li>断点续传</li>
          </ul>
        </article>
        <article class="card glass side-panel">
          <h3>不支持</h3>
          <ul>
            <li>普通 GitHub 页面</li>
            <li>任意外链代理</li>
            <li>仓库源码页直链</li>
          </ul>
        </article>
      </section>
    `,
    scripts: `
      <script>
        const input = document.getElementById('gh-url-input');
        const btn = document.getElementById('gh-generate-btn');
        const statusBox = document.getElementById('gh-status');
        const resultBox = document.getElementById('gh-result');
        const suggestionsBox = document.getElementById('gh-os-suggestions');
        const osButtons = Array.from(document.querySelectorAll('.gh-os-btn'));

        const githubTemplates = {
          windows: [
            { label: 'VS Code Windows User Installer', value: 'https://github.com/microsoft/vscode/releases/download/1.85.0/VSCodeUserSetup-x64-1.85.0.exe' },
            { label: 'VS Code Windows System Installer', value: 'https://github.com/microsoft/vscode/releases/download/1.85.0/VSCodeSetup-x64-1.85.0.exe' }
          ],
          macos: [
            { label: 'VS Code macOS Universal', value: 'https://github.com/microsoft/vscode/releases/download/1.85.0/VSCode-darwin-universal.zip' },
            { label: 'VS Code macOS Apple Silicon', value: 'https://github.com/microsoft/vscode/releases/download/1.85.0/VSCode-darwin-arm64.zip' }
          ],
          linux: [
            { label: 'VS Code Linux deb x64', value: 'https://github.com/microsoft/vscode/releases/download/1.85.0/code_1.85.0-1702462158_amd64.deb' },
            { label: 'VS Code Linux rpm x64', value: 'https://github.com/microsoft/vscode/releases/download/1.85.0/code-1.85.0-1702462296.el7.x86_64.rpm' }
          ]
        };

        function setStatus(message, type = 'info') {
          statusBox.className = 'status-box ' + type;
          statusBox.textContent = message;
        }

        function clearStatus() {
          statusBox.className = 'status-box hidden';
          statusBox.textContent = '';
        }

        function renderOsSuggestions(os) {
          const list = githubTemplates[os] || [];
          if (!list.length) {
            suggestionsBox.innerHTML = '';
            return;
          }
          suggestionsBox.innerHTML = list.map(item =>
            '<article class="result-card card glass">'
            + '<h3>' + escapeHtml(item.label) + '</h3>'
            + '<p class="wrap mono">' + escapeHtml(item.value) + '</p>'
            + '<div class="result-actions">'
            + '<button class="btn btn-secondary gh-fill-btn" data-url="' + escapeHtml(item.value) + '">填入上方</button>'
            + '</div>'
            + '</article>'
          ).join('');
          Array.from(document.querySelectorAll('.gh-fill-btn')).forEach(btn => {
            btn.addEventListener('click', () => {
              input.value = btn.dataset.url;
              generate();
            });
          });
        }

        async function generate() {
          const value = input.value.trim();
          if (!value) {
            setStatus('先输入一个 GitHub release 附件链接。', 'error');
            resultBox.className = 'result-card card glass hidden';
            resultBox.innerHTML = '';
            return;
          }
          setStatus('正在生成镜像链接...', 'info');
          try {
            const res = await fetch('/api/github/resolve?url=' + encodeURIComponent(value));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '生成失败');
            clearStatus();
            resultBox.className = 'result-card card glass';
            resultBox.innerHTML = 
              '<h3>镜像链接</h3>'
              + '<p class="wrap mono">' + escapeHtml(data.mirrorUrl) + '</p>'
              + '<div class="result-actions">'
              + '<a class="btn btn-primary" href="' + escapeHtml(data.mirrorUrl) + '" target="_blank">打开下载</a>'
              + '<button id="copy-gh-btn" class="btn btn-secondary">复制链接</button>'
              + '</div>';
            document.getElementById('copy-gh-btn').addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(data.mirrorUrl);
                setStatus('已复制到剪贴板。', 'success');
              } catch {
                setStatus('复制失败，请手动复制。', 'error');
              }
            });
          } catch (err) {
            setStatus(err.message || '生成失败', 'error');
          }
        }

        btn.addEventListener('click', generate);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') generate(); });
        osButtons.forEach(btn => btn.addEventListener('click', () => renderOsSuggestions(btn.dataset.os)));
      </script>
    `
  });
}

function renderNotFoundPage(origin) {
  return baseHtml({
    title: '页面不存在',
    active: '',
    body: `
      <section class="empty-state card glass">
        <h1>页面不存在</h1>
        <p>你访问的路径没有对应页面。可以从首页重新进入。</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/">回首页</a>
          <a class="btn btn-secondary" href="/extensions">搜插件</a>
        </div>
      </section>
    `,
    scripts: ''
  });
}

function baseHtml({ title, active, body, scripts }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} · VSCode 插件 + GitHub 加速站</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%237c3aed'/%3E%3Cstop offset='100%25' stop-color='%232563eb'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='16' fill='url(%23g)'/%3E%3Cpath d='M18 22l14-10 14 8v24l-14 8-14-10V22z' fill='white' fill-opacity='.18'/%3E%3Cpath d='M22 33l8 8 12-14' fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M46 18h8v8' fill='none' stroke='white' stroke-width='4' stroke-linecap='round'/%3E%3Cpath d='M54 18L42 30' fill='none' stroke='white' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07111f;
      --bg-soft: #0d1a2b;
      --panel: rgba(255,255,255,0.06);
      --panel-2: rgba(255,255,255,0.04);
      --border: rgba(255,255,255,0.12);
      --text: #eef4ff;
      --muted: rgba(238,244,255,0.72);
      --subtle: rgba(238,244,255,0.48);
      --primary: #7c3aed;
      --primary-2: #2563eb;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --shadow: 0 20px 50px rgba(0,0,0,0.35);
      --radius: 22px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
      background:
        radial-gradient(circle at 0% 0%, rgba(37,99,235,0.22), transparent 28%),
        radial-gradient(circle at 100% 0%, rgba(124,58,237,0.24), transparent 30%),
        radial-gradient(circle at 50% 100%, rgba(16,185,129,0.10), transparent 30%),
        linear-gradient(180deg, #07111f 0%, #091827 100%);
      color: var(--text);
      min-height: 100vh;
    }
    a { color: inherit; text-decoration: none; }
    .wrap { word-break: break-all; }
    .mono, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .site-shell {
      width: min(1240px, calc(100vw - 28px));
      margin: 0 auto;
      padding: 24px 0 60px;
    }
    .site-header {
      position: sticky;
      top: 0;
      z-index: 10;
      margin-bottom: 24px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 14px 18px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(7,17,31,0.68);
      box-shadow: var(--shadow);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--primary), var(--primary-2));
      display: grid;
      place-items: center;
      box-shadow: 0 10px 24px rgba(99,102,241,0.28);
      font-size: 16px;
    }
    .brand-sub {
      display: block;
      color: var(--subtle);
      font-size: 12px;
      font-weight: 600;
      margin-top: 3px;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .nav-link {
      padding: 10px 14px;
      border-radius: 999px;
      color: var(--muted);
      font-size: 14px;
      border: 1px solid transparent;
    }
    .nav-link.active {
      color: var(--text);
      background: rgba(255,255,255,0.07);
      border-color: rgba(255,255,255,0.09);
    }
    .badge {
      display: inline-flex;
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      color: #ddd6fe;
      border: 1px solid rgba(196,181,253,0.24);
      background: rgba(124,58,237,0.14);
    }
    .hero, .page-head, .detail-layout, .results-layout, .feature-grid, .tips-grid {
      display: grid;
      gap: 18px;
    }
    .hero-home {
      grid-template-columns: 1.2fr 0.8fr;
      align-items: stretch;
      margin-bottom: 24px;
    }
    .hero-copy {
      padding: 18px 0;
    }
    .hero-copy h1, .page-head h1, .empty-state h1 {
      margin: 12px 0 0;
      font-size: clamp(32px, 5vw, 54px);
      line-height: 1.05;
      letter-spacing: -0.045em;
    }
    .hero-copy p, .page-head p, .empty-state p {
      margin: 16px 0 0;
      color: var(--muted);
      line-height: 1.75;
      font-size: 16px;
      max-width: 760px;
    }
    .hero-actions, .page-head-actions, .result-actions, .search-bar-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .hero-actions { margin-top: 22px; }
    .card {
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
    }
    .glass {
      background: linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.04));
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }
    .section-block, .side-panel, .empty-state, .detail-summary { padding: 22px; }
    .mini-block { padding: 22px; }
    .mini-title, .section-head h2, .side-panel h3, .result-card h3 { margin: 0 0 12px; }
    .section-sub {
      margin: 0;
      color: var(--subtle);
      font-size: 13px;
    }
    .section-tools {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .toolbar-input {
      min-width: 220px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.18);
      color: var(--text);
      padding: 12px 14px;
      font: inherit;
      outline: none;
    }
    .compact-select {
      flex: 0 0 180px;
    }
    .quick-link {
      display: block;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255,255,255,0.05);
      margin-top: 10px;
      color: #ddd6fe;
      font-family: ui-monospace, monospace;
    }
    .feature-grid {
      grid-template-columns: repeat(3, 1fr);
      margin-bottom: 24px;
    }
    .stack-mobile {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .feature-card { padding: 22px; }
    .feature-card h3 { margin: 0 0 10px; }
    .feature-card p, .side-panel li, .side-panel p { color: var(--muted); line-height: 1.7; }
    .text-link { color: #c4b5fd; font-weight: 700; }
    .hot-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .hot-grid.compact { margin-top: 16px; }
    .hot-chip {
      padding: 12px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--text);
      font-size: 14px;
    }
    .hot-button { cursor: pointer; }
    .page-head { margin-bottom: 18px; }
    .os-selector-row {
      margin-top: 18px;
    }
    .selector-label {
      display: inline-block;
      margin-bottom: 10px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 700;
    }
    .search-input, input {
      flex: 1;
      min-width: 240px;
      width: 100%;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.22);
      color: var(--text);
      padding: 15px 16px;
      font: inherit;
      outline: none;
    }
    .search-input:focus, input:focus {
      border-color: rgba(99,102,241,0.8);
      box-shadow: 0 0 0 4px rgba(99,102,241,0.16);
    }
    .btn {
      border: 0;
      border-radius: 16px;
      padding: 14px 18px;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      transition: .18s ease;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn-primary {
      color: white;
      background: linear-gradient(135deg, var(--primary), var(--primary-2));
      box-shadow: 0 10px 24px rgba(99,102,241,0.24);
    }
    .btn-secondary {
      color: var(--text);
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .status-box {
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 16px;
      line-height: 1.6;
      font-size: 14px;
    }
    .status-box.hidden { display: none; }
    .status-box.info { background: rgba(59,130,246,0.14); border: 1px solid rgba(59,130,246,0.28); color: #bfdbfe; }
    .status-box.success { background: rgba(16,185,129,0.14); border: 1px solid rgba(16,185,129,0.28); color: #bbf7d0; }
    .status-box.error { background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.28); color: #fecaca; }
    .results-layout, .detail-layout {
      grid-template-columns: 1.2fr 0.8fr;
      align-items: start;
    }
    .results-list, .version-list { display: grid; gap: 14px; }
    .result-card { padding: 18px; }
    .result-top, .detail-hero {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .result-icon, .detail-icon {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      overflow: hidden;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.08);
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .result-icon img, .detail-icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .icon-fallback {
      font-weight: 800;
      color: #ddd6fe;
    }
    .result-info h3, .detail-copy h2 { margin: 0; }
    .meta-line {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      color: var(--subtle);
      margin-top: 8px;
      font-size: 13px;
    }
    .result-info p, .detail-copy p { color: var(--muted); line-height: 1.75; }
    .result-actions { margin-top: 14px; }
    .side-panel ul { padding-left: 18px; margin: 0; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 18px;
    }
    .stat-item {
      padding: 14px;
      border-radius: 16px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .stat-item span { display: block; color: var(--subtle); font-size: 12px; margin-bottom: 6px; }
    .version-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .version-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .version-sub {
      color: var(--subtle);
      font-size: 13px;
    }
    .tips-grid { grid-template-columns: repeat(2, 1fr); }
    .empty-box {
      padding: 18px;
      border-radius: 16px;
      background: rgba(255,255,255,0.04);
      color: var(--muted);
      border: 1px dashed rgba(255,255,255,0.14);
    }
    .site-footer {
      margin-top: 34px;
      text-align: center;
      color: var(--subtle);
      font-size: 13px;
    }
    @media (max-width: 980px) {
      .hero-home, .feature-grid, .results-layout, .detail-layout, .tips-grid, .stats-grid {
        grid-template-columns: 1fr;
      }
      .nav { flex-direction: column; align-items: flex-start; }
    }
    @media (max-width: 640px) {
      .site-shell { width: min(100vw - 18px, 100%); }
      .hero-copy h1, .page-head h1, .empty-state h1 { font-size: 34px; }
      .section-block, .side-panel, .empty-state, .detail-summary, .mini-block, .result-card { padding: 18px; }
      .version-item { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="site-shell">
    <header class="site-header">
      <nav class="nav">
        <a class="brand" href="/">
          <span class="brand-mark">⚡</span>
          <span>
            VSCode + GitHub Mirror
            <span class="brand-sub">插件下载站 + Release 加速</span>
          </span>
        </a>
        <div class="nav-links">
          <a class="nav-link ${active === 'home' ? 'active' : ''}" href="/">首页</a>
          <a class="nav-link ${active === 'extensions' ? 'active' : ''}" href="/extensions">插件</a>
          <a class="nav-link ${active === 'github' ? 'active' : ''}" href="/github">GitHub 加速</a>
        </div>
      </nav>
    </header>
    <main>${body}</main>
    <footer class="site-footer">
      当前版本是前后端打通的一体化 Worker 页面版。后续还可以继续拆组件、补分类页和管理功能。
    </footer>
  </div>
  <script>
    function escapeHtml(str = '') {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  </script>
  ${scripts || ''}
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
