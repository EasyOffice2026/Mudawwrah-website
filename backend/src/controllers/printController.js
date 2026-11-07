import { clientIp } from '../services/authService.js';
import * as presence from '../services/presenceService.js';
import * as printService from '../services/printService.js';

// A print station polls these every few seconds with its private key. Each poll also tells the owner the
// branch's printer is connected.
export const jobs = async (req, res) => {
  presence.touch(req.tenant.id, req.printBranch, clientIp(req), Date.now(), 'printer');
  res.set('Cache-Control', 'no-store');
  res.json({ jobs: await printService.jobs(req.printBranch), now: new Date() });
};

export const printed = async (req, res) =>
  res.json(await printService.markPrinted(req.printBranch, req.params.id, { queuedAt: req.body?.queuedAt, copies: req.body?.copies }));

// For the Printing page: every branch for the owner and staff, its own for a branch account.
export const stations = async (req, res) => res.json(await printService.stations(req.user));

export const reprint = async (req, res) => res.json(await printService.reprint(req.params.id, req.user));
