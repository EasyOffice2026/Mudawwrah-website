/**
 * The restaurant's logo, made fit for a thermal receipt printer.
 *
 * A logo made for screens is usually light lettering on a coloured background (Mudawarah's is cream on dark red).
 * A thermal printer only has black, so that prints as a solid black block with the lettering lost in it, and burns
 * a hand's width of paper. Here the logo is turned into black lettering on white: whatever differs from the
 * background colour becomes ink, and the empty margin around it is cropped.
 */

const MAX_SIDE = 480;
// How far (0-255 brightness) a pixel must be from the background to count as part of the logo, and the range over
// which it fades from nothing to full black (keeps the edges smooth instead of jagged).
const INK_FROM = 40;
const INK_SPAN = 70;
const PAD = 6;

const brightness = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

/** The background's brightness: the median of the outermost ring of pixels. */
const backgroundOf = (data, width, height) => {
  const values = [];
  const at = (x, y) => {
    const i = (y * width + x) * 4;
    values.push(data[i + 3] < 128 ? 255 : brightness(data, i));
  };
  for (let x = 0; x < width; x += 1) {
    at(x, 0);
    at(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    at(0, y);
    at(width - 1, y);
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};

/**
 * RGBA pixels in, black-on-white RGBA pixels out, cropped to the logo: { data, width, height }.
 * null when nothing stands out from the background (a blank picture), so the receipt shows the name instead.
 */
export const toThermal = (data, width, height) => {
  const background = backgroundOf(data, width, height);
  const ink = new Float32Array(width * height);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const value = data[i + 3] < 128 ? 255 : brightness(data, i);
      const amount = Math.min(1, Math.max(0, (Math.abs(value - background) - INK_FROM) / INK_SPAN));
      ink[y * width + x] = amount;
      if (amount > 0.5) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;

  left = Math.max(0, left - PAD);
  top = Math.max(0, top - PAD);
  right = Math.min(width - 1, right + PAD);
  bottom = Math.min(height - 1, bottom + PAD);
  const outWidth = right - left + 1;
  const outHeight = bottom - top + 1;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const level = Math.round(255 * (1 - ink[(top + y) * width + (left + x)]));
      const o = (y * outWidth + x) * 4;
      out[o] = level;
      out[o + 1] = level;
      out[o + 2] = level;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: outWidth, height: outHeight };
};

const ready = new Map();

/**
 * Uploaded pictures are served under /uploads on every address of the site (vercel.json), so the logo is read
 * from the page's own address: www.madawarah.com, madawarah.com and a restaurant's own domain all count as one
 * site with the page, and the browser lets the page read the picture's pixels.
 */
export const sameSiteUrl = (url, origin) => {
  try {
    const parsed = new URL(url, origin);
    return parsed.pathname.startsWith('/uploads/') ? `${origin}${parsed.pathname}` : parsed.href;
  } catch {
    return url;
  }
};

/** Loads a picture whose pixels this page may read; null when it does not load (or another site forbids it). */
const loadReadable = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const convert = (img) => {
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, width, height);
    const result = toThermal(context.getImageData(0, 0, width, height).data, width, height);
    if (!result) return null;
    canvas.width = result.width;
    canvas.height = result.height;
    context.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

/**
 * The printable logo for a picture address, as an image address (data: URL), made once per page. Resolves to null
 * when it cannot be made: no logo, a picture that does not load, or one from another site that the browser will
 * not let a page read. The receipt then prints the restaurant's name alone.
 */
export const thermalLogo = (url) => {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  if (!ready.has(url)) {
    const local = sameSiteUrl(url, window.location.origin);
    ready.set(
      url,
      // The original address too, when the page's own has no copy (a staging site shows the live pictures).
      loadReadable(local)
        .then((img) => img || (local !== url ? loadReadable(url) : null))
        .then((img) => (img ? convert(img) : null)),
    );
  }
  return ready.get(url);
};
