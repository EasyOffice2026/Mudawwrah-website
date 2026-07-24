import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { config } from '../config.js';
import { HttpError } from './error.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

fs.mkdirSync(path.join(config.uploadDir, 'thumbs'), { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new HttpError(400, `Unsupported file type: ${file.mimetype}`));
    cb(null, true);
  },
});
