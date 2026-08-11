import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { destroy, put } from '../storage.js';

export const saveUpload = async (file) => {
  const stored = await put(file.buffer, { originalName: file.originalname });
  return prisma.media.create({
    data: {
      filename: stored.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: stored.url,
      thumbnailUrl: stored.thumbnailUrl,
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
  await destroy(media.filename);
};
