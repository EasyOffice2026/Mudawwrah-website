import * as service from '../services/driverService.js';
import { assignDriverSchema, driverLoginSchema } from '../validators.js';

// The driver page and app. Every answer is this driver's own and changes by the second, so none is ever cached.
const fresh = (res) => res.set('Cache-Control', 'no-store');

export const login = async (req, res) => res.json(await service.login(driverLoginSchema.parse(req.body)));

export const orders = async (req, res) => fresh(res).json(await service.myOrders(req.user));
export const start = async (req, res) => fresh(res).json(await service.start(req.user, req.params.id));
export const delivered = async (req, res) => fresh(res).json(await service.delivered(req.user, req.params.id));
export const location = async (req, res) => fresh(res).json(await service.reportLocation(req.user, req.body));

// The order desk: who can take a delivery, and giving one to a driver.
export const list = async (req, res) => fresh(res).json(await service.listForDesk(req.user));
export const assign = async (req, res) =>
  res.json(await service.assign(req.params.id, assignDriverSchema.parse(req.body).driverId, req.user));
