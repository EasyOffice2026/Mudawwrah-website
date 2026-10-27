import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { runWithTenant } from '../tenantContext.js';
import * as tap from './payment/tap.js';
import { getAll as getSettings } from './settingService.js';

/**
 * A new restaurant's setup, checked: what is done, what is missing, and what to do about it. For the platform
 * console, so taking on a restaurant follows one list instead of memory.
 *
 * Each step is "done", "missing" (the restaurant cannot work properly without it) or "advice" (works, but should
 * be done). Its legal pages live in the website's code, so the console checks those itself.
 */
export const checklist = async (tenantId) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, 'Restaurant not found');
  const where = { tenantId };

  const [settings, owners, branches, branchUsers, zones, categories, items, itemsWithoutPicture, devices] = await Promise.all([
    runWithTenant(tenant, () => getSettings()),
    prisma.user.count({ where: { ...where, role: 'ADMIN', isActive: true } }),
    prisma.pickupLocation.findMany({ where: { ...where, isActive: true }, select: { id: true, nameEn: true, hours: true } }),
    prisma.user.findMany({ where: { ...where, role: 'BRANCH', isActive: true }, select: { branchId: true } }),
    prisma.deliveryZone.count({ where }),
    prisma.category.count({ where }),
    prisma.menuItem.count({ where }),
    prisma.menuItem.count({ where: { ...where, imageId: null } }),
    prisma.trustedDevice.findMany({ where: { ...where, revokedAt: null }, select: { branchId: true } }),
  ]);

  const step = (key, ok, detail, level = 'missing') => ({ key, status: ok ? 'done' : level, detail });
  const withoutHours = branches.filter((b) => !Array.isArray(b.hours) || !b.hours.length).map((b) => b.nameEn);
  const withoutAccount = branches.filter((b) => !branchUsers.some((u) => u.branchId === b.id)).map((b) => b.nameEn);
  const unlocked = branches.filter((b) => !devices.some((d) => d.branchId === b.id)).map((b) => b.nameEn);
  const listed = config.payment.tenants.includes(tenant.slug.toLowerCase()) && Boolean(config.payment.tap.secretKey);
  const ownTap = Boolean(tap.ownKeyOf(tenant));
  const delivers = settings.deliveryEnabled === 'true';

  return [
    step('logo', Boolean(tenant.logoUrl), tenant.logoUrl ? null : 'Upload the logo (Settings → Branding).', 'advice'),
    step('owner', owners > 0, owners ? `${owners} owner account(s)` : 'Create the owner account.'),
    step('branches', branches.length > 0 && !withoutHours.length, branches.length ? (withoutHours.length ? `No opening hours: ${withoutHours.join(', ')}` : `${branches.length} branch(es)`) : 'Add the branches.'),
    step('branchAccounts', branches.length > 0 && !withoutAccount.length, withoutAccount.length ? `No login yet: ${withoutAccount.join(', ')}` : null, 'advice'),
    step('zones', !delivers || zones > 0, delivers ? (zones ? `${zones} delivery area(s)` : 'Add the delivery areas, each with its branch.') : 'Delivery is off.'),
    step('menu', categories > 0 && items > 0, items ? `${items} item(s) in ${categories} categories` : 'Add the menu (Menu → Import from Excel is quickest).'),
    step('pictures', items > 0 && itemsWithoutPicture === 0, itemsWithoutPicture ? `${itemsWithoutPicture} item(s) without a picture` : null, 'advice'),
    step('domain', Boolean(tenant.customDomain), tenant.customDomain || 'Connect the restaurant\'s own domain.', 'advice'),
    step('payment', ownTap || listed, ownTap ? 'Own Tap account' : listed ? "The platform's Tap account" : 'No online payment: add the Tap key (Settings → Online payment).', 'advice'),
    step('contact', Boolean(settings.contactPhone || settings.whatsappNumber), settings.contactPhone || settings.whatsappNumber || 'Add the contact phone (Settings).', 'advice'),
    step('devices', branches.length > 0 && !unlocked.length, unlocked.length ? `Not locked to a device: ${unlocked.join(', ')}` : null, 'advice'),
    step('open', settings.isOpen === 'true', settings.isOpen === 'true' ? 'Taking orders' : 'Closed for orders (Settings → open switch).', 'advice'),
  ];
};
