// BETAAI Vercel Serverless AI Proxy
// Multi-tier failover: NVIDIA NIM -> OpenRouter -> SiliconFlow/other
// Supports streaming (SSE) and non-streaming responses.

const PROVIDERS = [
  // Tier 1: OpenRouter (Instant streaming, ultra-low latency)
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: process.env.OPENROUTER_KEY || process.env.GEMINI_KEY || '',
    models: ['google/gemini-2.5-flash:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen-2.5-coder-32b-instruct:free', 'deepseek/deepseek-r1:free'],
    timeout: 4000,
    extraHeaders: { 'X-Title': 'BETAAI' }
  },
  // Tier 2: NVIDIA NIM (Fast secondary fallback)
  {
    name: 'nvidia',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    key: process.env.NVIDIA_KEY || '',
    models: ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'],
    timeout: 4000
  },
  // Tier 3: Coding provider
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

  const headers = {
    'Authorization': `Bearer ${provider.key}`,
    'Content-Type': 'application/json',
    ...(provider.extraHeaders || {})
  };

  const reqBody = { ...body, model };
  if (wantsStream) reqBody.stream = true;

  const apiRes = await fetchWithTimeout(provider.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(reqBody)
  }, provider.timeout);

  if (!apiRes.ok) {
    const errText = await apiRes.text().catch(() => '');
    throw new Error(`${provider.name}/${model} ${apiRes.status}: ${errText.substring(0, 150)}`);
  }

  return apiRes;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  // Parse body
  let payload;
  try {
    if (req.body) {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      payload = {};
    }
  } catch (e) {
    return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  }

  try {
    const messages = payload.messages || [];
    const rawModel = payload.model || '';
    const wantsStream = payload.stream === true;
    let lastErr = null;

    // Extract authorization header or body key if supplied
    const authHeader = req.headers['authorization'] || '';
    const clientKey = authHeader.replace(/^Bearer\s+/i, '').trim() || payload.key;

    // Clean model string (strip prefixes like search/ or coding/)
    const cleanModel = rawModel.replace(/^(search|coding|nvidia|openrouter)\//i, '').trim();

    // Dynamically build provider list with user/env keys
    const activeProviders = PROVIDERS.map(p => {
      let keyToUse = p.key;
      if (p.name === 'openrouter' && clientKey && clientKey.startsWith('sk-or-v1-')) {
        keyToUse = clientKey;
      }
      return { ...p, key: keyToUse };
    }).filter(p => p.key && p.key.trim().length > 0);

    // If no active providers, default to OpenRouter free Tier with public fallback
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

    // Map client requested model names to valid OpenRouter free models
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
          const body = {
            messages,
            temperature: payload.temperature || 0.3,
            max_tokens: payload.max_tokens || 4096
          };

          const apiRes = await tryProvider(provider, model, body, wantsStream);

          if (wantsStream && apiRes.body) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const reader = apiRes.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            } catch (e) { /* stream end */ }
            res.end();
            return;
          }

          const data = await apiRes.json();
          return res.status(200).json(data);
        } catch (e) {
          lastErr = `${provider.name}/${model}: ${e.message}`;
          console.warn(`[AI Failover] ${provider.name}/${model} failed:`, e.message);
        }
      }
    }

    return res.status(500).json({ error: { message: `All providers failed. ${lastErr}` } });
  } catch (e) {
    return res.status(400).json({ error: { message: e.message } });
  }
}
