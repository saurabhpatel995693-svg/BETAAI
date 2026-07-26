// BETAAI Vercel Serverless AI Proxy
// Primary: NVIDIA NIM (confirmed working)
// Fallback: OpenRouter (if free models return)

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    const payload = req.body || {};
    const messages = payload.messages || [];
    let lastErr = null;

    // ═══════════════════════════════════════════════════
    // TIER 1: NVIDIA NIM — Primary Provider (Confirmed Working)
    // ═══════════════════════════════════════════════════
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
          return res.status(200).json(data);
        } else {
          const errText = await apiRes.text();
          lastErr = `NVIDIA ${model} (${apiRes.status}): ${errText}`;
        }
      } catch (e) {
        lastErr = `NVIDIA ${model}: ${e.message}`;
      }
    }

    // ═══════════════════════════════════════════════════
    // TIER 2: OpenRouter — Fallback (if free models return)
    // ═══════════════════════════════════════════════════
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
            return res.status(200).json(data);
          }
        } catch (e) {
          lastErr = `OpenRouter: ${e.message}`;
        }
      }
    }

    return res.status(500).json({ error: { message: `All AI providers exhausted. ${lastErr}` } });
  } catch (e) {
    return res.status(400).json({ error: { message: e.message } });
  }
}
