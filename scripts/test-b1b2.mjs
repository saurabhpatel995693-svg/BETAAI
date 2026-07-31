// B1+B2 verification: complexity branches + DEFAULT_CODING_SYSTEM_PROMPT.
import { installFetchMock, callChat, captured, logs } from './test-chat.mjs';

installFetchMock();

const PROMPT = 'build a todo app with html css js';
const sys = (complexity) => `You are VibeCoding AI. Complexity: ${complexity}.`;

async function runCase(complexity, tag) {
  const { res, outgoing } = await callChat({
    mode: 'code',
    complexity,
    messages: [{ role: 'system', content: sys(complexity) }, { role: 'user', content: PROMPT }],
  });
  const sent = outgoing[0]?.body;
  return {
    tag,
    statusCode: res.statusCode,
    httpStatus: res.status,
    replyContent: (res.body?.choices?.[0]?.message?.content || '').slice(0, 90),
    outgoingCount: outgoing.length,
    outgoing: sent ? {
      max_tokens: sent.max_tokens,
      temperature: sent.temperature,
      systemCount: (sent.messages || []).filter(m => m.role === 'system').length,
      firstSystem: sent.messages?.[0]?.content.slice(0, 120),
      hasDefaultCodingPrompt: (sent.messages || []).some(m => m.role === 'system' && m.content.includes('Principal-level Frontend Engineer')),
      hasComplexityInstruction: (sent.messages || []).some(m => m.role === 'system' && m.content.startsWith('INSTRUCTION:')),
      complexityInstructionText: (sent.messages || []).find(m => m.role === 'system' && m.content.startsWith('INSTRUCTION:'))?.content.slice(0, 80) || '',
    } : null,
  };
}

// ── Sequence 1: cache-bug reproduction (same prompt, 3 complexity levels, same IP → cache!) ──
console.log('=== SEQ 1: same prompt, 3 complexities (cache behavior) ===');
const c1 = await runCase('Full application', 'full#1');
const c2 = await runCase('Complete module', 'module#2');
const c3 = await runCase('Simple snippet', 'simple#3');
for (const r of [c1, c2, c3]) console.log(JSON.stringify(r));
console.log('IDENTICAL?', c1.replyContent === c2.replyContent && c2.replyContent === c3.replyContent);
console.log('CACHE HITS (no outgoing):', c2.outgoingCount, c3.outgoingCount);

// ── Sequence 2: unique IPs, fresh prompts to bypass cache — verify branching ──
console.log('\n=== SEQ 2: unique prompts, verify branching ===');
const r1 = await runCase('Full application', 'full-A');
const r2 = await runCase('Complete module', 'module-B');
const r3 = await runCase('Simple snippet', 'simple-C');
for (const r of [r1, r2, r3]) console.log(JSON.stringify(r));
