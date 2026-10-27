import { clearBranchAccessCache } from '../middleware/auth.js';
import * as devices from '../services/deviceService.js';

// Branch devices (owner only): see services/deviceService.js.
export const list = async (req, res) => res.json(await devices.list());

// Approves the device the owner is using right now; the key is sent back this once, for its browser to keep.
export const approve = async (req, res) => {
  const approved = await devices.approve(req.params.branchId, req.body?.name);
  // The first approved device turns the branch's lock on: checks remembered from before must not let others in.
  clearBranchAccessCache();
  res.status(201).json(approved);
};

export const revoke = async (req, res) => {
  const device = await devices.revoke(req.params.id);
  // The branch lock remembers recent checks for a minute; a revoked device must stop now.
  clearBranchAccessCache();
  res.json(device);
};
