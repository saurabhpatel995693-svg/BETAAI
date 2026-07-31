// B2 verification: DEFAULT_CODING_SYSTEM_PROMPT must be first system message
// for code mode, even when a custom prompt is supplied (appended, not replaced).
import { installFetchMock, callChat, captured } from './test-chat.mjs';

installFetchMock();

const { outgoing } = await callChat({
  mode: 'code',
  complexity: 'Full application',
  messages: [
    { role: 'system', content: 'MY CUSTOM SETTINGS PROMPT: build like a ninja' },
    { role: 'user', content: 'make a dashboard' },
  ],
});

const sent = outgoing[0].body;
const sys = sent.messages.filter(m => m.role === 'system');
console.log('system message count:', sys.length);
sys.forEach((m, i) => console.log(`[${i}] ${m.content.slice(0, 60).replace(/\n/g, ' ')}...`));
console.log('---');
console.log('DEFAULT first?', sys[0]?.content.includes('Principal-level Frontend Engineer'));
console.log('Custom prompt present?', sys.some(m => m.content.includes('MY CUSTOM SETTINGS PROMPT')));
console.log('Custom after default?', sys.findIndex(m => m.content.includes('Principal-level')) < sys.findIndex(m => m.content.includes('MY CUSTOM SETTINGS PROMPT')));
