import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: true,
  },
};

async function fetchWithTimeout(url, options, timeoutMs = 10000) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-custom-key, x-custom-base, x-custom-model');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  let payload = {};
  try {
    if (req.body) {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (e) {
    payload = {};
  }

  const messages = payload.messages || [];
  const rawModel = payload.model || '';
  const wantsStream = payload.stream === true;
  let lastErr = '';

  const customKey = req.headers['x-custom-key'] || payload.customKey || req.headers['authorization']?.replace(/^Bearer\s+/i, '').trim() || '';
  let customBase = req.headers['x-custom-base'] || payload.customBase || '';
  const customModel = req.headers['x-custom-model'] || payload.customModel || '';

  const isCodingMode = payload.mode === 'code' || rawModel.includes('coder') || rawModel.includes('coding');

  const targets = [];

  // 1. Custom User Provided Key / Base URL (from Settings modal)
  if (customKey || customBase) {
    let baseUrl = (customBase || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    if (!baseUrl.endsWith('/chat/completions')) {
      baseUrl = `${baseUrl}/chat/completions`;
    }
    targets.push({
      name: 'User-Custom-API',
      url: baseUrl,
      key: customKey,
      model: customModel || (isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free')
    });
  }

  // 2. Gemini Direct (Environment Key)
  if (process.env.GEMINI_KEY) {
    targets.push({
      name: 'Gemini-API',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: process.env.GEMINI_KEY,
      model: 'gemini-2.5-flash'
    });
  }

  // 3. Grok / Groq (Environment Key)
  if (process.env.GROQ_KEY || process.env.GROK_KEY) {
    const k = process.env.GROQ_KEY || process.env.GROK_KEY;
    targets.push({
      name: 'Grok-Groq-API',
      url: k.startsWith('xai-') ? 'https://api.x.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions',
      key: k,
      model: 'llama-3.3-70b-versatile'
    });
  }

  // 4. OpenRouter (Environment Key)
  if (process.env.OPENROUTER_KEY) {
    targets.push({
      name: 'OpenRouter-Key-API',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: process.env.OPENROUTER_KEY,
      model: isCodingMode ? 'qwen/qwen-2.5-coder-32b-instruct:free' : 'google/gemini-2.5-flash:free',
      headers: { 'X-Title': 'BETAAI' }
    });
  }

  // 5. Pollinations AI (100% Free Public AI Engine - Zero Auth Key Required!)
  targets.push({
    name: 'Pollinations-Public-AI',
    url: 'https://text.pollinations.ai/openai',
    key: '',
    model: isCodingMode ? 'qwen-coder' : 'openai'
  });

  for (const target of targets) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(target.headers || {})
      };
      if (target.key) {
        headers['Authorization'] = `Bearer ${target.key}`;
      }

      const requestBody = {
        model: target.model,
        messages,
        temperature: payload.temperature || 0.3,
        max_tokens: payload.max_tokens || 4096,
        stream: wantsStream
      };

      const apiRes = await fetchWithTimeout(target.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      }, 10000);

      if (!apiRes.ok) {
        const text = await apiRes.text().catch(() => '');
        lastErr = `${target.name} (${apiRes.status}): ${text.substring(0, 100)}`;
        continue;
      }

      if (wantsStream && apiRes.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');

        try {
          if (typeof Readable.fromWeb === 'function') {
            Readable.fromWeb(apiRes.body).pipe(res);
            return;
          }
        } catch (pipeErr) {}

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
      return res.status(200).json(data);
    } catch (err) {
      lastErr = `${target.name}: ${err.message}`;
    }
  }

  // Pollinations Direct Text Fallback
  try {
    const lastUserMsg = messages[messages.length - 1]?.content || 'Hello';
    const pollRes = await fetchWithTimeout('https://text.pollinations.ai/' + encodeURIComponent(lastUserMsg), { method: 'GET' }, 8000);
    if (pollRes.ok) {
      const text = await pollRes.text();
      return res.status(200).json({ choices: [{ message: { content: text } }] });
    }
  } catch (e) {}

  return res.status(200).json({
    choices: [
      {
        message: {
          content: 'BETAAI Assistant is ready! Type your message to start.'
        }
      }
    ]
  });
}
