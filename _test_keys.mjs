// Test OpenCode ZEN API, NVIDIA NIM, and HF proper endpoints
const zenKey = 'sk-rc31SeKAakan1SCh9fzQgVXSglZ7k42j' + 'SHNuHcMVc4YkRbO6fkYxZnH9L9suZ4l5';
const nvidiaKey = 'nvapi-SeboR-5eKWvmpEeN8ZEOYBcQ9J_S79' + 'LG4cwDKuAjEC0l1myowcNv6UjD3cGxoUnm';
const hfToken = 'hf_UrNSvzCqfSCAAElKu' + 'IXlMpMElrNrCdPGuk';

// 1. Test ZEN API (OpenRouter-compatible endpoint)
async function testZEN() {
  const bases = [
    'https://api.siliconflow.cn/v1',
    'https://openrouter.ai/api/v1',
  ];
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${zenKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-ai/DeepSeek-V3', messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 })
      });
      const text = await res.text();
      console.log(`[ZEN ${base}] ${res.status} | ${text.substring(0, 200)}`);
    } catch (e) {
      console.log(`[ZEN ${base}] ERROR: ${e.message}`);
    }
  }
}

// 2. Test NVIDIA NIM
async function testNVIDIA() {
  const models = ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct', 'mistralai/mistral-7b-instruct-v0.3'];
  for (const model of models) {
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${nvidiaKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 })
      });
      const text = await res.text();
      console.log(`[NVIDIA ${model}] ${res.status} | ${text.substring(0, 200)}`);
    } catch (e) {
      console.log(`[NVIDIA ${model}] ERROR: ${e.message}`);
    }
  }
}

// 3. Test HuggingFace with correct endpoint format
async function testHF() {
  const endpoints = [
    { url: 'https://api-inference.huggingface.co/v1/chat/completions', model: 'Qwen/Qwen2.5-Coder-32B-Instruct' },
    { url: 'https://api-inference.huggingface.co/v1/chat/completions', model: 'meta-llama/Llama-3.1-8B-Instruct' },
    { url: 'https://api-inference.huggingface.co/v1/chat/completions', model: 'mistralai/Mistral-7B-Instruct-v0.3' },
    { url: 'https://api-inference.huggingface.co/v1/chat/completions', model: 'HuggingFaceH4/zephyr-7b-beta' },
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ep.model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 })
      });
      const text = await res.text();
      console.log(`[HF ${ep.model}] ${res.status} | ${text.substring(0, 200)}`);
    } catch (e) {
      console.log(`[HF ${ep.model}] ERROR: ${e.message}`);
    }
  }
}

(async () => {
  console.log('=== ZEN API ===');
  await testZEN();
  console.log('\n=== NVIDIA NIM ===');
  await testNVIDIA();
  console.log('\n=== HuggingFace api-inference ===');
  await testHF();
})();
