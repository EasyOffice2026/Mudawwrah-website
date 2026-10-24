-- Automatic printing: when an order became printable (placed, or paid for online), when a branch
-- station printed it, and how many times. All nullable or defaulted, so old orders stay unprinted.
ALTER TABLE "Order" ADD COLUMN "printQueuedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "printedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Order_branchId_printedAt_idx" ON "Order"("branchId", "printedAt");
