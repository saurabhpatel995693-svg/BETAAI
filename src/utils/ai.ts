// AI Utilities for Viblo AI
// Communicates directly with the Google Gemini developer API

export interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
  error?: {
    message?: string;
  };
}

export async function askGemini(prompt: string, apiKey: string): Promise<string> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Gemini API Key is missing. Please click the 'AI Key' button in the navbar to configure it.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const errorData: GeminiResponse = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `API request failed with status ${response.status}`;
    throw new Error(message);
  }

  const data: GeminiResponse = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response received from the Gemini model.");
  }

  return text;
}

// Prompt Templates for AI Features
export const PROMPTS = {
  explainPost: (title: string, content: string, question: string) => `
You are an expert tech explanation assistant on Viblo, a technical sharing community.
The user is reading an article titled "${title}". Here is the article content:

---
${content}
---

The user has the following question or wants the following explanation:
"${question}"

Provide a clear, helpful, and technically precise explanation. If there is code in the article, explain the code logic clearly. Keep your response formatting clean in standard Markdown.
`,
  
  suggestTagsAndTitle: (content: string) => `
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

  improveDraft: (content: string) => `
You are a professional writing assistant. Review the following article draft and output an improved version of the draft. Fix any spelling, grammatical, or structural issues. Maintain a clean, engaging technical tone. Keep formatting in Markdown.

Original Draft:
${content}
`,

  answerQuestion: (title: string, content: string) => `
You are a top contributor in a developer Q&A forum. Help answer this technical question:
Question Title: "${title}"
Question Detail:
${content}

Provide a comprehensive, accurate, and step-by-step solution. Include code blocks where helpful (use appropriate markdown syntax highlighting). Format your response cleanly in Markdown.
`
};
