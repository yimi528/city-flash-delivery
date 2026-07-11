-- Persist customer-facing order metadata and operator quote state.
CREATE TYPE "QuoteStatus" AS ENUM ('NONE', 'PENDING', 'QUOTED');

ALTER TABLE "orders"
  ADD COLUMN "serviceName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buyItems" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "vehicleType" "VehicleType" NOT NULL DEFAULT 'EBIKE',
  ADD COLUMN "vehicleName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'distance',
  ADD COLUMN "isManualQuote" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quotedFee" DECIMAL(8,2),
  ADD COLUMN "quoteStatus" "QuoteStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "quoteNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "quoteUpdatedAt" TIMESTAMP(3);
