-- How many copies of a waiting ticket the branch printer still owes: pressing "Send to printer" again before the
-- ticket comes out adds a copy instead of being lost (services/printService.js). Only an added column with a default.
ALTER TABLE "Order" ADD COLUMN "printCopies" INTEGER NOT NULL DEFAULT 1;
