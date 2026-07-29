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

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let query = '';
  if (req.method === 'GET') {
    query = req.query.q || req.query.query || '';
  } else {
    let payload = {};
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch(e) {}
    query = payload.query || payload.q || '';
  }

  query = (query || '').trim();
  if (!query) {
    return res.status(400).json({ error: { message: 'Search query is required' } });
  }

  // 1. Tavily Real-Time Web Search API
  const tavilyKey = process.env.TAVILY_API_KEY || '';
  if (tavilyKey) {
    try {
      const tavilyRes = await fetchWithTimeout('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: query,
          search_depth: 'basic',
          include_answer: true,
          max_results: 6
        })
      }, 8000);

      if (tavilyRes.ok) {
        const data = await tavilyRes.json();
        if (data.results && data.results.length > 0) {
          let formattedText = '';
          if (data.answer) {
            formattedText += `[Direct Answer Summary]\n${data.answer}\n\n`;
          }
          formattedText += `[Live Web Search Results]\n`;
          data.results.forEach((r, idx) => {
            formattedText += `### ${idx + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.content}\n\n`;
          });
          return res.status(200).json({
            provider: 'Tavily',
            query,
            formattedText,
            answer: data.answer || '',
            results: data.results
          });
        }
      }
    } catch(e) {
      console.warn('[SEARCH] Tavily failed:', e.message);
    }
  }

  // 2. Serper Google Search API
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const serperRes = await fetchWithTimeout('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey },
        body: JSON.stringify({ q: query })
      }, 8000);

      if (serperRes.ok) {
        const data = await serperRes.json();
        if (data.organic && data.organic.length > 0) {
          let formattedText = `[Google Live Web Search Results via Serper]\n`;
          data.organic.slice(0, 6).forEach((r, idx) => {
            formattedText += `### ${idx + 1}. ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n\n`;
          });
          return res.status(200).json({
            provider: 'Serper',
            query,
            formattedText,
            results: data.organic
          });
        }
      }
    } catch(e) {
      console.warn('[SEARCH] Serper failed:', e.message);
    }
  }

  // 3. Fallback: DuckDuckGo + Wikipedia Server-Side Fetch
  let formattedText = '';
  try {
    const cleanQ = encodeURIComponent(query);
    const ddgRes = await fetchWithTimeout(`https://api.duckduckgo.com/?q=${cleanQ}&format=json&no_html=1&skip_disambig=1`, {}, 6000);
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.AbstractText) {
        formattedText += `[Live Abstract]\nHeading: ${ddgData.Heading}\nSummary: ${ddgData.AbstractText}\nURL: ${ddgData.AbstractURL}\n\n`;
      }
      if (ddgData.RelatedTopics && ddgData.RelatedTopics.length > 0) {
        formattedText += `[Related Topics]\n`;
        ddgData.RelatedTopics.slice(0, 5).forEach(t => {
          if (t.Text && t.FirstURL) formattedText += `- ${t.Text} (URL: ${t.FirstURL})\n`;
        });
      }
    }

    const wikiRes = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${cleanQ}`, {}, 6000);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      if (wikiData.extract) {
        formattedText += `\n[Live Knowledge Base]\nTitle: ${wikiData.title}\nExtract: ${wikiData.extract}\nURL: ${wikiData.content_urls?.desktop?.page || ''}\n`;
      }
    }
  } catch(e) {
    console.warn('[SEARCH] Fallback search failed:', e.message);
  }

  if (!formattedText.trim()) {
    formattedText = `[Search Query: ${query}]\nLive web intelligence requested for "${query}".`;
  }

  return res.status(200).json({
    provider: 'Fallback Engine',
    query,
    formattedText
  });
}
