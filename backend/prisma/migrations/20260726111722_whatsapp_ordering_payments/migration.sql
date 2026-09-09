-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('WEB', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "area" TEXT,
ADD COLUMN     "block" TEXT,
ADD COLUMN     "building" TEXT,
ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentProvider" TEXT,
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "street" TEXT;

-- CreateTable
CREATE TABLE "OrderFeedback" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "waName" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "state" TEXT NOT NULL DEFAULT 'START',
    "cart" JSONB,
    "draft" JSONB,
    "lastOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "waMessageId" TEXT,
    "body" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "block" TEXT,
    "street" TEXT,
    "building" TEXT,
    "extra" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderFeedback_orderId_key" ON "OrderFeedback"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_phone_key" ON "WhatsappSession"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_waMessageId_key" ON "WhatsappMessage"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_phone_createdAt_idx" ON "WhatsappMessage"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAddress_phone_idx" ON "CustomerAddress"("phone");

-- AddForeignKey
ALTER TABLE "OrderFeedback" ADD CONSTRAINT "OrderFeedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
