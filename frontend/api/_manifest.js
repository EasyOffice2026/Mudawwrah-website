/**
 * The web app manifest for a restaurant: what its name, colours and icon are when a customer puts the website on their
 * phone's home screen. (A file starting with an underscore is not served as a function by Vercel; manifest.js uses it.)
 */
const COLOUR = /^#[0-9a-fA-F]{6}$/;

// The name under the icon has room for about 12 characters; cut at a word, never in the middle of one.
export const shortName = (name) => {
  const text = String(name || '').trim();
  if (text.length <= 12) return text;
  let out = '';
  for (const word of text.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > 12) break;
    out = next;
  }
  return out || text.slice(0, 12);
};

export const buildManifest = (tenant) => {
  const slug = tenant?.slug;
  const name = tenant?.nameEn || 'Order online';
  return {
    id: slug ? `/r/${slug}` : '/',
    name,
    short_name: shortName(name),
    description: tenant?.taglineEn || `Order from ${name}`,
    // Opens on the restaurant's menu, not the platform page, and says it was opened from the installed app.
    start_url: slug ? `/r/${slug}?source=app` : '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: COLOUR.test(tenant?.brandColor || '') ? tenant.brandColor : '#B00020',
    lang: 'en',
    // The icon is drawn with margin all round, so the same picture is safe where a phone crops it to a circle.
    icons: [
      { src: '/app-icon/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icon/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
};
