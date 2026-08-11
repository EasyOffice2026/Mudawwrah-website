import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import { config } from './config.js';

// Cloudinary configures itself from CLOUDINARY_URL. Without it we fall back to
// local disk so `npm run dev` works with no cloud account.
export const driver = process.env.CLOUDINARY_URL ? 'cloudinary' : 'local';

if (driver === 'cloudinary') cloudinary.config({ secure: true });

const randomName = (originalName) => {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
};

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
export const put = async (buffer, { originalName, folder = 'mdawra' }) => {
  if (driver === 'cloudinary') {
    const result = await uploadToCloudinary(buffer, folder);
    return {
      filename: result.public_id,
      url: result.secure_url,
      thumbnailUrl: cloudinaryThumb(result.secure_url),
    };
  }

  const filename = randomName(originalName);
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
