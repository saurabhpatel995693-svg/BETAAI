// BETAAI Serverless Image Proxy & Resilient Generator
// Handles multi-provider failover for instant, reliable image generation.

async function fetchImageWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return { buffer, contentType };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function generateSvgFallback(prompt, width = 1024, height = 1024) {
  const colors = [
    ['#007cf0', '#00dfd8'],
    ['#7928ca', '#ff0080'],
    ['#ff4d4d', '#f9cb28'],
    ['#111827', '#374151']
  ];
  const colorPair = colors[Math.floor(Math.random() * colors.length)];
  const cleanPrompt = String(prompt).replace(/["'<>]/g, '').substring(0, 60);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${colorPair[0]}"/>
        <stop offset="100%" stop-color="${colorPair[1]}"/>
      </linearGradient>
      <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="40"/>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" fill="#0a0a0a"/>
    <circle cx="${width*0.3}" cy="${height*0.3}" r="${width*0.35}" fill="${colorPair[0]}" opacity="0.6" filter="url(#blur)"/>
    <circle cx="${width*0.7}" cy="${height*0.7}" r="${width*0.4}" fill="${colorPair[1]}" opacity="0.5" filter="url(#blur)"/>
    <rect width="${width}" height="${height}" fill="none" stroke="#2e2e2e" stroke-width="4"/>
    <g transform="translate(${width/2}, ${height/2})" text-anchor="middle">
      <circle r="48" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
      <text y="8" fill="#ffffff" font-family="system-ui, sans-serif" font-size="28" font-weight="bold">🎨</text>
      <text y="90" fill="#ffffff" font-family="system-ui, sans-serif" font-size="22" font-weight="600" opacity="0.95">${cleanPrompt}</text>
      <text y="125" fill="rgba(255,255,255,0.6)" font-family="monospace" font-size="14">BETAAI Render Engine</text>
    </g>
  </svg>`;
  return Buffer.from(svg, 'utf-8');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const query = req.method === 'POST' ? (req.body || {}) : req.query;
  const prompt = query.prompt || query.p || 'Abstract Digital Art';
  const width = parseInt(query.width || query.w) || 1024;
  const height = parseInt(query.height || query.h) || 1024;
  const seed = query.seed || Math.floor(Math.random() * 1000000);

  const cleanPrompt = encodeURIComponent(prompt);
  const targets = [
    `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`,
    `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux`,
    `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&model=turbo`,
    `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&seed=${seed}&model=artistic`
  ];

  for (const targetUrl of targets) {
    try {
      const { buffer, contentType } = await fetchImageWithTimeout(targetUrl, 12000);
      if (buffer && buffer.byteLength > 1000) {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.status(200).send(Buffer.from(buffer));
      }
    } catch (e) {
      console.warn(`[Image Proxy] Failed ${targetUrl}:`, e.message);
    }
  }

  // Final guaranteed fallback (SVG)
  const svgBuffer = generateSvgFallback(prompt, width, height);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-cache');
  return res.status(200).send(svgBuffer);
}
