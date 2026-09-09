-- Customization option thumbnails and discounted extras.
--
-- Options can now carry their own image (shown beside the name in the item
-- sheet) and a pre-discount surcharge, so an extra that is on offer shows
-- "+ KWD 0.175" beside a struck-through "+ KWD 0.250".
--
-- Both columns are nullable, so this is safe on a populated database.
-- AlterTable
ALTER TABLE "CustomizationOption" ADD COLUMN     "compareAtExtraPrice" DECIMAL(10,3),
ADD COLUMN     "imageId" TEXT;

-- CreateIndex
CREATE INDEX "CustomizationOption_imageId_idx" ON "CustomizationOption"("imageId");

-- AddForeignKey
ALTER TABLE "CustomizationOption" ADD CONSTRAINT "CustomizationOption_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

