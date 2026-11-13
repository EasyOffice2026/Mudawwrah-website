-- Delivery drivers: a DRIVER account, and which driver an order was given to. Only an added role and added columns;
-- nothing existing changes. A driver's live position is never stored in the database.
ALTER TYPE "Role" ADD VALUE 'DRIVER';

ALTER TABLE "Order" ADD COLUMN "driverId" TEXT;
ALTER TABLE "Order" ADD COLUMN "driverAssignedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_driverId_status_idx" ON "Order"("driverId", "status");
