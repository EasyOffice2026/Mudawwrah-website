import { HttpError } from '../middleware/error.js';

/**
 * What an order costs, worked out from the menu and the restaurant's settings only: never from prices a client
 * sends. Pure functions (no database), so every rule of the arithmetic can be tested on its own.
 *
 * KWD has three decimals; every amount is rounded to them at each step, the way the receipt shows it.
 */
export const round3 = (value) => Number(Number(value).toFixed(3));

/**
 * The order's lines from what the customer chose: each item must exist in this restaurant's menu and be available,
 * and each option must belong to that item. A line's price is the item's own plus its options' extras.
 */
export const priceLines = (chosen, menuItems, options) =>
  chosen.map((line) => {
    const item = menuItems.find((m) => m.id === line.menuItemId);
    if (!item) throw new HttpError(400, `Menu item ${line.menuItemId} not found`);
    if (!item.isAvailable || item.isOutOfStock) throw new HttpError(409, `${item.nameEn} is currently unavailable`);
    const selected = (line.optionIds || []).map((optionId) => {
      const option = options.find((o) => o.id === optionId && o.menuItemId === item.id);
      if (!option) throw new HttpError(400, `Customization option ${optionId} is not valid for ${item.nameEn}`);
      return option;
    });
    const extras = selected.reduce((sum, o) => sum + Number(o.extraPrice), 0);
    const unitPrice = round3(Number(item.price) + extras);
    return {
      menuItemId: item.id,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      unitPrice,
      quantity: line.quantity,
      lineTotal: round3(unitPrice * line.quantity),
      customizations: selected.length
        ? selected.map((o) => ({ id: o.id, nameEn: o.nameEn, nameAr: o.nameAr, extraPrice: Number(o.extraPrice) }))
        : undefined,
    };
  });

export const subtotalOf = (lines) => round3(lines.reduce((sum, l) => sum + l.lineTotal, 0));

/** The delivery fee before any voucher: none for collection; the area's own fee, else the restaurant's. */
export const deliveryFeeFor = (orderType, zone, settings) => (orderType === 'PICKUP' ? 0 : round3(zone?.deliveryFee ?? settings.deliveryFee));

/**
 * The order's totals. The voucher's discount comes off the items; the service charge is on the discounted items;
 * tax is on the discounted items plus the service charge. Collection carries no delivery fee and no tip; a tip is
 * never negative.
 */
export const orderTotals = ({ subtotal, orderType, deliveryFee, discount = 0, freeDelivery = false, settings, tip = 0 }) => {
  const fee = freeDelivery ? 0 : deliveryFee;
  const discountedSubtotal = round3(subtotal - discount);
  const serviceCharge = round3((discountedSubtotal * Number(settings.serviceChargePercent || 0)) / 100);
  const tax = round3(((discountedSubtotal + serviceCharge) * Number(settings.taxPercent || 0)) / 100);
  const tipped = orderType === 'PICKUP' ? 0 : Math.max(0, round3(tip || 0));
  return {
    deliveryFee: fee,
    discountedSubtotal,
    serviceCharge,
    tax,
    tip: tipped,
    total: round3(discountedSubtotal + fee + serviceCharge + tax + tipped),
  };
};

/** The payment methods a restaurant accepts, in its own order (KNET and card when it has not said). */
export const acceptedMethods = (settings) =>
  String(settings.paymentMethods || 'KNET,CARD')
    .split(',')
    .map((method) => method.trim())
    .filter(Boolean);
