-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "offerId" TEXT NOT NULL,
    "event" TEXT NOT NULL DEFAULT 'impression',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OfferConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "revenueX100" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "OfferEvent_offerId_event_idx" ON "OfferEvent"("offerId", "event");

-- CreateIndex
CREATE INDEX "OfferConversion_offerId_idx" ON "OfferConversion"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferConversion_offerId_orderId_key" ON "OfferConversion"("offerId", "orderId");
