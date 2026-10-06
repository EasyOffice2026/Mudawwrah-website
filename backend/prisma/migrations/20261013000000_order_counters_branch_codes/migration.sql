-- AlterTable
ALTER TABLE "PickupLocation" ADD COLUMN     "orderCode" TEXT;

-- CreateTable
CREATE TABLE "OrderCounter" (
    "tenantId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("tenantId","prefix")
);

-- AddForeignKey
ALTER TABLE "OrderCounter" ADD CONSTRAINT "OrderCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

