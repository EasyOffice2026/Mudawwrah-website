import { HttpError } from '../middleware/error.js';
import * as service from '../services/mediaService.js';

export const upload = async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded (expected field "file")');
  res.status(201).json(await service.saveUpload(req.file));
};

export const list = async (req, res) => res.json(await service.list());

export const remove = async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
};
