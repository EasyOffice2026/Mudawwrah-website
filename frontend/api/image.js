/**
 * Serves uploaded images from the API host.
 *
 * A plain Vercel rewrite is not enough: it forwards the visitor's own
 * User-Agent, so ngrok's free tier sees a browser and answers with its HTML
 * interstitial rather than the file. An <img> tag cannot send the header that
 * skips that, but this can — it fetches server-side with the header set and
 * streams the bytes back from our own origin, which also keeps images
 * same-origin and avoids mixed-content blocking.
 *
 * The path arrives as ?file= rather than a [...catch-all] route: catch-all
 * functions matched a single segment but not nested ones like thumbs/x.jpg.
 */
const UPSTREAM = (process.env.UPSTREAM_API_URL || 'https://fabulous-immobile-dweller.ngrok-free.dev').replace(
  /\/+$/,
  '',
);

export default async function handler(request, response) {
  const raw = request.query?.file;
  const file = String(Array.isArray(raw) ? raw.join('/') : raw || '').replace(/^\/+/, '');

  // Nothing may climb out of /uploads.
  if (!file || file.includes('..')) {
    return response.status(400).json({ error: 'Bad upload path' });
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/uploads/${file}`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });

    if (!upstream.ok) return response.status(upstream.status).json({ error: 'Image not found' });

    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    // An interstitial would arrive as HTML; refuse rather than render it.
    if (!type.startsWith('image/')) {
      return response.status(502).json({ error: 'Upstream did not return an image' });
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    response.setHeader('Content-Type', type);
    response.setHeader('Content-Length', String(body.length));
    // Filenames are unique per upload, so these can cache hard.
    response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
    return response.status(200).send(body);
  } catch {
    return response.status(502).json({ error: 'Could not reach the image host' });
  }
}
