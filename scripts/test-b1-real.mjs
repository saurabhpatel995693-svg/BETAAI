// REAL acceptance test for B1 — hits live AI (no API key: Pollinations fallback).
// Same prompt, three complexity levels → three visibly different code outputs.
import { callChat } from './test-chat.mjs';

const PROMPT = 'build a todo app with html css js';

async function runCase(complexity) {
  const { res } = await callChat({
    mode: 'code',
    complexity,
    messages: [{ role: 'user', content: PROMPT }],
  });
  const content = res.body?.choices?.[0]?.message?.content || '';
  const codeBlock = content.match(/```[\w]*\n([\s\S]*?)```/);
  const code = codeBlock ? codeBlock[1] : content;
  return {
    complexity,
    totalChars: content.length,
    codeChars: code.length,
    codeLines: code.split('\n').length,
    firstLine: content.split('\n').find(l => l.trim())?.slice(0, 100) || '',
  };
}

for (const c of ['Simple snippet', 'Complete module', 'Full application']) {
  const r = await runCase(c);
  console.log(JSON.stringify(r));
}
