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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-custom-key, x-custom-base, x-custom-model, x-gemini-key, x-grok-key, x-openrouter-key');

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

  const clientGeminiKey = req.headers['x-gemini-key'] || payload.geminiKey || process.env.GEMINI_KEY || '';
  const clientGrokKey = req.headers['x-grok-key'] || payload.grokKey || process.env.GROK_KEY || process.env.GROQ_KEY || '';
  const clientOpenRouterKey = req.headers['x-openrouter-key'] || payload.openrouterKey || process.env.OPENROUTER_KEY || '';

  const isCodingMode = payload.mode === 'code' || rawModel.includes('coder') || rawModel.includes('coding');

  const targets = [];

  // 1. User Custom API Key / Base URL (if entered in Settings modal)
  if (customKey || customBase) {
    let baseUrl = (customBase || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    if (!baseUrl.endsWith('/chat/completions')) baseUrl = `${baseUrl}/chat/completions`;
    targets.push({
      name: 'User-Custom-API',
      url: baseUrl,
      key: customKey,
      model: customModel || (isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free')
    });
  }

  // 2. Chat & VibeCoding Primary Target: Groq / Grok 70B API
  const grokKey = clientGrokKey || process.env.GROQ_KEY || process.env.GROK_KEY || '';
  if (grokKey) {
    targets.push({
      name: 'Grok-Groq-Primary',
      url: grokKey.startsWith('xai-') ? 'https://api.x.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions',
      key: grokKey,
      model: 'llama-3.3-70b-versatile'
    });
  }

  // 3. Chat & VibeCoding Secondary Target: Gemini 2.5 Flash API
  const geminiKey = clientGeminiKey || process.env.GEMINI_KEY || '';
  if (geminiKey) {
    targets.push({
      name: 'Gemini-Flash-Primary',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: geminiKey,
      model: 'gemini-2.5-flash'
    });
  }

  // 4. OpenRouter Provider Target (For Notebooks, Discover & Failover)
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

  // 5. OpenRouter Free Models Backup Target
  const freeModels = isCodingMode
    ? ['google/gemini-2.5-flash:free', 'qwen/qwen-2.5-coder-32b-instruct:free']
    : ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.5-flash:free', 'deepseek/deepseek-r1:free'];

  for (const fModel of freeModels) {
    if (openRouterKey) {
      targets.push({
        name: `OpenRouter-Free-${fModel}`,
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: openRouterKey,
        model: fModel,
        headers: { 'X-Title': 'BETAAI' }
      });
    }
  }

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
        messages,
        model: target.model || 'gemini-2.5-flash',
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

  // Final Failover response if no key was passed
  return res.status(200).json({
    choices: [
      {
        message: {
          role: 'assistant',
          content: `BETAAI is active! Note: Please set your Gemini / Grok / OpenRouter API Key in Settings (⚙) for maximum performance.`
        }
      }
    ]
  });
}
