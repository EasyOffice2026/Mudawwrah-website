-- Ending every session of an account at once: a token carries the version it was issued with.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Devices the owner has approved for a branch (only a hash of each device's key is stored).
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrustedDevice_keyHash_key" ON "TrustedDevice"("keyHash");
CREATE INDEX "TrustedDevice_tenantId_idx" ON "TrustedDevice"("tenantId");
CREATE INDEX "TrustedDevice_branchId_idx" ON "TrustedDevice"("branchId");
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "PickupLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Like every table: Supabase's public Data API can read nothing here.
ALTER TABLE "TrustedDevice" ENABLE ROW LEVEL SECURITY;
