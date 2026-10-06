/**
 * When an order first reached each step, so reports can measure how long the
 * kitchen and the rider take. PENDING is createdAt itself; REACHED is the
 * retired second rider step and has no column of its own.
 */
export const STATUS_TIME = {
  CONFIRMED: 'confirmedAt',
  PREPARING: 'preparingAt',
  READY: 'readyAt',
  OUT_FOR_DELIVERY: 'outForDeliveryAt',
  DELIVERED: 'deliveredAt',
  CANCELLED: 'cancelledAt',
};

/**
 * The timestamp to write when `order` moves to `status` — only the first time
 * it gets there, so going back and forth never rewrites when a step happened.
 */
export const statusStamp = (order, status, at = new Date()) => {
  const column = STATUS_TIME[status];
  return column && !order?.[column] ? { [column]: at } : {};
};

/** Why an order was cancelled. POS_DECLINED is set by the Foodics webhook, never chosen by staff. */
export const CANCEL_REASONS = [
  'CUSTOMER_REQUEST',
  'OUT_OF_STOCK',
  'BRANCH_BUSY',
  'NO_DRIVER',
  'ADDRESS_ISSUE',
  'DUPLICATE',
  'TEST',
  'OTHER',
];
export const SYSTEM_CANCEL_REASONS = ['POS_DECLINED'];
