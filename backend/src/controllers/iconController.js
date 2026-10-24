import { HttpError } from '../middleware/error.js';
import { ICON_SIZES, iconFor } from '../services/appIcon.js';

// GET /api/tenants/icon?size=192: the restaurant's app icon (the restaurant is found from the address, as everywhere).
export const icon = async (req, res) => {
  if (!req.tenant) throw new HttpError(404, 'No restaurant for this address');
  const size = Number(req.query.size || 192);
  if (!ICON_SIZES.includes(size)) throw new HttpError(400, `size must be one of ${ICON_SIZES.join(', ')}`);
  const png = await iconFor(req.tenant, size);
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/png').send(png);
};
