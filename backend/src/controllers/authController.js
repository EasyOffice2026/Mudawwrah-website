import * as authService from '../services/authService.js';
import { endSessions } from '../services/sessionService.js';
import { registerSchema, loginSchema } from '../validators.js';

// Where the request comes from, for the branch lock: the internet address, and the approved-device key if any.
const origin = (req) => ({ ip: authService.clientIp(req), deviceKey: req.get('x-device-key') || undefined });

export const login = async (req, res) => {
  const data = loginSchema.parse(req.body);
  res.json(await authService.login(data, origin(req)));
};

export const refresh = async (req, res) => {
  res.json(await authService.refresh(req.body?.refreshToken, origin(req)));
};

export const me = async (req, res) => {
  res.json(await authService.me(req.user.sub));
};

/** Ends every session of the signed-in account, on every device (this one too). */
export const signOutEverywhere = async (req, res) => {
  await endSessions(req.user.sub);
  res.json({ ok: true });
};

/** Public customer signup for the restaurant in context. */
export const register = async (req, res) =>
  res.status(201).json(await authService.register(registerSchema.parse(req.body)));
