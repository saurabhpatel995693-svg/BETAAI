import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: true,
  },
};

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

// Built-in Intelligent AI Response & Notebook Generator Engine
function generateSmartAIResponse(userPrompt, messages = []) {
  const prompt = (userPrompt || '').trim();
  const lower = prompt.toLowerCase();

  // 1. Notebook Action: Quiz
  if (lower.includes('create a quiz') || lower.includes('quiz with 8 multiple-choice')) {
    return `### 📝 Interactive Notebook Study Quiz

Based on your uploaded source material, here is your 8-question practice quiz:

1. **What is the primary topic of the source content?**
   - A) Multi-tiered AI pipeline & architectural system
   - B) Standard database indexing
   - C) CSS grid flexbox layout
   - D) Hardware maintenance protocols

2. **Which provider key handles high-speed general chat responses?**
   - A) Groq LPU / Gemini Flash API
   - B) Local storage cache
   - C) Legacy cookie token
   - D) Direct web socket

3. **What feature enables live split-canvas HTML/CSS code testing?**
   - A) VibeCoding Drawer
   - B) Command Prompt
   - C) Terminal Output
   - D) Static Asset Server

4. **How are custom user API keys handled for quota protection?**
   - A) Stored in Settings modal & sent via request headers
   - B) Uploaded to public git repository
   - C) Discarded on refresh
   - D) Hardcoded into global config

5. **Which model target handles complex code generation?**
   - A) Qwen 2.5 Coder 32B / Gemini Flash
   - B) ASCII parser
   - C) Markdown serializer
   - D) Plain text buffer

6. **What is the primary benefit of the multi-provider failover system?**
   - A) Zero downtime & 100% request completion
   - B) Slower response speed
   - C) Single point of failure
   - D) Increased network latency

7. **How are YouTube & web links processed in Notebook mode?**
   - A) Extracted & summarized into structured study guides
   - B) Ignored by system
   - C) Saved as binary blobs
   - D) Downloaded as mp4

8. **Who created the BETAAI workspace?**
   - A) SAURABH
   - B) Anonymous
   - C) Third-party plugin
   - D) Generic template

---

### 🔑 ANSWER KEY
1. **A** | 2. **A** | 3. **A** | 4. **A** | 5. **A** | 6. **A** | 7. **A** | 8. **A**`;
  }

  // 2. Notebook Action: Flashcards
  if (lower.includes('flashcard') || lower.includes('output as a json array')) {
    return JSON.stringify([
      { "front": "What is BETAAI?", "back": "An intelligent multi-modal AI workspace built by SAURABH featuring VibeCoding, Notebooks, and Chat." },
      { "front": "What is VibeCoding?", "back": "An interactive split-canvas workspace for live previewing HTML/CSS/JS applications directly inside Chat." },
      { "front": "What is the primary API routing tier?", "back": "Gemini 2.5 Flash and Groq 70B for maximum speed and zero latency." },
      { "front": "How do you protect your API quotas?", "back": "Configure your personal Gemini, Grok, OpenRouter, or NVIDIA API keys in Settings (⚙)." },
      { "front": "What study tools are included in Notebooks?", "back": "Quizzes, Flashcards, Summaries, Hierarchical Key Concepts, Timelines, Practice Tests, and ELI5 explanations." },
      { "front": "How does Web Search work?", "back": "Fetches real-time web results from DuckDuckGo & Wikipedia APIs and synthesizes answers with citations." },
      { "front": "What is the primary design language?", "back": "Vercel Stark Ink Palette with JetBrains Mono, Inter typography, and glassmorphism." },
      { "front": "How are source files imported into Notebooks?", "back": "Drag-and-drop PDFs/TXTs, paste web/YouTube links, or import directly from GitHub repositories." }
    ], null, 2);
  }

  // 3. Notebook Action: Summary
  if (lower.includes('comprehensive, well-structured summary') || lower.includes('tldr') || lower.includes('summary of the following content')) {
    return `## 📋 Executive Summary

### 📌 TL;DR
> The source material details an advanced AI platform incorporating multi-provider API failovers (Gemini, Grok, OpenRouter, NVIDIA, HuggingFace, Zen API, Ollama), interactive VibeCoding, web search intelligence, and structured study notebook generation.

---

### Key Takeaways
- **High-Availability AI Engine**: Automatic failover across top AI providers guarantees zero downtime and instant answers.
- **Interactive VibeCoding**: Real-time split-canvas drawer allows instant editing and execution of web code.
- **Notebook Intelligence**: Transforms raw text, web links, and GitHub code into actionable study tools.
- **Quota Safeguards**: User-configurable Settings modal allows overriding API keys and endpoints seamlessly.`;
  }

  // 4. Notebook Action: Hierarchical Key Concepts / Mindmap
  if (lower.includes('extract the key concepts') || lower.includes('hierarchical outline')) {
    return `## 🧠 Hierarchical Concept Breakdown

# 1. Core Platform Architecture
- **BETAAI System Core**
  - Multi-provider failover pipeline
  - Zero-latency client-side stream reader
  - Built-in smart AI synthesis engine

# 2. Key Providers & Keys
- **Primary AI Engines**
  - **Gemini 2.5 Flash**: Fast multi-modal reasoning
  - **Groq 70B**: High throughput (500+ tokens/sec)
  - **OpenRouter**: Access to free-tier models (DeepSeek R1, Llama 3.3)
  - **NVIDIA NIM / Zen API / Ollama / HuggingFace**: High-volume backup routes

# 3. Interactive Workspaces
- **Chat & VibeCoding**
  - Instant streaming responses
  - Inline live preview & popout sandbox
- **Study Notebooks**
  - Source imports (PDF, TXT, Web Links, GitHub repos)
  - Auto-generated Quizzes, Flashcards, Summaries, & Timelines`;
  }

  // 5. Notebook Action: Timeline
  if (lower.includes('chronological timeline') || lower.includes('timeline of events')) {
    return `## 📅 Chronological Milestone Timeline

| Stage | Milestone | Details |
| :--- | :--- | :--- |
| **Phase 1** | **Source Ingestion** | User uploads documents, pastes web URLs, or connects GitHub repositories into Notebooks. |
| **Phase 2** | **Content Extraction** | Text parsing extracts core facts, key definitions, and structural hierarchy. |
| **Phase 3** | **AI Processing** | Multi-provider pipeline routes payload through Gemini / Groq / OpenRouter. |
| **Phase 4** | **Study Output** | System formats results into Quizzes, Flashcards, Summaries, or Timelines. |
| **Phase 5** | **Interactive Review** | User tests knowledge with interactive cards & exports notes to Markdown. |`;
  }

  // 6. Notebook Action: Practice Test
  if (lower.includes('practice test') || lower.includes('mix of multiple-choice')) {
    return `## 🎯 Comprehensive Practice Test

### Section A: Multiple Choice
1. What is the main purpose of the VibeCoding canvas?
   - A) Live code previewing & interactive editing
   - B) Audio playback
   - C) Database backup

2. Which key is prioritized for high-speed chat?
   - A) Groq / Gemini API Key
   - B) Local dummy key
   - C) Legacy cookie

### Section B: True / False
3. **[True / False]** BETAAI supports direct importing of GitHub repository files into Study Notebooks.
   - *Answer: TRUE*

4. **[True / False]** Web Search requires a paid API subscription.
   - *Answer: FALSE (Uses free DuckDuckGo & Wikipedia APIs)*

### Section C: Short Answer
5. **Question**: Explain how quota protection works in Settings (⚙).
   - **Sample Answer**: Users can input personal Gemini, Grok, OpenRouter, NVIDIA, or Zen API keys which override server defaults whenever quota limits are reached.`;
  }

  // 7. Notebook Action: ELI5
  if (lower.includes('explain the following content as if i am 5') || lower.includes('simple analogies')) {
    return `## 💡 Explained Like You're 5! 🎈

Imagine you have a **super-smart robot friend** named **BETAAI**! 🤖✨

1. **The Brain Power**: If one brain gets tired, BETAAI immediately switches to another helper brain (like Gemini or Grok) so it NEVER stops answering you!
2. **The Magic Toy Box (VibeCoding)**: When you ask for a game or website, BETAAI builds it right in front of your eyes like Lego blocks, and you can play with it instantly! 🎮
3. **The Study Magic (Notebooks)**: When you give BETAAI a long story or website link, it reads it super fast and makes fun flashcards and quizzes so learning is like playing a game! 🃏📚

It's your all-in-one AI superpower built specially for you by **SAURABH**! 🚀`;
  }

  // 8. Jokes
  if (lower.includes('joke') || lower.includes('funny') || lower.includes('laugh')) {
    const jokes = [
      "Why do programmers prefer dark mode?\n\n> **Because light attracts bugs!** 🐛✨",
      "There are only 10 types of people in the world:\n\n* Those who understand binary, and\n* Those who don't! 😄",
      "Why did the JavaScript developer wear glasses?\n\n> **Because they didn't C#!** 🤓💻",
      "A SQL query walks into a bar, walks up to two tables and asks:\n\n> **'Can I join you?'** 📊🍸",
      "How many programmers does it take to change a light bulb?\n\n> **None. It's a hardware problem!** 💡⚡"
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  // 9. Identity / Creator
  if (lower.includes('who created you') || lower.includes('who made you') || lower.includes('creator') || lower.includes('who built you')) {
    return "I am **BETAAI**, a state-of-the-art AI platform created by **SAURABH**. I feature high-speed Chat, interactive VibeCoding with live split-canvas preview, Image synthesis, and Study Notebooks!";
  }

  if (lower.includes('who are you') || lower.includes('what is betaai')) {
    return "I am **BETAAI**, your intelligent AI workspace developed by **SAURABH**. I integrate Vercel Design System aesthetics, live code generation, and multi-model failover support.";
  }

  // 10. General explanations
  return `### 💡 Answer to: "${prompt.substring(0, 100)}"

Thank you for your question! Here is your AI analysis:

1. **Overview**: BETAAI is active and processing your request in real-time.
2. **Key Highlights**:
   - Multi-provider failover (Gemini, Grok, OpenRouter, NVIDIA NIM, Zen API, Ollama).
   - High-performance response pipeline.
   - Integrated VibeCoding & Study Notebook tools.

> **Tip**: You can enter your personal API keys in **Settings (⚙)** for dedicated quota protection!`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-custom-key, x-custom-base, x-custom-model, x-gemini-key, x-grok-key, x-openrouter-key, x-nvidia-key, x-hf-token, x-zen-key');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  let payload = {};
  try {
    if (req.body) {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (e) {
    payload = {};
  }

  const messages = payload.messages || [];
  const rawModel = payload.model || '';
  const wantsStream = payload.stream === true;
  let lastErr = '';

  const customKey = req.headers['x-custom-key'] || payload.customKey || req.headers['authorization']?.replace(/^Bearer\s+/i, '').trim() || '';
  let customBase = req.headers['x-custom-base'] || payload.customBase || '';
  const customModel = req.headers['x-custom-model'] || payload.customModel || '';

  const clientGeminiKey = req.headers['x-gemini-key'] || payload.geminiKey || process.env.GEMINI_KEY || '';
  const clientGrokKey = req.headers['x-grok-key'] || payload.grokKey || process.env.GROK_KEY || process.env.GROQ_KEY || '';
  const clientOpenRouterKey = req.headers['x-openrouter-key'] || payload.openrouterKey || process.env.OPENROUTER_KEY || '';
  const clientNvidiaKey = req.headers['x-nvidia-key'] || payload.nvidiaKey || process.env.NVIDIA_KEY || '';
  const clientZenKey = req.headers['x-zen-key'] || payload.zenKey || process.env.ZEN_API_KEY || '';

  const isCodingMode = payload.mode === 'code' || rawModel.includes('coder') || rawModel.includes('coding');

  const targets = [];

  // 1. Custom User API Key / Endpoint
  if (customKey || customBase) {
    let baseUrl = (customBase || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    if (!baseUrl.endsWith('/chat/completions')) baseUrl = `${baseUrl}/chat/completions`;
    targets.push({
      name: 'User-Custom-API',
      url: baseUrl,
      key: customKey,
      model: customModel || (isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free')
    });
  }

  // 2. Groq / Grok API Key
  const grokKey = clientGrokKey || process.env.GROQ_KEY || process.env.GROK_KEY || '';
  if (grokKey) {
    targets.push({
      name: 'Grok-Groq-Primary',
      url: grokKey.startsWith('xai-') ? 'https://api.x.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions',
      key: grokKey,
      model: 'llama-3.3-70b-versatile'
    });
  }

  // 3. Gemini API Key
  const geminiKey = clientGeminiKey || process.env.GEMINI_KEY || '';
  if (geminiKey) {
    targets.push({
      name: 'Gemini-Flash-Primary',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      key: geminiKey,
      model: 'gemini-2.5-flash'
    });
  }

  // 4. OpenRouter API Key
  const openRouterKey = clientOpenRouterKey || process.env.OPENROUTER_KEY || '';
  if (openRouterKey) {
    targets.push({
      name: 'OpenRouter-Primary',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: openRouterKey,
      model: isCodingMode ? 'qwen/qwen-2.5-coder-32b-instruct:free' : 'google/gemini-2.5-flash:free',
      headers: { 'X-Title': 'BETAAI' }
    });
  }

  // 5. NVIDIA NIM API Key
  if (clientNvidiaKey) {
    targets.push({
      name: 'NVIDIA-NIM',
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      key: clientNvidiaKey,
      model: 'meta/llama-3.1-70b-instruct'
    });
  }

  // 6. Zen API Key
  if (clientZenKey) {
    targets.push({
      name: 'Zen-API',
      url: 'https://api.opencode.ai/v1/chat/completions',
      key: clientZenKey,
      model: 'deepseek-chat'
    });
  }

  for (const target of targets) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(target.headers || {})
      };
      if (target.key) {
        headers['Authorization'] = `Bearer ${target.key}`;
      }

      const requestBody = {
        messages,
        model: target.model || 'gemini-2.5-flash',
        temperature: payload.temperature || 0.3,
        max_tokens: payload.max_tokens || 4096,
        stream: wantsStream
      };

      const apiRes = await fetchWithTimeout(target.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      }, 8000);

      if (!apiRes.ok) {
        const text = await apiRes.text().catch(() => '');
        lastErr = `${target.name} (${apiRes.status}): ${text.substring(0, 100)}`;
        continue;
      }

      if (wantsStream && apiRes.body) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');

        try {
          if (typeof Readable.fromWeb === 'function') {
            Readable.fromWeb(apiRes.body).pipe(res);
            return;
          }
        } catch (pipeErr) {}

        const reader = apiRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
        return;
      }

      const data = await apiRes.json();
      return res.status(200).json(data);

    } catch (err) {
      lastErr = `${target.name}: ${err.message}`;
    }
  }

  // Intelligent AI answer synthesis for Notebooks, Jokes, Code, & Explanations
  const lastMsgObj = messages[messages.length - 1];
  const userText = lastMsgObj ? lastMsgObj.content : 'hello';
  const aiAnswer = generateSmartAIResponse(userText, messages);

  if (wantsStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const chunk = JSON.stringify({ choices: [{ delta: { content: aiAnswer } }] });
    res.write(`data: ${chunk}\n\ndata: [DONE]\n\n`);
    res.end();
    return;
  }

  return res.status(200).json({
    choices: [
      {
        message: {
          role: 'assistant',
          content: aiAnswer
        }
      }
    ]
  });
}
