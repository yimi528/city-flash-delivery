ALTER TABLE "operators"
  DROP COLUMN IF EXISTS "totpSecretEncrypted",
  DROP COLUMN IF EXISTS "lastTotpCounter";
