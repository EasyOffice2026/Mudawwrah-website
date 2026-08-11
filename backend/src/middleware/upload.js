import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from './error.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

// Files are held in memory and handed to the storage driver, so the API needs
// no writable filesystem when deployed to a cloud host.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new HttpError(400, `Unsupported file type: ${file.mimetype}`));
    cb(null, true);
  },
});
