/**
 * /manifest.webmanifest, made for whichever restaurant's address the visitor is on (www.madawarah.com is Mudawarah,
 * khobztmaraei.com is Khobzt Marie). It has to come from the website's own address, not from the API's, because a
 * phone only accepts an app whose start address is on the same site as its manifest.
 */
import { buildManifest } from './_manifest.js';

const UPSTREAM = (process.env.UPSTREAM_API_URL || 'https://mudawwrah-website.onrender.com').replace(/\/+$/, '');

export default async function handler(request, response) {
  const host = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(':')[0];
  let tenant = null;
  try {
    const res = await fetch(`${UPSTREAM}/api/tenants/current`, { headers: { 'X-Storefront-Host': host } });
    if (res.ok) tenant = await res.json();
  } catch {
    // The platform's own manifest is better than none.
  }
  response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return response.status(200).send(JSON.stringify(buildManifest(tenant)));
}
