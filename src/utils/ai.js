/**
 * SHESHAAI AI Integration & Image Generation Module
 * Integrates OpenRouter API for streaming chat completions, system prompt configuration,
 * and Pollinations.ai image generation.
 * Created for SAURABH
 */

export const PRECONFIGURED_KEYS = {
  gemini: process.env.GEMINI_KEY || ''
};

export const DEFAULT_MODEL = "gemini-flash-latest";
export const FALLBACK_MODEL = "gemini-flash-latest";
export const DEFAULT_SYSTEM_PROMPT = "You are SHESHAAI, an intelligent, helpful, and creative AI assistant built by SAURABH. You deliver clear, precise, and well-formatted responses with Markdown styling, code highlights, and friendly helpful tone.";

/**
 * Image Generation Provider Dispatcher
 */
export async function generateImage({
  prompt,
  provider = 'pollinations'
}) {
  const sanitizedPrompt = encodeURIComponent(prompt.trim());
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `https://image.pollinations.ai/prompt/${sanitizedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true`;
  
  const isWorking = await testImageUrl(imageUrl);
  if (isWorking) {
    return { url: imageUrl, provider: 'Pollinations.ai' };
  } else {
    console.warn('[IMAGE] Pollinations failed, using fallback generator.');
    const fallbackUrl = `https://loremflickr.com/1024/1024/${encodeURIComponent(prompt.split(' ')[0] || 'art')}?random=${seed}`;
    return { url: fallbackUrl, provider: 'LoremFlickr Fallback' };
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

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

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

