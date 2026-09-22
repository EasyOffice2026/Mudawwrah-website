-- DropIndex
DROP INDEX "CustomerAddress_phone_idx";

-- DropIndex
DROP INDEX "WhatsappMessage_phone_createdAt_idx";

-- DropIndex
DROP INDEX "WhatsappSession_phone_key";

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "whatsappAccessToken" TEXT,
ADD COLUMN     "whatsappPhoneNumberId" TEXT;

-- AlterTable
ALTER TABLE "WhatsappMessage" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WhatsappSession" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "CustomerAddress_tenantId_phone_idx" ON "CustomerAddress"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_whatsappPhoneNumberId_key" ON "Tenant"("whatsappPhoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_tenantId_phone_createdAt_idx" ON "WhatsappMessage"("tenantId", "phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_tenantId_phone_key" ON "WhatsappSession"("tenantId", "phone");

