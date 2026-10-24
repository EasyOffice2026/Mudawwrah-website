import * as printService from '../services/printService.js';

// A print station polls these every few seconds with its private key.
export const jobs = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ jobs: await printService.jobs(req.printBranch), now: new Date() });
};

export const printed = async (req, res) => res.json(await printService.markPrinted(req.printBranch, req.params.id));

// For the owner's Printing page and the order screen's "print again".
export const stations = async (req, res) => res.json(await printService.stations());

export const reprint = async (req, res) => res.json(await printService.reprint(req.params.id, req.user));
