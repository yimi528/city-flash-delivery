ALTER TABLE "rider_profiles" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

UPDATE "rider_profiles" SET "lastSeenAt" = "lastLocationAt" WHERE "lastLocationAt" IS NOT NULL;

CREATE INDEX "rider_profiles_online_lastSeenAt_idx" ON "rider_profiles"("online", "lastSeenAt");
