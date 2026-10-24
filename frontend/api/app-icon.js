/**
 * /app-icon/192.png (also 180 and 512): the restaurant's home-screen icon, drawn by the API from its logo and
 * brand colour and passed on from the website's own address, like the manifest that points at it.
 */
const UPSTREAM = (process.env.UPSTREAM_API_URL || 'https://mudawwrah-website.onrender.com').replace(/\/+$/, '');
const SIZES = [180, 192, 512];

export default async function handler(request, response) {
  const size = parseInt(request.query?.size, 10);
  if (!SIZES.includes(size)) return response.status(400).json({ error: 'Bad icon size' });
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(':')[0];
  try {
    const upstream = await fetch(`${UPSTREAM}/api/tenants/icon?size=${size}`, { headers: { 'X-Storefront-Host': host } });
    if (!upstream.ok) return response.status(upstream.status).end();
    const body = Buffer.from(await upstream.arrayBuffer());
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', String(body.length));
    response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return response.status(200).send(body);
  } catch {
    return response.status(502).json({ error: 'Could not reach the icon source' });
  }
}
