import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: true,
  },
};

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-custom-key, x-custom-base, x-custom-model, x-gemini-key, x-grok-key, x-openrouter-key, x-nvidia-key, x-ollama-host');

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

  // Extract single custom API Key, Base URL, Model ID from headers/body
  const customKey = req.headers['x-custom-key'] || payload.customKey || req.headers['authorization']?.replace(/^Bearer\s+/i, '').trim() || '';
  let customBase = req.headers['x-custom-base'] || payload.customBase || '';
  const customModel = req.headers['x-custom-model'] || payload.customModel || '';

  const clientGeminiKey = req.headers['x-gemini-key'] || payload.geminiKey || process.env.GEMINI_KEY || '';
  const clientGrokKey = req.headers['x-grok-key'] || payload.grokKey || process.env.GROK_KEY || process.env.GROQ_KEY || '';
  const clientOpenRouterKey = req.headers['x-openrouter-key'] || payload.openrouterKey || process.env.OPENROUTER_KEY || '';

  const isCodingMode = payload.mode === 'code' || rawModel.includes('coder') || rawModel.includes('coding');

  const targets = [];

  // 1. Single Custom User Provider (if specified in Settings)
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
  }

  // 2. Grok / Groq
  if (clientGrokKey) {
    targets.push({
      name: 'groq',
      url: clientGrokKey.startsWith('xai-') ? 'https://api.x.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions',
      key: clientGrokKey,
      model: 'llama-3.3-70b-versatile'
    });
  }

  // 3. Gemini Direct
  if (clientGeminiKey) {
    targets.push({
      name: 'gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: clientGeminiKey,
      model: 'gemini-2.5-flash'
    });
  }

  // 4. OpenRouter Free Tier Fallback
  targets.push({
    name: 'openrouter-free',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: clientOpenRouterKey || clientGeminiKey || '',
    model: isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free',
    headers: { 'X-Title': 'BETAAI' }
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

  // Guaranteed clean JSON fallback if all external requests hit timeouts or rate limits
  return res.status(200).json({
    choices: [
      {
        message: {
          content: `BETAAI is active! Note: Default quota is busy. You can enter your personal API key in Settings (⚙) to ensure maximum speed. (${lastErr})`
        }
      }
    ]
  });
}
