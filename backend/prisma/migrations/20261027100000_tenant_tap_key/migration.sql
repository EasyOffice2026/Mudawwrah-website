-- A restaurant's own Tap secret key, encrypted by the server before it is stored (services/secretBox.js).
ALTER TABLE "Tenant" ADD COLUMN "tapSecretKey" TEXT;
