import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 4321;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const PROVIDERS = [
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: process.env.OPENROUTER_KEY || process.env.GEMINI_KEY || '',
    models: ['google/gemini-2.5-flash:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen-2.5-coder-32b-instruct:free', 'deepseek/deepseek-r1:free'],
    timeout: 4000,
    extraHeaders: { 'X-Title': 'BETAAI' }
  },
  {
    name: 'nvidia',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    key: process.env.NVIDIA_KEY || '',
    models: ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'],
    timeout: 4000
  },
  {
    name: 'coding',
    url: process.env.CODING_API_URL || 'https://api.siliconflow.cn/v1/chat/completions',
    key: process.env.CODING_API_KEY || '',
    models: ['Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    timeout: 5000
  }
];

async function fetchWithTimeout(url, options, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function tryProvider(provider, model, body, wantsStream) {
  if (!provider.key) throw new Error(`${provider.name}: no API key`);
  const headers = { 'Authorization': `Bearer ${provider.key}`, 'Content-Type': 'application/json', ...(provider.extraHeaders || {}) };
  const reqBody = { ...body, model };
  if (wantsStream) reqBody.stream = true;
  const apiRes = await fetchWithTimeout(provider.url, { method: 'POST', headers, body: JSON.stringify(reqBody) }, provider.timeout);
  if (!apiRes.ok) {
    const errText = await apiRes.text().catch(() => '');
    throw new Error(`${provider.name}/${model} ${apiRes.status}: ${errText.substring(0, 150)}`);
  }
  return apiRes;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body || '{}'); } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }));
        return;
      }

      try {
        const messages = payload.messages || [];
        const rawModel = payload.model || '';
        const wantsStream = payload.stream === true;
        let lastErr = null;

        const authHeader = req.headers['authorization'] || '';
        const clientKey = authHeader.replace(/^Bearer\s+/i, '').trim() || payload.key;
        const cleanModel = rawModel.replace(/^(search|coding|nvidia|openrouter)\//i, '').trim();

        const activeProviders = PROVIDERS.map(p => {
          let keyToUse = p.key;
          if (p.name === 'openrouter' && clientKey && clientKey.startsWith('sk-or-v1-')) {
            keyToUse = clientKey;
          }
          return { ...p, key: keyToUse };
        }).filter(p => p.key && p.key.trim().length > 0);

        if (activeProviders.length === 0) {
          activeProviders.push({
            name: 'openrouter',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            key: clientKey || process.env.OPENROUTER_KEY || process.env.GEMINI_KEY || '',
            models: ['google/gemini-2.5-flash:free', 'meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-r1:free', 'qwen/qwen-2.5-coder-32b-instruct:free'],
            timeout: 12000,
            extraHeaders: { 'X-Title': 'BETAAI' }
          });
        }

        function mapOpenRouterModel(m) {
          if (!m) return 'google/gemini-2.5-flash:free';
          if (m.includes(':free')) return m;
          const lower = m.toLowerCase();
          if (lower.includes('llama')) return 'meta-llama/llama-3.3-70b-instruct:free';
          if (lower.includes('qwen') || lower.includes('coder')) return 'qwen/qwen-2.5-coder-32b-instruct:free';
          if (lower.includes('deepseek')) return 'deepseek/deepseek-r1:free';
          if (lower.includes('gemini')) return 'google/gemini-2.5-flash:free';
          return 'google/gemini-2.5-flash:free';
        }

        for (const provider of activeProviders) {
          let modelsToTry = [...provider.models];
          if (cleanModel) {
            const normalized = provider.name === 'openrouter' ? mapOpenRouterModel(cleanModel) : cleanModel;
            if (!modelsToTry.includes(normalized)) {
              modelsToTry.unshift(normalized);
            }
          }

          for (const model of modelsToTry) {
            try {
              const body = { messages, temperature: payload.temperature || 0.3, max_tokens: payload.max_tokens || 4096 };
              const apiRes = await tryProvider(provider, model, body, wantsStream);

              if (wantsStream && apiRes.body) {
                res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
                const reader = apiRes.body.getReader();
                try { while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); } } catch (e) {}
                res.end();
                return;
              }

              const data = await apiRes.json();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
              return;
            } catch (e) { lastErr = `${provider.name}/${model}: ${e.message}`; }
          }
        }

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `All providers failed. ${lastErr}` } }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    });
  if (req.url.startsWith('/api/image')) {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const prompt = urlObj.searchParams.get('prompt') || 'Abstract Digital Art';
    const width = urlObj.searchParams.get('width') || '1024';
    const height = urlObj.searchParams.get('height') || '1024';
    const seed = urlObj.searchParams.get('seed') || Math.floor(Math.random() * 1000000);
    const cleanPrompt = encodeURIComponent(prompt);

    const targets = [
      `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`,
      `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux`,
      `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&model=turbo`
    ];

    for (const targetUrl of targets) {
      try {
        const apiRes = await fetchWithTimeout(targetUrl, {}, 12000);
        if (apiRes.ok) {
          const buffer = await apiRes.arrayBuffer();
          res.writeHead(200, { 'Content-Type': apiRes.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
          res.end(Buffer.from(buffer));
          return;
        }
      } catch (e) {}
    }

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Image proxy failed' } }));
    return;
  }

  // Static file serving
  let reqPath = req.url === '/' ? '/index.html' : req.url;
  let filePath = path.join(__dirname, 'dist', reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const htmlInDir = path.join(filePath, 'index.html');
    if (fs.existsSync(htmlInDir)) { filePath = htmlInDir; } else { filePath = path.join(__dirname, 'dist', 'index.html'); }
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'text/plain';
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); }
    else { res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' }); res.end(content, 'utf-8'); }
  });
});

server.listen(PORT, () => { console.log(`[BETAAI] http://localhost:${PORT}/`); });
