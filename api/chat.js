// BETAAI Vercel Serverless AI Proxy
// Primary: NVIDIA NIM (free tier)  |  Fallback: OpenRouter free models
// Supports both streaming (SSE) and non-streaming responses.

const NVIDIA_KEY = process.env.NVIDIA_KEY || '';
const OPENROUTER_KEYS = [
  process.env.OPENROUTER_KEY || '',
  process.env.OPENROUTER_ALT || ''
].filter(Boolean);

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

/** Try a single provider+model. Returns the Response if ok, else null. */
async function tryProvider(name, url, apiKey, body, timeoutMs) {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (name === 'openrouter') headers['X-Title'] = 'BETAAI';

  const apiRes = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, timeoutMs);

  if (apiRes.ok) return apiRes;
  const errText = await apiRes.text().catch(() => '');
  throw new Error(`${name} ${apiRes.status}: ${errText.substring(0, 200)}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  // Manually parse the request body (Vercel Node.js runtime may not auto-parse)
  let payload;
  try {
    const body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    payload = JSON.parse(body || '{}');
  } catch (e) {
    return res.status(400).json({ error: { message: 'Invalid JSON body' } });
  }

  try {
    const messages = payload.messages || [];
    const wantsStream = payload.stream === true;
    let lastErr = null;

    // ── Tier 1: NVIDIA NIM ──────────────────────────────
    if (NVIDIA_KEY) {
      const nvidiaModels = ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'];
      for (const model of nvidiaModels) {
        try {
          const body = {
            model,
            messages,
            temperature: payload.temperature || 0.3,
            max_tokens: payload.max_tokens || 4096
          };
          if (wantsStream) body.stream = true;

          const apiRes = await tryProvider('nvidia', 'https://integrate.api.nvidia.com/v1/chat/completions', NVIDIA_KEY, body, 15000);

          // Forward streaming response as-is
          if (wantsStream && apiRes.body) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const reader = apiRes.body.getReader();
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read();
                if (done) { res.end(); return; }
                res.write(value);
              }
            };
            await pump().catch(() => res.end());
            return;
          }

          // Non-streaming: return full JSON
          const data = await apiRes.json();
          return res.status(200).json(data);
        } catch (e) {
          lastErr = `NVIDIA ${model}: ${e.message}`;
        }
      }
    } else {
      lastErr = 'NVIDIA_KEY not configured.';
    }

    // ── Tier 2: OpenRouter free models ──────────────────
    if (OPENROUTER_KEYS.length > 0) {
      const orModels = [
        payload.model || 'google/gemini-2.5-flash:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen-2.5-coder-32b-instruct:free'
      ];
      for (const key of OPENROUTER_KEYS) {
        for (const model of orModels) {
          try {
            const body = {
              model,
              messages,
              temperature: payload.temperature || 0.3,
              max_tokens: payload.max_tokens || 4096
            };
            if (wantsStream) body.stream = true;

            const apiRes = await tryProvider('openrouter', 'https://openrouter.ai/api/v1/chat/completions', key, body, 12000);

            // Forward streaming response as-is
            if (wantsStream && apiRes.body) {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              const reader = apiRes.body.getReader();
              const pump = async () => {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { res.end(); return; }
                  res.write(value);
                }
              };
              await pump().catch(() => res.end());
              return;
            }

            // Non-streaming: return full JSON
            const data = await apiRes.json();
            return res.status(200).json(data);
          } catch (e) {
            lastErr = `OpenRouter ${model}: ${e.message}`;
          }
        }
      }
    } else {
      lastErr = 'OPENROUTER_KEY not configured. Add OPENROUTER_KEY to Vercel env vars.';
    }

    return res.status(500).json({ error: { message: `All providers exhausted. ${lastErr}` } });
  } catch (e) {
    return res.status(400).json({ error: { message: e.message } });
  }
}
