/**
 * Delivery fee per block (e.g. Sabah Al-Ahmad block 2), the same rules as the server's services/pricing.js, so the
 * fee the customer sees at checkout is the one the order is charged.
 */

/** "Block 2", "B2", "b-2", "02", "قطعة ٢" and "ق2" are all block "2". */
export const blockKey = (text) =>
  String(text ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, "")
    .replace(/^(block|blk|b|قطعة|قطعه|ق)(?=[0-9])/, "")
    .replace(/^0+(?=[0-9])/, "");

/** The area's fee for this block if it lists one; otherwise undefined (the area's own fee applies). */
export const blockFeeFor = (zone, block) => {
  const key = blockKey(block);
  if (!key) return undefined;
  const match = (zone?.blockFees || []).find(
    (row) => blockKey(row.block) === key,
  );
  return match ? Number(match.fee) : undefined;
};
