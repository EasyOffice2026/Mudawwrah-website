import * as authService from '../services/authService.js';
import { registerSchema, loginSchema } from '../validators.js';

export const login = async (req, res) => {
  const data = loginSchema.parse(req.body);
  res.json(await authService.login(data));
};

export const refresh = async (req, res) => {
  res.json(await authService.refresh(req.body?.refreshToken));
};

export const me = async (req, res) => {
  res.json(await authService.me(req.user.sub));
};

/** Public customer signup for the restaurant in context. */
export const register = async (req, res) =>
  res.status(201).json(await authService.register(registerSchema.parse(req.body)));
