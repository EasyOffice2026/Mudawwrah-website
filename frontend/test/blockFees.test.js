import assert from "node:assert/strict";
import { test } from "node:test";
import { blockFeeFor, blockKey } from "../src/lib/blockFees.js";

test("a block is the same block however the customer types it", () => {
  for (const typed of [
    "2",
    "B2",
    "b-2",
    "Block 2",
    " 02 ",
    "قطعة ٢",
    "ق2",
    "٢",
  ])
    assert.equal(blockKey(typed), "2", typed);
  assert.equal(blockKey("12"), "12");
  assert.equal(blockKey(undefined), "");
});

test("checkout shows the block fee when the area lists the block, and nothing special otherwise", () => {
  const sabah = { deliveryFee: 0.5, blockFees: [{ block: "B2", fee: 0.25 }] };
  assert.equal(blockFeeFor(sabah, "Block 2"), 0.25);
  assert.equal(blockFeeFor(sabah, "12"), undefined);
  assert.equal(blockFeeFor(sabah, ""), undefined);
  assert.equal(blockFeeFor({ deliveryFee: 1 }, "2"), undefined);
});
