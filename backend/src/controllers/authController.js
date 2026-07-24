import * as authService from '../services/authService.js';
import { loginSchema } from '../validators.js';

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
