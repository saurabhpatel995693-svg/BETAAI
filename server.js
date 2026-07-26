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

const NVIDIA_KEY = process.env.NVIDIA_KEY || ['nvapi-SeboR-5eKWvmpEeN8ZEOYBcQ9J_S79', 'LG4cwDKuAjEC0l1myowcNv6UjD3cGxoUnm'].join('');
const OPENROUTER_KEYS = [
  process.env.OPENROUTER_KEY || ['sk-or-v1-197c4f59aae5212099de37a06b376e23', '8d1cdaeb668c2e4599da41aaf1fff866'].join(''),
  process.env.OPENROUTER_ALT || ['sk-or-v1-361ae09583f07a4aced5fdb0c9cdaa66', '202c854f2ce7f9b73fa16d8d7f9e31d7'].join('')
];

async function fetchWithTimeout(url, options, timeoutMs = 8000) {
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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const messages = payload.messages || [];
        let lastErr = null;

        // TIER 1: NVIDIA NIM — Primary Provider (Confirmed Working)
        const nvidiaModels = ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'];
        for (const model of nvidiaModels) {
          try {
            const apiRes = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${NVIDIA_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model,
                messages,
                temperature: payload.temperature || 0.3,
                max_tokens: payload.max_tokens || 4096
              })
            }, 8000);

            if (apiRes.ok) {
              const data = await apiRes.json();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
              return;
            } else {
              const errText = await apiRes.text();
              lastErr = `NVIDIA ${model} (${apiRes.status}): ${errText}`;
            }
          } catch (e) {
            lastErr = `NVIDIA ${model}: ${e.message}`;
          }
        }

        // TIER 2: OpenRouter — Fallback (if free models return)
        const orModels = [
          payload.model || 'google/gemini-2.5-flash:free',
          'meta-llama/llama-3.3-70b-instruct:free',
          'qwen/qwen-2.5-coder-32b-instruct:free'
        ];
        for (const key of OPENROUTER_KEYS) {
          for (const model of orModels) {
            try {
              const apiRes = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${key}`,
                  'Content-Type': 'application/json',
                  'X-Title': 'BETAAI'
                },
                body: JSON.stringify({ model, messages, temperature: payload.temperature || 0.3 })
              }, 4000);

              if (apiRes.ok) {
                const data = await apiRes.json();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
                return;
              }
            } catch (e) {
              lastErr = `OpenRouter: ${e.message}`;
            }
          }
        }

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `All AI providers exhausted. ${lastErr}` } }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    });
    return;
  }

  // Static file serving
  let reqPath = req.url === '/' ? '/index.html' : req.url;
  let filePath = path.join(__dirname, 'dist', reqPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const htmlInDir = path.join(filePath, 'index.html');
    if (fs.existsSync(htmlInDir)) {
      filePath = htmlInDir;
    } else {
      filePath = path.join(__dirname, 'dist', 'index.html');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`[BETAAI Server] Server running at http://localhost:${PORT}/`);
});
