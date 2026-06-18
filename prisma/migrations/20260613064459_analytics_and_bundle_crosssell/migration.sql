-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OfferTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "minQty" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL,
    "getQty" INTEGER,
    "title" TEXT,
    "subtitle" TEXT,
    "labelText" TEXT,
    "imageUrl" TEXT,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "giftProductId" TEXT,
    "giftVariantId" TEXT,
    "giftTitle" TEXT,
    "valueX100" INTEGER NOT NULL,
    "badge" TEXT,
    "preselected" BOOLEAN NOT NULL DEFAULT false,
    "bundleProductsJson" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "OfferTier_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OfferTier" ("badge", "discountType", "freeShipping", "getQty", "giftProductId", "giftTitle", "giftVariantId", "id", "imageUrl", "labelText", "minQty", "offerId", "position", "preselected", "subtitle", "title", "valueX100") SELECT "badge", "discountType", "freeShipping", "getQty", "giftProductId", "giftTitle", "giftVariantId", "id", "imageUrl", "labelText", "minQty", "offerId", "position", "preselected", "subtitle", "title", "valueX100" FROM "OfferTier";
DROP TABLE "OfferTier";
ALTER TABLE "new_OfferTier" RENAME TO "OfferTier";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
