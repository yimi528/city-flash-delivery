UPDATE "service_catalog" SET "sortOrder" = 10 WHERE "id" = 'carpool_ride';
UPDATE "service_catalog" SET "sortOrder" = 20 WHERE "id" = 'send_parcel';
UPDATE "service_catalog" SET "sortOrder" = 30 WHERE "id" = 'cargo_haul';
UPDATE "service_catalog" SET "sortOrder" = 40 WHERE "id" = 'moving_handling';

ALTER TABLE "addresses"
  ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastUsedAt" TIMESTAMP(3);

CREATE INDEX "addresses_userId_usageCount_lastUsedAt_idx"
  ON "addresses"("userId", "usageCount" DESC, "lastUsedAt" DESC);
