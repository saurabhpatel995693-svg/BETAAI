const DEFAULT_PROVIDERS = [
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: ['GROQ_KEY', 'GROK_KEY'],
    models: ['llama-3.3-70b-versatile', 'llama3-8b-8192'],
    timeout: 7000
  },
  {
    name: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyEnv: ['GEMINI_KEY'],
    models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    timeout: 7000
  },
  {
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: ['OPENROUTER_KEY', 'GEMINI_KEY'],
    models: ['google/gemini-2.5-flash:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen-2.5-coder-32b-instruct:free', 'deepseek/deepseek-r1:free'],
    timeout: 8000,
    extraHeaders: { 'X-Title': 'BETAAI' }
  },
  {
    name: 'nvidia',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    keyEnv: ['NVIDIA_KEY'],
    models: ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'],
    timeout: 7000
  }
];

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

async function tryProvider(provider, model, body, wantsStream) {
  const headers = {
    'Content-Type': 'application/json',
    ...(provider.extraHeaders || {})
  };
  if (provider.key) {
    headers['Authorization'] = `Bearer ${provider.key}`;
  }

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gemini-key, x-grok-key, x-openrouter-key, x-nvidia-key, x-ollama-host');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

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

    const clientGeminiKey = req.headers['x-gemini-key'] || payload.geminiKey || process.env.GEMINI_KEY || '';
    const clientGrokKey = req.headers['x-grok-key'] || payload.grokKey || process.env.GROK_KEY || process.env.GROQ_KEY || '';
    const clientOpenRouterKey = req.headers['x-openrouter-key'] || payload.openrouterKey || process.env.OPENROUTER_KEY || '';
    const clientNvidiaKey = req.headers['x-nvidia-key'] || payload.nvidiaKey || process.env.NVIDIA_KEY || '';
    const clientOllamaHost = req.headers['x-ollama-host'] || payload.ollamaHost || 'http://localhost:11434';

    const authHeader = req.headers['authorization'] || '';
    const clientKey = authHeader.replace(/^Bearer\s+/i, '').trim() || payload.key;

    const cleanModel = rawModel.replace(/^(search|coding|notebook|nvidia|openrouter|groq|grok|gemini|ollama)\//i, '').trim();
    const isCodingMode = payload.mode === 'code' || rawModel.includes('coder') || rawModel.includes('coding');

    const activeProviders = [];

    // Local Ollama
    if (cleanModel.startsWith('ollama') || rawModel.includes('ollama')) {
      activeProviders.push({
        name: 'ollama',
        url: `${clientOllamaHost.replace(/\/$/, '')}/v1/chat/completions`,
        key: 'ollama',
        models: [cleanModel || 'llama3', 'qwen2.5-coder', 'mistral'],
        timeout: 10000
      });
    }

    // Grok / Groq
    if (clientGrokKey) {
      activeProviders.push({
        name: 'groq',
        url: clientGrokKey.startsWith('xai-') ? 'https://api.x.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions',
        key: clientGrokKey,
        models: ['llama-3.3-70b-versatile', 'grok-beta', 'llama3-8b-8192'],
        timeout: 7000
      });
    }

    // Gemini Direct
    if (clientGeminiKey) {
      activeProviders.push({
        name: 'gemini',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        key: clientGeminiKey,
        models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
        timeout: 7000
      });
    }

    // OpenRouter
    if (clientOpenRouterKey || clientKey) {
      activeProviders.push({
        name: 'openrouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: clientOpenRouterKey || clientKey,
        models: ['google/gemini-2.5-flash:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen-2.5-coder-32b-instruct:free', 'deepseek/deepseek-r1:free'],
        timeout: 8000,
        extraHeaders: { 'X-Title': 'BETAAI' }
      });
    }

    // NVIDIA NIM
    if (clientNvidiaKey) {
      activeProviders.push({
        name: 'nvidia',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        key: clientNvidiaKey,
        models: ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'],
        timeout: 7000
      });
    }

    // OpenRouter Free Public Fallback Tier
    activeProviders.push({
      name: 'openrouter-free',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: clientOpenRouterKey || clientGeminiKey || clientKey || '',
      models: isCodingMode ? ['google/gemini-2.5-flash:free', 'qwen/qwen-2.5-coder-32b-instruct:free'] : ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.5-flash:free', 'deepseek/deepseek-r1:free'],
      timeout: 10000,
      extraHeaders: { 'X-Title': 'BETAAI' }
    });

    function mapOpenRouterModel(m) {
      if (!m) return isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free';
      if (m.includes(':free')) return m;
      const lower = m.toLowerCase();
      if (lower.includes('llama')) return 'meta-llama/llama-3.3-70b-instruct:free';
      if (lower.includes('qwen') || lower.includes('coder')) return 'qwen/qwen-2.5-coder-32b-instruct:free';
      if (lower.includes('deepseek')) return 'deepseek/deepseek-r1:free';
      if (lower.includes('gemini')) return 'google/gemini-2.5-flash:free';
      return isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free';
    }

    for (const provider of activeProviders) {
      let modelsToTry = [...provider.models];
      if (cleanModel) {
        const normalized = provider.name.startsWith('openrouter') ? mapOpenRouterModel(cleanModel) : cleanModel;
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

    // Ultimate Fallback: Public response
    return res.status(200).json({ choices: [{ message: { content: "I am ready! Please check your network connection or API keys in Settings." } }] });

  } catch (e) {
    return res.status(200).json({ choices: [{ message: { content: `BETAAI Notice: ${e.message}` } }] });
  }
}
