import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

// Storage is abstracted here so the local disk driver can be swapped for S3/Cloudinary later.
const publicUrlFor = (relativePath) => `${config.publicUrl}/uploads/${relativePath}`;

export const saveUpload = async (file) => {
  const thumbName = `thumbs/${file.filename}`;
  let thumbnailUrl = null;
  try {
    await sharp(file.path).resize(400, 400, { fit: 'cover' }).toFile(path.join(config.uploadDir, thumbName));
    thumbnailUrl = publicUrlFor(thumbName);
  } catch {
    thumbnailUrl = null;
  }
  return prisma.media.create({
    data: {
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: publicUrlFor(file.filename),
      thumbnailUrl,
    },
  });
};

export const list = () => prisma.media.findMany({ orderBy: { createdAt: 'desc' } });

export const remove = async (id) => {
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) throw new HttpError(404, 'Media not found');
  await prisma.menuItem.updateMany({ where: { imageId: id }, data: { imageId: null } });
  await prisma.banner.updateMany({ where: { imageId: id }, data: { imageId: null } });
  await prisma.media.delete({ where: { id } });
  await Promise.all(
    [media.filename, `thumbs/${media.filename}`].map((rel) =>
      fs.unlink(path.join(config.uploadDir, rel)).catch(() => {}),
    ),
  );
};
