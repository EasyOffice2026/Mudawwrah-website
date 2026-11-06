-- When each branch's order screen and print station last checked in, so the owner's "connected" view survives a
-- server restart (services/presenceService.js). Only added columns; nothing existing changes.
ALTER TABLE "PickupLocation" ADD COLUMN "screenSeenAt" TIMESTAMP(3);
ALTER TABLE "PickupLocation" ADD COLUMN "screenAddress" TEXT;
ALTER TABLE "PickupLocation" ADD COLUMN "printerSeenAt" TIMESTAMP(3);
