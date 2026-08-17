ALTER TABLE "operators"
  ADD COLUMN "totpSecretEncrypted" TEXT,
  ADD COLUMN "lastTotpCounter" INTEGER;
