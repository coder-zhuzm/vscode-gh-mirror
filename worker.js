/**
 * CLOUDFLARE WORKER: GITHUB MIRROR
 * 
 * Features:
 * 1. Edge Caching (Fast downloads for popular files)
 * 2. Streaming (Low memory usage)
 * 3. Range Requests (Supports Resume/Download Managers)
 * 4. Modern Premium UI
 */

const GITHUB_URL = 'https://github.com';
const CACHE_TTL = 31536000; // 1 Year Cache (since release files don't change)

const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Mirror - High Speed Downloads</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        :root {
            --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --accent-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            --success-gradient: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            --bg-dark: #0a0a0f;
            --bg-card: rgba(255, 255, 255, 0.03);
            --bg-card-hover: rgba(255, 255, 255, 0.06);
            --glass-bg: rgba(255, 255, 255, 0.05);
            --glass-border: rgba(255, 255, 255, 0.1);
            --text-primary: #ffffff;
            --text-secondary: rgba(255, 255, 255, 0.6);
            --text-muted: rgba(255, 255, 255, 0.4);
            --purple-glow: rgba(102, 126, 234, 0.4);
            --pink-glow: rgba(240, 147, 251, 0.3);
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-dark);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
            overflow-x: hidden;
        }

        /* Animated Background */
        .bg-gradient {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: 
                radial-gradient(ellipse 80% 50% at 50% -20%, rgba(102, 126, 234, 0.3), transparent),
                radial-gradient(ellipse 60% 40% at 100% 50%, rgba(240, 147, 251, 0.15), transparent),
                radial-gradient(ellipse 60% 40% at 0% 50%, rgba(102, 126, 234, 0.15), transparent);
            pointer-events: none;
            z-index: 0;
        }

        .floating-orbs {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
            pointer-events: none;
            z-index: 0;
        }

        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(80px);
            animation: float 20s infinite ease-in-out;
        }

        .orb-1 {
            width: 600px;
            height: 600px;
            background: rgba(102, 126, 234, 0.15);
            top: -200px;
            left: -100px;
            animation-delay: 0s;
        }

        .orb-2 {
            width: 500px;
            height: 500px;
            background: rgba(240, 147, 251, 0.12);
            bottom: -150px;
            right: -100px;
            animation-delay: -5s;
        }

        .orb-3 {
            width: 400px;
            height: 400px;
            background: rgba(56, 239, 125, 0.08);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation-delay: -10s;
        }

        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(30px, -30px) scale(1.05); }
            50% { transform: translate(-20px, 20px) scale(0.95); }
            75% { transform: translate(20px, 30px) scale(1.02); }
        }

        /* Main Container */
        .main-container {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 640px;
        }

        /* Logo & Header */
        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .logo-container {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-bottom: 20px;
        }

        .logo-icon {
            width: 56px;
            height: 56px;
            background: var(--primary-gradient);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 32px var(--purple-glow);
            position: relative;
            overflow: hidden;
        }

        .logo-icon::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%);
        }

        .logo-icon svg {
            width: 32px;
            height: 32px;
            fill: white;
            position: relative;
            z-index: 1;
        }

        .logo-text {
            font-size: 32px;
            font-weight: 800;
            background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            letter-spacing: -0.5px;
        }

        .tagline {
            color: var(--text-secondary);
            font-size: 16px;
            font-weight: 500;
            max-width: 400px;
            margin: 0 auto;
            line-height: 1.6;
        }

        /* Glass Card */
        .glass-card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 
                0 4px 24px rgba(0, 0, 0, 0.2),
                inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        /* Input Group */
        .input-group {
            margin-bottom: 24px;
        }

        .input-label {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 600;
        }

        .input-label svg {
            width: 18px;
            height: 18px;
            opacity: 0.7;
        }

        .input-wrapper {
            position: relative;
        }

        .url-input {
            width: 100%;
            padding: 18px 20px;
            padding-left: 52px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            color: var(--text-primary);
            font-size: 15px;
            font-family: inherit;
            transition: all 0.3s ease;
            outline: none;
        }

        .url-input::placeholder {
            color: var(--text-muted);
        }

        .url-input:focus {
            border-color: rgba(102, 126, 234, 0.5);
            box-shadow: 
                0 0 0 4px rgba(102, 126, 234, 0.1),
                0 4px 20px rgba(102, 126, 234, 0.15);
        }

        .input-icon {
            position: absolute;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            width: 20px;
            height: 20px;
            color: var(--text-muted);
            pointer-events: none;
        }

        /* Primary Button */
        .btn-primary {
            width: 100%;
            padding: 18px 32px;
            background: var(--primary-gradient);
            border: none;
            border-radius: 14px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px var(--purple-glow);
        }

        .btn-primary::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%);
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 32px var(--purple-glow);
        }

        .btn-primary:hover::before {
            opacity: 1;
        }

        .btn-primary:active {
            transform: translateY(0);
        }

        .btn-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            position: relative;
            z-index: 1;
        }

        .btn-content svg {
            width: 20px;
            height: 20px;
        }

        /* Result Section */
        .result-section {
            margin-top: 32px;
            display: none;
            animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .result-section.active {
            display: block;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .result-label {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            color: #38ef7d;
            font-size: 14px;
            font-weight: 600;
        }

        .result-label svg {
            width: 18px;
            height: 18px;
        }

        .result-box {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(56, 239, 125, 0.2);
            border-radius: 14px;
            padding: 6px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .result-link {
            flex: 1;
            padding: 12px 16px;
            color: #38ef7d;
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 13px;
            text-decoration: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: color 0.2s ease;
        }

        .result-link:hover {
            color: #5cff94;
        }

        .btn-copy {
            padding: 12px 20px;
            background: rgba(56, 239, 125, 0.15);
            border: 1px solid rgba(56, 239, 125, 0.3);
            border-radius: 10px;
            color: #38ef7d;
            font-size: 14px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
            white-space: nowrap;
        }

        .btn-copy svg {
            width: 16px;
            height: 16px;
        }

        .btn-copy:hover {
            background: rgba(56, 239, 125, 0.25);
        }

        .btn-copy.copied {
            background: var(--success-gradient);
            border-color: transparent;
            color: white;
        }

        /* Features Grid */
        .features {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-top: 40px;
        }

        .feature-card {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            transition: all 0.3s ease;
        }

        .feature-card:hover {
            background: var(--bg-card-hover);
            transform: translateY(-4px);
            border-color: rgba(102, 126, 234, 0.3);
        }

        .feature-icon {
            width: 44px;
            height: 44px;
            margin: 0 auto 12px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(240, 147, 251, 0.2) 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .feature-icon svg {
            width: 22px;
            height: 22px;
            color: #a78bfa;
        }

        .feature-title {
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .feature-desc {
            color: var(--text-muted);
            font-size: 11px;
            line-height: 1.4;
        }

        /* Footer */
        .footer {
            margin-top: 40px;
            text-align: center;
            color: var(--text-muted);
            font-size: 13px;
        }

        .footer a {
            color: var(--text-secondary);
            text-decoration: none;
            transition: color 0.2s ease;
        }

        .footer a:hover {
            color: var(--text-primary);
        }

        /* Responsive */
        @media (max-width: 600px) {
            .glass-card {
                padding: 28px 20px;
            }

            .logo-text {
                font-size: 26px;
            }

            .features {
                grid-template-columns: 1fr;
            }

            .feature-card {
                display: flex;
                align-items: center;
                gap: 16px;
                text-align: left;
                padding: 16px;
            }

            .feature-icon {
                margin: 0;
                flex-shrink: 0;
            }

            .feature-content {
                flex: 1;
            }
        }

        /* Toast Notification */
        .toast {
            position: fixed;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--success-gradient);
            color: white;
            padding: 16px 28px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 8px 32px rgba(17, 153, 142, 0.4);
            display: flex;
            align-items: center;
            gap: 10px;
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 1000;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        .toast svg {
            width: 20px;
            height: 20px;
        }

        /* Shimmer effect on button */
        .btn-primary .shimmer {
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(
                90deg,
                transparent,
                rgba(255, 255, 255, 0.15),
                transparent
            );
            transition: left 0.5s ease;
        }

        .btn-primary:hover .shimmer {
            left: 100%;
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
            20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
    </style>
</head>
<body>
    <div class="bg-gradient"></div>
    <div class="floating-orbs">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
    </div>

    <div class="main-container">
        <header class="header">
            <div class="logo-container">
                <div class="logo-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                </div>
                <span class="logo-text">GitHub Mirror</span>
            </div>
            <p class="tagline">Transform GitHub release URLs into blazing-fast, globally cached download links</p>
        </header>

        <div class="glass-card">
            <div class="input-group">
                <label class="input-label">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                    </svg>
                    GitHub Release URL
                </label>
                <div class="input-wrapper">
                    <svg class="input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                    </svg>
                    <input 
                        type="text" 
                        class="url-input" 
                        id="urlInput"
                        placeholder="https://github.com/user/repo/releases/download/v1.0/file.zip"
                        autocomplete="off"
                        spellcheck="false"
                    >
                </div>
            </div>

            <button class="btn-primary" id="generateBtn" onclick="generateMirrorLink()">
                <span class="shimmer"></span>
                <span class="btn-content">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                    Generate Mirror Link
                </span>
            </button>

            <div class="result-section" id="resultSection">
                <div class="result-label">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Your High-Speed Mirror Link
                </div>
                <div class="result-box">
                    <a href="#" class="result-link" id="mirrorLink" target="_blank"></a>
                    <button class="btn-copy" id="copyBtn" onclick="copyToClipboard()">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" id="copyIcon">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                        <span id="copyText">Copy</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="features">
            <div class="feature-card">
                <div class="feature-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                </div>
                <div class="feature-content">
                    <div class="feature-title">Edge Cached</div>
                    <div class="feature-desc">Global CDN caching for maximum speed</div>
                </div>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                </div>
                <div class="feature-content">
                    <div class="feature-title">Resumable</div>
                    <div class="feature-desc">Supports download managers</div>
                </div>
            </div>
            <div class="feature-card">
                <div class="feature-icon">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                </div>
                <div class="feature-content">
                    <div class="feature-title">Reliable</div>
                    <div class="feature-desc">Powered by Cloudflare Workers</div>
                </div>
            </div>
        </div>

        <footer class="footer">
            <p>Made by <a href="https://github.com/creasydude" target="_blank">@creasydude</a> • Powered by <a href="https://workers.cloudflare.com" target="_blank">Cloudflare Workers</a></p>
        </footer>
    </div>

    <div class="toast" id="toast">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <span>Link copied to clipboard!</span>
    </div>

    <script>
        const urlInput = document.getElementById('urlInput');
        const resultSection = document.getElementById('resultSection');
        const mirrorLink = document.getElementById('mirrorLink');
        const copyBtn = document.getElementById('copyBtn');
        const copyText = document.getElementById('copyText');
        const copyIcon = document.getElementById('copyIcon');
        const toast = document.getElementById('toast');

        // Enter key support
        urlInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                generateMirrorLink();
            }
        });

        function generateMirrorLink() {
            const input = urlInput.value.trim();
            
            if (!input) {
                shakeInput();
                return;
            }

            try {
                const urlObj = new URL(input);
                
                if (!urlObj.hostname.includes('github.com')) {
                    showError('Please enter a valid GitHub URL');
                    return;
                }

                const workerHost = window.location.host;
                const newUrl = input.replace(urlObj.hostname, workerHost);

                mirrorLink.href = newUrl;
                mirrorLink.textContent = newUrl;
                
                resultSection.classList.remove('active');
                void resultSection.offsetWidth; // Trigger reflow
                resultSection.classList.add('active');
                
                // Reset copy button
                resetCopyButton();
                
            } catch (e) {
                showError('Invalid URL format');
            }
        }

        function copyToClipboard() {
            const link = mirrorLink.textContent;
            
            navigator.clipboard.writeText(link).then(function() {
                copyBtn.classList.add('copied');
                copyText.textContent = 'Copied!';
                copyIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
                
                showToast();
                
                setTimeout(resetCopyButton, 2500);
            }).catch(function(err) {
                console.error('Failed to copy:', err);
                showError('Failed to copy to clipboard');
            });
        }

        function resetCopyButton() {
            copyBtn.classList.remove('copied');
            copyText.textContent = 'Copy';
            copyIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>';
        }

        function shakeInput() {
            urlInput.style.animation = 'none';
            urlInput.offsetHeight; // Trigger reflow
            urlInput.style.animation = 'shake 0.5s ease';
            urlInput.style.borderColor = 'rgba(245, 87, 108, 0.5)';
            setTimeout(function() {
                urlInput.style.borderColor = '';
            }, 1500);
        }

        function showError(message) {
            const originalPlaceholder = urlInput.placeholder;
            urlInput.value = '';
            urlInput.placeholder = message;
            urlInput.style.borderColor = 'rgba(245, 87, 108, 0.5)';
            
            setTimeout(function() {
                urlInput.placeholder = originalPlaceholder;
                urlInput.style.borderColor = '';
            }, 2500);
        }

        function showToast() {
            toast.classList.add('show');
            setTimeout(function() {
                toast.classList.remove('show');
            }, 2500);
        }
    </script>
</body>
</html>
`;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // 1. SERVE UI
        if (url.pathname === '/' || url.pathname === '') {
            return new Response(HTML_PAGE, {
                headers: { 'Content-Type': 'text/html;charset=UTF-8' }
            });
        }

        // 2. CHECK CACHE (Speed Boost)
        const cache = caches.default;
        let response = await cache.match(request);

        if (response) {
            // HIT: Return cached file
            let newHeaders = new Headers(response.headers);
            newHeaders.set('X-Worker-Cache', 'HIT'); 
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });
        }

        // 3. FETCH FROM ORIGIN (GitHub)
        const ghUrl = new URL(GITHUB_URL + url.pathname);
        
        try {
            const upstreamReq = new Request(ghUrl, {
                method: request.method,
                headers: {
                    'User-Agent': 'Cloudflare-Worker-Mirror',
                    'Range': request.headers.get('Range') || '' // Support Resume
                }
            });

            const upstreamRes = await fetch(upstreamReq);

            // If upstream failed or partial content (206), pass through without caching logic
            if (!upstreamRes.ok && upstreamRes.status !== 304) {
                return upstreamRes;
            }

            // 4. PREPARE RESPONSE
            let resHeaders = new Headers(upstreamRes.headers);
            resHeaders.set('Access-Control-Allow-Origin', '*'); // Allow downloads from anywhere
            resHeaders.set('X-Worker-Cache', 'MISS');

            // Force browser and Cloudflare to cache this for a long time
            if (upstreamRes.status === 200) {
                resHeaders.set('Cache-Control', 'public, max-age=' + CACHE_TTL);
            }

            response = new Response(upstreamRes.body, {
                status: upstreamRes.status,
                statusText: upstreamRes.statusText,
                headers: resHeaders
            });

            // 5. SAVE TO CACHE (if full file)
            if (upstreamRes.status === 200) {
                ctx.waitUntil(cache.put(request, response.clone()));
            }

            return response;

        } catch (e) {
            return new Response("Error: " + e.message, { status: 500 });
        }
    }
};
