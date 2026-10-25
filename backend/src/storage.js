import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { config } from './config.js';
import { HttpError } from './middleware/error.js';

// Cloudinary configures itself from CLOUDINARY_URL. Without it we fall back to
// local disk so `npm run dev` works with no cloud account.
export const driver = process.env.CLOUDINARY_URL ? 'cloudinary' : 'local';

if (driver === 'cloudinary') cloudinary.config({ secure: true });

// The picture formats a menu needs, by what the file really is, never by its name or the type the browser
// declared: both are chosen by whoever uploads. An SVG (or HTML) named "photo.png" would otherwise be stored and
// served from the restaurant's own site, where its script could read a signed-in owner's session.
const EXTENSIONS = { jpeg: '.jpg', png: '.png', webp: '.webp', gif: '.gif' };

export const imageExtension = async (buffer) => {
  let meta = {};
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    meta = {};
  }
  // AVIF reports as "heif"; so does an iPhone HEIC photo, which browsers cannot show.
  const ext = meta.format === 'heif' && meta.compression === 'av1' ? '.avif' : EXTENSIONS[meta.format];
  if (!ext) throw new HttpError(400, 'Please upload a JPG, PNG, WebP, GIF or AVIF picture.');
  return ext;
};

const randomName = (ext) => `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;

// Cloudinary resizes on delivery, so the thumbnail is just a transformed URL.
const cloudinaryThumb = (url) => url.replace('/upload/', '/upload/c_fill,w_400,h_400,q_auto,f_auto/');

const uploadToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image' }, (error, result) =>
      error ? reject(error) : resolve(result),
    );
    stream.end(buffer);
  });

/**
 * Stores an image and returns { filename, url, thumbnailUrl }.
 * `filename` doubles as the storage key passed back to destroy().
 */
// The uploaded file's own name is not used: what the file really is decides how it is stored.
export const put = async (buffer, { folder = 'mdawra' } = {}) => {
  const ext = await imageExtension(buffer);
  if (driver === 'cloudinary') {
    const result = await uploadToCloudinary(buffer, folder);
    return {
      filename: result.public_id,
      url: result.secure_url,
      thumbnailUrl: cloudinaryThumb(result.secure_url),
    };
  }

  const filename = randomName(ext);
  await fs.mkdir(path.join(config.uploadDir, 'thumbs'), { recursive: true });
  await fs.writeFile(path.join(config.uploadDir, filename), buffer);

  const publicUrlFor = (relativePath) => `${config.publicUrl}/uploads/${relativePath}`;
  let thumbnailUrl = null;
  try {
    await sharp(buffer)
      .resize(400, 400, { fit: 'cover' })
      .toFile(path.join(config.uploadDir, 'thumbs', filename));
    thumbnailUrl = publicUrlFor(`thumbs/${filename}`);
  } catch {
    thumbnailUrl = null;
  }
  return { filename, url: publicUrlFor(filename), thumbnailUrl };
};

export const destroy = async (storageKey) => {
  if (driver === 'cloudinary') {
    await cloudinary.uploader.destroy(storageKey).catch(() => {});
    return;
  }
  await Promise.all(
    [storageKey, `thumbs/${storageKey}`].map((rel) => fs.unlink(path.join(config.uploadDir, rel)).catch(() => {})),
  );
};
