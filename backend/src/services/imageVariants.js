import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';

/**
 * Right-sized copies of an uploaded picture, made the first time they are asked for.
 *
 * An upload is kept as it was sent (often a 4-5 MB phone photo), which is far too heavy for a menu
 * on a phone. The storefront asks for /uploads/w400/<name>.webp (the square grid picture) or
 * /uploads/w900/<name>.webp (the big picture on a dish's page); each is made from the original on
 * the first request, saved next to it, and served from there afterwards. Nothing has to be
 * converted by hand, and an upload made tomorrow is covered the same way.
 */
export const VARIANTS = {
  w400: { width: 400, height: 400, fit: 'cover', quality: 72 },
  w900: { width: 900, fit: 'inside', quality: 78 },
};

const SOURCE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
// A bare file name: no dots, no slashes, so nothing can point outside the uploads folder.
const SAFE_BASE = /^[A-Za-z0-9_-]+$/;

const uploadDir = () => path.resolve(config.uploadDir);

const findSource = async (base) => {
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = path.join(uploadDir(), `${base}${extension}`);
    try {
      await fsp.access(candidate);
      return candidate;
    } catch {
      // not this extension
    }
  }
  return null;
};

// One picture is resized at a time: decoding a large photo takes a lot of memory on a small
// server, and the same picture asked for twice at once is made once.
let queue = Promise.resolve();
const inflight = new Map();

const generate = (size, base, target) => {
  const key = `${size}/${base}`;
  if (inflight.has(key)) return inflight.get(key);
  const work = queue
    .catch(() => {})
    .then(async () => {
      const source = await findSource(base);
      if (!source) return false;
      const spec = VARIANTS[size];
      await fsp.mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.tmp`;
      await sharp(source)
        .rotate()
        .resize({ width: spec.width, height: spec.height, fit: spec.fit, withoutEnlargement: true })
        .webp({ quality: spec.quality })
        .toFile(temp);
      await fsp.rename(temp, target);
      return true;
    });
  queue = work;
  const done = () => inflight.delete(key);
  work.then(done, done);
  inflight.set(key, work);
  return work;
};

/** GET /uploads/:size/:name — a made-to-size copy; anything else falls through to the plain files. */
export const serveVariant = async (req, res, next) => {
  const { size, name } = req.params;
  if (!VARIANTS[size]) return next();
  const parsed = path.parse(String(name));
  if (parsed.ext.toLowerCase() !== '.webp' || !SAFE_BASE.test(parsed.name)) return next();

  const target = path.join(uploadDir(), size, `${parsed.name}.webp`);
  try {
    if (!fs.existsSync(target) && !(await generate(size, parsed.name, target))) return next();
    // The file name is unique to the upload, so the copy never changes: cache it for good.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('image/webp');
    return res.sendFile(target);
  } catch (error) {
    console.error('[images] could not make', `${size}/${parsed.name}`, error.message);
    return next();
  }
};
