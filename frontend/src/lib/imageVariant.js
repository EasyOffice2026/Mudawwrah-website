/**
 * Menu pictures at the size they are shown.
 *
 * An uploaded photo is often 4-5 MB, far too heavy for a phone on mobile data. The server makes small
 * WebP copies on demand (see backend/src/services/imageVariants.js): /uploads/w400/<name>.webp for the
 * square grid picture and /uploads/w900/<name>.webp for the big picture on a dish's page. Anything
 * that is not one of our uploads (a picture hosted elsewhere) is left exactly as it is.
 */
const MARK = '/uploads/';

export const variantUrl = (url, size) => {
  if (!url || typeof url !== 'string') return url;
  const at = url.indexOf(MARK);
  if (at === -1) return url;
  const file = url.slice(at + MARK.length).split('?')[0];
  const base = file.split('/').pop().replace(/[.][^.]*$/, '');
  if (!base) return url;
  return `${url.slice(0, at)}${MARK}${size}/${base}.webp`;
};

const PLACEHOLDER = '/placeholder.svg';

/** The picture of a menu item as shown in a list or grid. */
export const gridPicture = (image) => {
  const original = image?.url || image?.thumbnailUrl;
  return original ? variantUrl(original, 'w400') : PLACEHOLDER;
};

/** The big picture on a dish's own page. */
export const dishPicture = (image) => {
  const original = image?.url || image?.thumbnailUrl;
  return original ? variantUrl(original, 'w900') : PLACEHOLDER;
};

/** What to show if the made-to-size copy cannot be loaded: the picture as it was uploaded. */
export const originalPicture = (image) => image?.thumbnailUrl || image?.url || PLACEHOLDER;

/** onError handler: switch to `fallback` once, never loop. */
export const fallbackOnError = (fallback) => (event) => {
  const img = event.currentTarget;
  if (fallback && img.getAttribute('src') !== fallback) img.setAttribute('src', fallback);
};
