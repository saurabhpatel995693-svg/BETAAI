// Test AI provider keys (set via env vars, not hardcoded)
const zenKey = process.env.ZEN_API_KEY || '';

if (!zenKey) { console.error('Set ZEN_API_KEY env var first.'); process.exit(1); }

async function test(label, url, model) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${zenKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 }) });
    const text = await res.text();
    console.log(`[${label}] ${res.status} | ${text.substring(0, 250)}`);
  } catch (e) { console.log(`[${label}] ERROR: ${e.message}`); }
}

async function listModels(label, url) {
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${zenKey}` } });
    const text = await res.text();
    console.log(`[${label} models] ${res.status} | ${text.substring(0, 500)}`);
  } catch (e) { console.log(`[${label} models] ERROR: ${e.message}`); }
}

(async () => {
  console.log('=== List Models ===');
  await listModels('OpenCode', 'https://api.opencode.ai/v1/models');
  console.log('\n=== Chat Models ===');
  for (const m of ['gpt-4o', 'deepseek-chat', 'llama-3.1-70b']) await test(m, 'https://api.opencode.ai/v1/chat/completions', m);
})();
