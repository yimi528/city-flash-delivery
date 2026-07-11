ALTER TABLE "orders"
  ADD COLUMN "productFee" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryFee" DECIMAL(8,2) NOT NULL DEFAULT 0;

UPDATE "orders"
SET "deliveryFee" = "totalFee";
