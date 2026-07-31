// Test harness for api/chat.js — mocks AI provider endpoints and captures
// exactly what the backend sends to each provider, so we can verify
// complexity / persona / temperature / max_tokens actually reach the AI.
import handler from '../api/chat.js';

// ── Capture outgoing provider requests ────────────────────────────────
export const captured = [];   // { url, body }
export const logs = [];

const originalLog = console.log;
const originalWarn = console.warn;
console.log = (...a) => { logs.push(a.join(' ')); originalLog(...a); };
console.warn = (...a) => { logs.push('[WARN] ' + a.join(' ')); originalWarn(...a); };

export function installFetchMock() {
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body || '{}');
    captured.push({ url: String(url), body, headers: options.headers || {} });
    const content = '[MOCK-REPLY] ' + String(url).split('/').pop().split('?')[0] + ' | roles=' +
      (body.messages || []).map(m => m.role + ':' + (m.content || '').slice(0, 40).replace(/\n/g, ' ')).join('; ');
    const data = { choices: [{ message: { role: 'assistant', content } }] };
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: null,
      text: async () => JSON.stringify(data),
      json: async () => data,
    };
  };
}

export function mockReq(payload) {
  return {
    method: 'POST',
    headers: { 'x-forwarded-for': 'test-' + Math.random() + '.example' },
    socket: { remoteAddress: 'test' },
    body: payload,
  };
}

export function mockRes() {
  const res = {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(obj) { this.body = obj; return this; },
    write() { return true; },
    end() {},
  };
  return res;
}

export async function callChat(payload, opts = {}) {
  captured.length = 0;
  const res = mockRes();
  await handler(mockReq(payload), res);
  return { res, outgoing: captured.map(c => ({ url: c.url, body: c.body, headers: c.headers })) };
}

// ── Assertion helpers ──────────────────────────────────────────────────
export function roles(messages) { return messages.map(m => m.role + ':' + (m.content || '').slice(0, 80).replace(/\n/g, ' ')); }
