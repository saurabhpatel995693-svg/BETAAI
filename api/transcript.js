export const config = {
  api: {
    bodyParser: true,
  },
};

async function fetchWithTimeout(url, options, timeoutMs = 10000) {
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

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let videoUrl = '';
  if (req.method === 'GET') {
    videoUrl = req.query.url || req.query.v || '';
  } else {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      videoUrl = payload.url || payload.videoUrl || '';
    } catch(e) {}
  }

  videoUrl = (videoUrl || '').trim();
  if (!videoUrl) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return res.status(400).json({ error: 'Could not extract video ID from the URL' });
  }

  // Try fetching video metadata (title, description) from oEmbed
  let videoTitle = '';
  let videoDescription = '';
  try {
    const oembedRes = await fetchWithTimeout(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {}, 6000);
    if (oembedRes.ok) {
      const meta = await oembedRes.json();
      videoTitle = meta.title || '';
      videoDescription = meta.author_name ? `By ${meta.author_name}` : '';
    }
  } catch (e) {
    console.warn('[TRANSCRIPT] oEmbed failed:', e.message);
  }

  // ── Helper: parse youtubetranscript.com raw HTML response ──
  function parseYoutubeTranscriptHTML(html) {
    // The youtubetranscript.com HTML endpoint returns a page with <text> elements
    const textMatch = html.match(/<text[^>]*>([\s\S]*?)<\/text>/gi);
    if (!textMatch) return null;
    const segments = textMatch.map(tag => {
      const text = tag.replace(/<[^>]+>/g, '').trim();
      const start = parseFloat(tag.match(/start=["']([^"']+)["']/)?.[1] || '0');
      const dur = parseFloat(tag.match(/dur=["']([^"']+)["']/)?.[1] || '0');
      return { text, offset: start, duration: dur };
    }).filter(s => s.text.length > 0);
    return segments.length > 0 ? segments : null;
  }

  // ── Helper: fetch YouTube captions directly via timedtext API ──
  async function fetchTranscriptDirect(videoId) {
    // First, get available caption tracks
    const pageRes = await fetchWithTimeout(
      `https://www.youtube.com/watch?v=${videoId}`,
      { headers: { 'Accept-Language': 'en,hi;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible; SHESHAAI/1.0)' } },
      8000
    );
    if (!pageRes.ok) return null;

    const pageHtml = await pageRes.text();

    // Try to extract caption URL from ytInitialPlayerResponse
    const playerRespMatch = pageHtml.match(/ytInitialPlayerResponse\s*=\s*({.*?});\s*</);
    if (!playerRespMatch) return null;

    let playerData;
    try {
      playerData = JSON.parse(playerRespMatch[1]);
    } catch (e) { return null; }

    const captions = playerData?.captions?.playerCaptionsTracklistRenderer;
    if (!captions?.captionTracks?.length) return null;

    // Prefer English captions, fallback to first available
    let track = captions.captionTracks.find(t => t.languageCode === 'en' || t.languageCode === 'hi');
    if (!track) track = captions.captionTracks[0];
    if (!track?.baseUrl) return null;

    // Fetch the actual transcript XML
    const captionRes = await fetchWithTimeout(track.baseUrl, {}, 8000);
    if (!captionRes.ok) return null;

    const captionXml = await captionRes.text();

    // Parse the transcript XML into segments
    const segRegex = /<text[^>]*start=["'](\d+\.?\d*)["'][^>]*dur=["'](\d+\.?\d*)["'][^>]*>([\s\S]*?)<\/text>/gi;
    const segments = [];
    let segMatch;
    while ((segMatch = segRegex.exec(captionXml)) !== null) {
      const text = segMatch[3]
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (text) {
        segments.push({
          text,
          offset: parseFloat(segMatch[1]),
          duration: parseFloat(segMatch[2])
        });
      }
    }
    return segments.length > 0 ? segments : null;
  }

  // ── PRIMARY: Fetch transcript from youtubetranscript.com (JSON endpoint) ──
  let transcriptData = null;
  let transcriptSource = '';

  try {
    // Try #1: youtubetranscript.com JSON endpoint
    try {
      const jsonRes = await fetchWithTimeout(
        `https://youtubetranscript.com/?v=${videoId}&format=json`,
        {}, 10000
      );
      if (jsonRes.ok) {
        const data = await jsonRes.json();
        if (Array.isArray(data) && data.length > 0) {
          transcriptData = data;
          transcriptSource = 'youtubetranscript-json';
        }
      }
    } catch (e) {
      console.warn('[TRANSCRIPT] youtubetranscript JSON failed:', e.message);
    }

    // Try #2: youtubetranscript.com HTML endpoint (fallback format)
    if (!transcriptData) {
      try {
        const htmlRes = await fetchWithTimeout(
          `https://youtubetranscript.com/?v=${videoId}`,
          {}, 10000
        );
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const parsed = parseYoutubeTranscriptHTML(html);
          if (parsed) {
            transcriptData = parsed;
            transcriptSource = 'youtubetranscript-html';
          }
        }
      } catch (e) {
        console.warn('[TRANSCRIPT] youtubetranscript HTML failed:', e.message);
      }
    }

    // Try #3: Direct YouTube timedtext API
    if (!transcriptData) {
      try {
        transcriptData = await fetchTranscriptDirect(videoId);
        if (transcriptData) transcriptSource = 'youtube-timedtext';
      } catch (e) {
        console.warn('[TRANSCRIPT] Direct timedtext failed:', e.message);
      }
    }

    // All transcript sources exhausted
    if (!transcriptData) {
      return res.status(404).json({
        error: 'Is video me captions available nahi hain. YouTube ne is video ke liye captions disable kar diye hain. Kripya koi doosra video try karein jisme captions hon, ya topic/text directly type karein.',
        errorEn: 'No transcript available for this video. It may have auto-captions disabled. Please try a different video that has captions, or type your topic/text directly.',
        videoId,
        title: videoTitle
      });
    }

    // Combine transcript segments into full text
    const fullText = transcriptData.map(seg => seg.text).join(' ').replace(/\s+/g, ' ').trim();
    const segments = transcriptData.map(seg => ({
      text: seg.text,
      duration: seg.duration,
      offset: seg.offset
    }));

    return res.status(200).json({
      videoId,
      title: videoTitle || `YouTube Video (${videoId})`,
      description: videoDescription,
      transcript: fullText,
      segments,
      segmentCount: segments.length,
      length: fullText.length,
      source: transcriptSource
    });

  } catch (err) {
    // Unexpected error in the entire transcript flow
    return res.status(500).json({
      error: 'Transcript lene mein error aaya. Kripya dobara try karein ya topic text directly type karein.',
      errorEn: `Failed to fetch transcript: ${err.message}. Please try again or type your topic directly.`,
      videoId,
      title: videoTitle
    });
  }
}
