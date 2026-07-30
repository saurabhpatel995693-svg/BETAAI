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

  // ── Helper: extract available caption tracks from YouTube page ──
  function extractAvailableTracks(pageHtml) {
    // Try ytInitialPlayerResponse JSON
    const playerMatch = pageHtml.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:<\/script|\n)/);
    if (playerMatch) {
      try {
        const data = JSON.parse(playerMatch[1]);
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length) {
          return tracks.map(t => ({
            languageCode: t.languageCode,
            languageName: t.name?.simpleText || t.languageCode,
            baseUrl: t.baseUrl,
            isTranslatable: t.isTranslatable || false
          }));
        }
      } catch (e) { /* fall through */ }
    }

    // Fallback: try ytInitialData JSON
    const initMatch = pageHtml.match(/ytInitialData\s*=\s*({.+?});\s*(?:<\/script|\n)/);
    if (initMatch) {
      try {
        const data = JSON.parse(initMatch[1]);
        const tracks = data?.playerOverlays?.playerOverlayRenderer?.captionsPlayerOverlayRenderer?.captionTracks ||
                       data?.engagementPanels?.[0]?.engagementPanelSectionListRenderer?.content?.structuredDescriptionContentRenderer?.items?.[1]?.videoDescriptionHeaderRenderer?.captionTracks;
        if (tracks?.length) {
          return tracks.map(t => ({
            languageCode: t.languageCode,
            languageName: t.name?.simpleText || t.languageCode,
            baseUrl: t.baseUrl,
            isTranslatable: t.isTranslatable || false
          }));
        }
      } catch (e) { /* fall through */ }
    }

    return null;
  }

  // ── Helper: fetch YouTube captions directly via timedtext API ──
  // Accepts a track object so we can try ANY language.
  async function fetchTranscriptFromTrack(track) {
    if (!track?.baseUrl) return null;

    // Strip any existing `lang` or `tlang` param so we use the track's native language
    let url = track.baseUrl;
    url = url.replace(/[?&](lang|tlang)=[^&]+/g, '');
    url += (url.includes('?') ? '&' : '?') + 'format=json';

    const captionRes = await fetchWithTimeout(url, {}, 8000);
    if (!captionRes.ok) return null;

    const captionJson = await captionRes.json();
    const events = captionJson?.events || [];
    if (!events.length) return null;

    const segments = [];
    for (const ev of events) {
      const text = (ev.segs || [])
        .map(s => (s.utf8 || '').replace(/[\n\r]+/g, ' ').trim())
        .filter(Boolean)
        .join(' ');
      if (text) {
        segments.push({
          text,
          offset: (ev.tStartMs || 0) / 1000,
          duration: (ev.dDurationMs || 0) / 1000
        });
      }
    }
    return segments.length > 0 ? segments : null;
  }

  // ── Helper: fetch available tracks from YouTube page, then try each ──
  async function fetchYouTubeTracks(videoId) {
    const pageRes = await fetchWithTimeout(
      `https://www.youtube.com/watch?v=${videoId}`,
      { headers: { 'Accept-Language': 'en,hi;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible; SHESHAAI/1.0)' } },
      8000
    );
    if (!pageRes.ok) return null;
    const pageHtml = await pageRes.text();
    return extractAvailableTracks(pageHtml);
  }

  // ── Languages to try on youtubetranscript.com (in priority order) ──
  const YT_TRANSCRIPT_PRIORITY_LANGS = ['en', 'hi', 'ur', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'mai', 'sat', 'ks', 'ne', 'sd', 'kok', 'doi', 'mni', 'si', 'fr', 'es', 'de', 'ja', 'ko', 'zh', 'ru', 'ar', 'pt', 'it', 'nl'];

  // ── Helper: try youtubetranscript.com with a specific language ──
  async function fetchYTTranscriptWithLang(videoId, lang) {
    // JSON endpoint
    const jsonRes = await fetchWithTimeout(
      `https://youtubetranscript.com/?v=${videoId}&format=json${lang ? `&lang=${lang}` : ''}`,
      {}, 8000
    );
    if (jsonRes.ok) {
      const data = await jsonRes.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }

    // HTML endpoint as fallback
    const htmlRes = await fetchWithTimeout(
      `https://youtubetranscript.com/?v=${videoId}${lang ? `&lang=${lang}` : ''}`,
      {}, 8000
    );
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const parsed = parseYoutubeTranscriptHTML(html);
      if (parsed) return parsed;
    }

    return null;
  }

  // ── STEP 1: Get available caption tracks (language list) from YouTube ──
  let availableTracks = null;
  try {
    availableTracks = await fetchYouTubeTracks(videoId);
  } catch (e) {
    console.warn('[TRANSCRIPT] Could not fetch available tracks:', e.message);
  }

  const availableLanguages = availableTracks ? availableTracks.map(t => t.languageCode) : [];

  // Build the language priority list: available languages first (preserving order),
  // then priority fallbacks for any we missed
  const languageCandidates = [];
  const seen = new Set();

  // First, add all available languages (from YouTube page, in the order YouTube returned them)
  if (availableLanguages.length) {
    for (const lang of availableLanguages) {
      if (!seen.has(lang)) {
        languageCandidates.push(lang);
        seen.add(lang);
      }
    }
  }

  // Then add priority languages that weren't already in available list
  for (const lang of YT_TRANSCRIPT_PRIORITY_LANGS) {
    if (!seen.has(lang)) {
      languageCandidates.push(lang);
      seen.add(lang);
    }
  }

  // Also try without any language param (let youtubetranscript.com decide)
  languageCandidates.unshift('');

  // ── STEP 2: Try each language via youtubetranscript.com ──
  let transcriptData = null;
  let transcriptSource = '';
  let transcriptLanguage = '';

  try {
    for (const lang of languageCandidates) {
      if (transcriptData) break;
      const label = lang || 'default';
      try {
        const data = await fetchYTTranscriptWithLang(videoId, lang);
        if (data) {
          transcriptData = data;
          transcriptSource = `youtubetranscript-${lang || 'default'}`;
          transcriptLanguage = lang || 'unknown';
          console.log(`[TRANSCRIPT] Found transcript via youtubetranscript.com lang=${label}`);
        }
      } catch (e) {
        console.warn(`[TRANSCRIPT] youtubetranscript lang=${label} failed:`, e.message);
      }
    }

    // ── STEP 3: If youtubetranscript.com didn't work, try direct YouTube timedtext API ──
    if (!transcriptData && availableTracks?.length) {
      for (const track of availableTracks) {
        if (transcriptData) break;
        try {
          const data = await fetchTranscriptFromTrack(track);
          if (data) {
            transcriptData = data;
            transcriptSource = 'youtube-timedtext';
            transcriptLanguage = track.languageCode || 'unknown';
            console.log(`[TRANSCRIPT] Found transcript via timedtext lang=${track.languageCode}`);
          }
        } catch (e) {
          console.warn(`[TRANSCRIPT] timedtext lang=${track.languageCode} failed:`, e.message);
        }
      }
    }

    // All transcript sources exhausted
    if (!transcriptData) {
      const availableMsg = availableLanguages.length
        ? `Available languages: ${availableLanguages.join(', ')}`
        : 'Could not detect available languages.';
      return res.status(404).json({
        error: `Is video me captions available nahi hain. ${availableLanguages.length ? `Yeh languages available hain: ${availableLanguages.join(', ')} — lekin inme se kisi ka transcript nahi mil paaya.` : 'YouTube ne is video ke liye captions disable kar diye hain.'} Kripya koi doosra video try karein jisme captions hon, ya topic/text directly type karein.`,
        errorEn: `No transcript could be fetched for this video. ${availableMsg} Please try a different video that has captions, or type your topic/text directly.`,
        videoId,
        title: videoTitle,
        availableLanguages
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
      availableLanguages
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
