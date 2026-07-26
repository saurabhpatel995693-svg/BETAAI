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
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_KEY || process.env.GROK_KEY || '',
    models: ['llama-3.3-70b-versatile', 'llama3-8b-8192'],
    timeout: 3500
  },
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-custom-key, x-custom-base, x-custom-model, x-gemini-key, x-grok-key, x-openrouter-key, x-nvidia-key, x-ollama-host');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let payload = {};
    try {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      await new Promise(resolve => req.on('end', resolve));
      if (bodyStr) payload = JSON.parse(bodyStr);
    } catch (e) { payload = {}; }

    const messages = payload.messages || [];
    const rawModel = payload.model || '';
    const wantsStream = payload.stream === true;
    let lastErr = '';

    const customKey = req.headers['x-custom-key'] || payload.customKey || req.headers['authorization']?.replace(/^Bearer\s+/i, '').trim() || '';
    let customBase = req.headers['x-custom-base'] || payload.customBase || '';
    const customModel = req.headers['x-custom-model'] || payload.customModel || '';

    const clientGeminiKey = req.headers['x-gemini-key'] || payload.geminiKey || process.env.GEMINI_KEY || '';
    const clientGrokKey = req.headers['x-grok-key'] || payload.grokKey || process.env.GROK_KEY || process.env.GROQ_KEY || '';
    const clientOpenRouterKey = req.headers['x-openrouter-key'] || payload.openrouterKey || process.env.OPENROUTER_KEY || '';

    const isCodingMode = payload.mode === 'code' || rawModel.includes('coder') || rawModel.includes('coding');

    const targets = [];

    if (customBase || customKey) {
      let baseUrl = (customBase || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
      if (!baseUrl.endsWith('/chat/completions')) {
        baseUrl = `${baseUrl}/chat/completions`;
      }
      targets.push({
        name: 'custom-provider',
        url: baseUrl,
        key: customKey || clientOpenRouterKey || clientGeminiKey,
        model: customModel || rawModel || (isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free')
      });
      const grokKey = clientGrokKey || process.env.GROQ_KEY || process.env.GROK_KEY || '';
      if (grokKey) {
        targets.push({
          name: 'Grok-Groq-Primary',
          url: grokKey.startsWith('xai-') ? 'https://api.x.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions',
          key: grokKey,
          model: 'llama-3.3-70b-versatile'
        });
      }

      const geminiKey = clientGeminiKey || process.env.GEMINI_KEY || '';
      if (geminiKey) {
        targets.push({
          name: 'Gemini-Flash-Primary',
          url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          key: geminiKey,
          model: 'gemini-2.5-flash'
        });
      }

      const openRouterKey = clientOpenRouterKey || process.env.OPENROUTER_KEY || '';
      if (openRouterKey) {
        targets.push({
          name: 'OpenRouter-Primary',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          key: openRouterKey,
          model: isCodingMode ? 'qwen/qwen-2.5-coder-32b-instruct:free' : 'google/gemini-2.5-flash:free',
          headers: { 'X-Title': 'BETAAI' }
        });
      }

    for (const target of targets) {
      try {
        const headers = { 'Content-Type': 'application/json', ...(target.headers || {}) };
        if (target.key) headers['Authorization'] = `Bearer ${target.key}`;

        const requestBody = {
          model: target.model,
          messages,
          temperature: payload.temperature || 0.3,
          max_tokens: payload.max_tokens || 4096,
          stream: wantsStream
        };

        const apiRes = await fetchWithTimeout(target.url, { method: 'POST', headers, body: JSON.stringify(requestBody) }, 10000);
        if (!apiRes.ok) {
          const text = await apiRes.text().catch(() => '');
          lastErr = `${target.name} (${apiRes.status}): ${text.substring(0, 100)}`;
          continue;
        }

        if (wantsStream && apiRes.body) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
          const reader = apiRes.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
          return;
        }

        const data = await apiRes.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      } catch (err) {
        lastErr = `${target.name}: ${err.message}`;
      }
    }

    const lastMsgObj = messages[messages.length - 1];
    const userText = (lastMsgObj ? lastMsgObj.content : 'hello').trim();
    const lowerText = userText.toLowerCase();

    let replyContent = '';
    if (lowerText.includes('who created you') || lowerText.includes('who made you') || lowerText.includes('who is your creator')) {
      replyContent = "I am **BETAAI**, an advanced multi-modal AI platform created by **SAURABH**. I am designed for AI Chat, Image Generation, VibeCoding web apps, and Notebook study tools. How can I help you today?";
    } else if (lowerText.includes('what is betaai') || lowerText.includes('who are you')) {
      replyContent = "I am **BETAAI**, your high-performance AI workspace built by **SAURABH**. I integrate live code generation, interactive split canvas VibeCoding, image synthesis, and study notebooks!";
    } else {
      replyContent = `Hello! I am **BETAAI** created by **SAURABH**.\n\nYou asked: "${userText}"\n\nI am ready to assist you! For full API access, you can optionally configure your custom API Key in Settings (⚙).`;
    }

    if (wantsStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const chunk = JSON.stringify({ choices: [{ delta: { content: replyContent } }] });
      res.write(`data: ${chunk}\n\ndata: [DONE]\n\n`);
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: replyContent } }] }));
    return;
  }

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
