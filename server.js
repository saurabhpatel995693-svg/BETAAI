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

const NVIDIA_KEY = process.env.NVIDIA_KEY || '';
const OPENROUTER_KEYS = [
  process.env.OPENROUTER_KEY || '',
  process.env.OPENROUTER_ALT || ''
].filter(Boolean);

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
        const wantsStream = payload.stream === true;
        let lastErr = null;

        // Helper to try a provider and return the response
        async function tryProvider(name, url, apiKey, reqBody, timeoutMs) {
          const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
          if (name === 'openrouter') headers['X-Title'] = 'BETAAI';
          const apiRes = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(reqBody) }, timeoutMs);
          if (apiRes.ok) return apiRes;
          const errText = await apiRes.text().catch(() => '');
          throw new Error(`${name} ${apiRes.status}: ${errText.substring(0, 200)}`);
        }

        // TIER 1: NVIDIA NIM
        if (NVIDIA_KEY) {
          const nvidiaModels = ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'];
          for (const model of nvidiaModels) {
            try {
              const reqBody = { model, messages, temperature: payload.temperature || 0.3, max_tokens: payload.max_tokens || 4096 };
              if (wantsStream) reqBody.stream = true;
              const apiRes = await tryProvider('nvidia', 'https://integrate.api.nvidia.com/v1/chat/completions', NVIDIA_KEY, reqBody, 15000);
              if (wantsStream && apiRes.body) {
                res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
                const reader = apiRes.body.getReader();
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { res.end(); return; }
                  res.write(value);
                }
              }
              const data = await apiRes.json();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
              return;
            } catch (e) {
              lastErr = `NVIDIA ${model}: ${e.message}`;
            }
          }
        } else {
          lastErr = 'NVIDIA_KEY not configured.';
        }

        // TIER 2: OpenRouter free models
        if (OPENROUTER_KEYS.length > 0) {
          const orModels = [payload.model || 'google/gemini-2.5-flash:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen-2.5-coder-32b-instruct:free'];
          for (const key of OPENROUTER_KEYS) {
            for (const model of orModels) {
              try {
                const reqBody = { model, messages, temperature: payload.temperature || 0.3, max_tokens: payload.max_tokens || 4096 };
                if (wantsStream) reqBody.stream = true;
                const apiRes = await tryProvider('openrouter', 'https://openrouter.ai/api/v1/chat/completions', key, reqBody, 12000);
                if (wantsStream && apiRes.body) {
                  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
                  const reader = apiRes.body.getReader();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) { res.end(); return; }
                    res.write(value);
                  }
                }
                const data = await apiRes.json();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
                return;
              } catch (e) {
                lastErr = `OpenRouter ${model}: ${e.message}`;
              }
            }
          }
        } else {
          lastErr = 'OPENROUTER_KEY not configured.';
        }

        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `All providers exhausted. ${lastErr}` } }));
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
