import { YoutubeTranscript } from 'youtube-transcript';

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

// Languages to try (in priority order)
const PRIORITY_LANGS = ['en', 'hi', 'ur', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'mai', 'sat', 'ks', 'ne', 'sd', 'kok', 'doi', 'mni', 'si', 'fr', 'es', 'de', 'ja', 'ko', 'zh', 'ru', 'ar', 'pt', 'it', 'nl'];

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

  // ── PRIMARY: Use youtube-transcript library (handles InnerTube API internally, no HTML scraping) ──
  let transcriptData = null;
  let transcriptSource = '';
  let transcriptLanguage = '';
  let availableLanguages = [];

  try {
    // Try #1: fetchTranscript without language restriction (let library decide)
    try {
      console.log(`[TRANSCRIPT] Trying youtube-transcript library for videoId=${videoId} (no lang specified)`);
      const result = await YoutubeTranscript.fetchTranscript(videoId);
      if (Array.isArray(result) && result.length > 0) {
        transcriptData = result.map(item => ({
          text: item.text,
          duration: item.duration || 0,
          offset: item.offset || 0
        }));
        transcriptSource = 'youtube-transcript-lib';
        transcriptLanguage = 'auto';
        console.log(`[TRANSCRIPT] youtube-transcript library OK: ${transcriptData.length} segments`);
      }
    } catch (e) {
      console.warn(`[TRANSCRIPT-DEBUG] youtube-transcript (no lang) failed: ${e.name}: ${e.message}`);
    }

    // Try #2: Try with specific languages (English first, then Hindi, then priority list)
    if (!transcriptData) {
      for (const lang of PRIORITY_LANGS) {
        if (transcriptData) break;
        try {
          console.log(`[TRANSCRIPT-DEBUG] Trying youtube-transcript with lang=${lang}`);
          const result = await YoutubeTranscript.fetchTranscript(videoId, { lang });
          if (Array.isArray(result) && result.length > 0) {
            transcriptData = result.map(item => ({
              text: item.text,
              duration: item.duration || 0,
              offset: item.offset || 0
            }));
            transcriptSource = 'youtube-transcript-lib';
            transcriptLanguage = lang;
            availableLanguages.push(lang);
            console.log(`[TRANSCRIPT] youtube-transcript OK lang=${lang}: ${transcriptData.length} segments`);
          }
        } catch (e) {
          // Library throws when lang is not available — this is expected
          console.log(`[TRANSCRIPT-DEBUG] youtube-transcript lang=${lang} not available: ${e.message.substring(0, 100)}`);
        }
      }
    }

    // Try #3: Fall back to youtubetranscript.com (alternative third-party service)
    if (!transcriptData) {
      console.log(`[TRANSCRIPT] youtube-transcript failed for all languages, falling back to youtubetranscript.com`);
      for (const lang of ['', 'en', 'hi', ...PRIORITY_LANGS]) {
        if (transcriptData) break;
        const langParam = lang ? `&lang=${lang}` : '';
        const label = lang || 'default';
        try {
          const jsonRes = await fetchWithTimeout(
            `https://youtubetranscript.com/?v=${videoId}&format=json${langParam}`,
            {}, 8000
          );
          if (jsonRes.ok) {
            const data = await jsonRes.json();
            if (Array.isArray(data) && data.length > 0) {
              transcriptData = data;
              transcriptSource = `youtubetranscript-${label}`;
              transcriptLanguage = lang || 'unknown';
              console.log(`[TRANSCRIPT] youtubetranscript.com OK lang=${label}: ${transcriptData.length} segments`);
            }
          } else {
            const errBody = (await jsonRes.text().catch(() => '')).substring(0, 200);
            console.warn(`[TRANSCRIPT-DEBUG] youtubetranscript.com lang=${label} FAILED: HTTP ${jsonRes.status} ${errBody}`);
          }
        } catch (e) {
          console.warn(`[TRANSCRIPT-DEBUG] youtubetranscript.com lang=${label} fetch error: ${e.message}`);
        }
      }
    }

    // All sources exhausted
    if (!transcriptData) {
      console.error(`[TRANSCRIPT-FAIL] videoId=${videoId} — ALL transcript methods failed (youtube-transcript library + youtubetranscript.com). Video likely has no captions at all.`);
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
      source: transcriptSource,
      language: transcriptLanguage,
      availableLanguages: availableLanguages.length ? availableLanguages : undefined
    });

  } catch (err) {
    console.error(`[TRANSCRIPT-FAIL] UNEXPECTED ERROR: ${err.name}: ${err.message}`);
    return res.status(500).json({
      error: 'Transcript lene mein error aaya. Kripya dobara try karein ya topic text directly type karein.',
      errorEn: `Failed to fetch transcript: ${err.message}. Please try again or type your topic directly.`,
      videoId,
      title: videoTitle
    });
  }
}
