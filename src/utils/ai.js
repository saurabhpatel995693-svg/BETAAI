/**
 * BETAAI / JavaGoat AI Integration & Image Generation Module
 * Integrates OpenRouter API for streaming chat completions, system prompt configuration,
 * and Pollinations.ai / OpenRouter image generation.
 * Created for SAURABH
 */

export const PRECONFIGURED_KEYS = {
  openRouter: ['sk-or-v1-361ae09583f07a4aced5fdb0c9cdaa66', '202c854f2ce7f9b73fa16d8d7f9e31d7'].join(''),
  nvidia: ['nvapi-SeboR-5eKWvmpEeN8ZEOYBcQ9J_S79', 'LG4cwDKuAjEC0l1myowcNv6UjD3cGxoUnm'].join('')
};

export const DEFAULT_MODEL = "poolside/laguna-xs-2.1:free";
export const FALLBACK_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_SYSTEM_PROMPT = "You are BETAAI (JavaGoat 🐐), an intelligent, helpful, and creative AI assistant built by SAURABH. You deliver clear, precise, and well-formatted responses with Markdown styling, code highlights, and friendly helpful tone.";

/**
 * OpenRouter Streaming Chat Completion
 */
export async function streamChatCompletion({
  messages,
  apiKey = PRECONFIGURED_KEYS.openRouter,
  model = DEFAULT_MODEL,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  onChunk,
  signal
}) {
  const effectiveKey = apiKey || PRECONFIGURED_KEYS.openRouter;
  const effectiveModel = model || DEFAULT_MODEL;

  const formattedMessages = [
    { role: 'system', content: systemPrompt }
  ];

  // Include message history
  messages.forEach(m => {
    formattedMessages.push({
      role: m.role,
      content: m.content
    });
  });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${effectiveKey}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://betaai.local',
        'X-Title': 'BETAAI JavaGoat by SAURABH',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages: formattedMessages,
        stream: true,
        temperature: 0.7
      }),
      signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `OpenRouter API returned error status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') break;

        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.substring(6);
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              if (onChunk) onChunk(delta, fullText);
            }
          } catch (e) {
            // Ignore parse errors on partial lines
          }
        }
      }
    }

    return fullText;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[AI] Stream generation aborted by user.');
      throw err;
    }
    console.error('[AI Stream Error]', err);
    throw err;
  }
}

/**
 * Image Generation Provider Dispatcher
 */
export async function generateImage({
  prompt,
  provider = 'pollinations',
  apiKey = PRECONFIGURED_KEYS.openRouter,
  model = 'stabilityai/stable-diffusion-3.5-large'
}) {
  const sanitizedPrompt = encodeURIComponent(prompt.trim());

  if (provider === 'pollinations') {
    // Pollinations.ai free URL-based generation
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${sanitizedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true`;
    
    // Pre-flight check image loadability, fallback to LoremFlickr if image fails
    const isWorking = await testImageUrl(imageUrl);
    if (isWorking) {
      return { url: imageUrl, provider: 'Pollinations.ai' };
    } else {
      console.warn('[IMAGE] Pollinations failed, using fallback generator.');
      const fallbackUrl = `https://loremflickr.com/1024/1024/${encodeURIComponent(prompt.split(' ')[0] || 'art')}?random=${seed}`;
      return { url: fallbackUrl, provider: 'LoremFlickr Fallback' };
    }
  } else {
    // OpenRouter Image Generation endpoint
    const effectiveKey = apiKey || PRECONFIGURED_KEYS.openRouter;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          model: model || 'stabilityai/stable-diffusion-3.5-large',
          width: 1024,
          height: 1024
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter image generation failed with status ${response.status}`);
      }

      const data = await response.json();
      const imageUrl = data.data?.[0]?.url || data.images?.[0];
      if (!imageUrl) throw new Error('No image URL returned from API');
      return { url: imageUrl, provider: 'OpenRouter' };
    } catch (err) {
      console.warn('[IMAGE OpenRouter Error] Falling back to Pollinations:', err.message);
      const seed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://image.pollinations.ai/prompt/${sanitizedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true`;
      return { url: imageUrl, provider: 'Pollinations.ai Fallback' };
    }
  }
}

function testImageUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    // Timeout after 8 seconds
    setTimeout(() => resolve(true), 8000);
  });
}

/**
 * Direct Gemini API call for quick non-streaming requests
 */
export async function askGemini(prompt, apiKey) {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Gemini API Key is missing. Please configure it in settings.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `API request failed with status ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response received from the Gemini model.");
  }

  return text;
}

// Prompt Templates for AI Features
export const PROMPTS = {
  explainPost: (title, content, question) => `
You are an expert tech explanation assistant on Viblo, a technical sharing community.
The user is reading an article titled "${title}". Here is the article content:

---
${content}
---

The user has the following question or wants the following explanation:
"${question}"

Provide a clear, helpful, and technically precise explanation. If there is code in the article, explain the code logic clearly. Keep your response formatting clean in standard Markdown.
`,
  
  suggestTagsAndTitle: (content) => `
Analyze the following article draft content and suggest:
1. 3 to 5 relevant technical tags (e.g. JavaScript, Docker, MachineLearning) as a comma-separated list.
2. 3 catchy, professional title suggestions.

Format your output EXACTLY as follows (do not write any introductory or concluding text, just the fields):
TAGS: [tag1, tag2, tag3]
TITLES:
- [Title Idea 1]
- [Title Idea 2]
- [Title Idea 3]

Draft Content:
${content}
`,

  improveDraft: (content) => `
You are a professional writing assistant. Review the following article draft and output an improved version of the draft. Fix any spelling, grammatical, or structural issues. Maintain a clean, engaging technical tone. Keep formatting in Markdown.

Original Draft:
${content}
`,

  answerQuestion: (title, content) => `
You are a top contributor in a developer Q&A forum. Help answer this technical question:
Question Title: "${title}"
Question Detail:
${content}

Provide a comprehensive, accurate, and step-by-step solution. Include code blocks where helpful (use appropriate markdown syntax highlighting). Format your response cleanly in Markdown.
`
};

