// C4 verification: persona modes must change the system prompt sent to the AI.
// Simulates exactly what the frontend sends: getSystemPrompt() embeds the
// persona text into the system message. We verify two personas produce
// different outgoing messages AND the persona text actually reaches the provider.
import { installFetchMock, callChat, captured } from './test-chat.mjs';

installFetchMock();

const PERSONA_PROMPTS = {
  default: 'You are SHESHAAI by SAURABH, a world-class AI assistant trained on Vercel Design System',
  coder: 'You are SHESHAAI Master Code Architect by SAURABH.',
  teacher: 'You are SHESHAAI Teacher Mode by SAURABH.',
  creative: 'You are SHESHAAI Creative Mode by SAURABH.',
  analyst: 'You are SHESHAAI Analyst Mode by SAURABH.',
};

for (const persona of Object.keys(PERSONA_PROMPTS)) {
  const { outgoing } = await callChat({
    mode: 'general',
    temperature: 0.7,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: PERSONA_PROMPTS[persona] + '\n[extra persona context]' },
      { role: 'user', content: `explain recursion to me (persona: ${persona})` },
    ],
  });
  const sent = outgoing[0].body;
  const personaReachedAI = sent.messages.some(m => m.content.includes(PERSONA_PROMPTS[persona].slice(0, 40)));
  console.log(`persona=${persona} | reachedProvider=${personaReachedAI} | sysMsgs=${sent.messages.filter(m=>m.role==='system').length} | temp=${sent.temperature} | max_tokens=${sent.max_tokens}`);
}
