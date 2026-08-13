ALTER TABLE "addresses"
  ADD COLUMN "tag" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "adcode" TEXT NOT NULL DEFAULT '';

CREATE INDEX "addresses_userId_isDefault_idx" ON "addresses"("userId", "isDefault");

CREATE UNIQUE INDEX "addresses_one_default_per_user_idx"
  ON "addresses"("userId")
  WHERE "isDefault" = true;
