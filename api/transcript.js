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

  // Fetch transcript from youtubetranscript.com
  try {
    const transcriptRes = await fetchWithTimeout(
      `https://youtubetranscript.com/?v=${videoId}&format=json`,
      {}, 10000
    );

    if (!transcriptRes.ok) {
      return res.status(404).json({
        error: 'No transcript available for this video. It may have auto-captions disabled.',
        videoId,
        title: videoTitle
      });
    }

    const transcriptData = await transcriptRes.json();
    
    if (!transcriptData || !Array.isArray(transcriptData) || transcriptData.length === 0) {
      return res.status(404).json({
        error: 'Transcript is empty for this video.',
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
      length: fullText.length
    });

  } catch (err) {
    return res.status(500).json({
      error: `Failed to fetch transcript: ${err.message}`,
      videoId,
      title: videoTitle
    });
  }
}
