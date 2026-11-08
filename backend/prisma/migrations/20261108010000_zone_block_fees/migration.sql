-- Delivery fee per block inside an area (e.g. Sabah Al-Ahmad block 2), as a list on the area; empty for every
-- existing area, so nothing changes until the owner adds one. Only an added column with a default.
ALTER TABLE "DeliveryZone" ADD COLUMN "blockFees" JSONB NOT NULL DEFAULT '[]';
