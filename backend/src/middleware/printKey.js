import { keyMatches } from '../services/printService.js';
import { HttpError } from './error.js';

/**
 * Guards a print station's requests. The station proves itself with the key in its link, sent in the
 * X-Print-Key header (never in the address, which the server logs). The branch it speaks for is named in
 * ?branch=, and the key only opens that one branch.
 */
export const requirePrintKey = (req, res, next) => {
  const branch = String(req.query.branch || '');
  const key = req.headers['x-print-key'];
  if (!req.tenant || !branch || !keyMatches(req.tenant.id, branch, key)) {
    return next(new HttpError(401, 'This printer link is not valid'));
  }
  req.printBranch = branch;
  return next();
};
