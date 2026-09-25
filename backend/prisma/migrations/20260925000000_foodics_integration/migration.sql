-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "foodicsAccessToken" TEXT,
ADD COLUMN     "foodicsBranchId" TEXT,
ADD COLUMN     "foodicsWebhookSecret" TEXT;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "foodicsProductId" TEXT;

-- AlterTable
ALTER TABLE "CustomizationOption" ADD COLUMN     "foodicsModifierOptionId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "foodicsOrderId" TEXT,
ADD COLUMN     "foodicsError" TEXT;
