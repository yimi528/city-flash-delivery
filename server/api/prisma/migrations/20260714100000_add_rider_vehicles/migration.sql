ALTER TABLE "rider_applications" ADD COLUMN "vehicleTypes" "VehicleType"[] NOT NULL DEFAULT ARRAY[]::"VehicleType"[];

UPDATE "rider_applications"
SET "vehicleTypes" = ARRAY["vehicleType"]::"VehicleType"[]
WHERE cardinality("vehicleTypes") = 0;

CREATE TABLE "rider_vehicles" (
  "id" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "vehicleType" "VehicleType" NOT NULL,
  "vehicleName" TEXT NOT NULL DEFAULT '',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "verified" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rider_vehicles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rider_vehicles_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "rider_vehicles_riderId_vehicleType_key" ON "rider_vehicles"("riderId", "vehicleType");
CREATE INDEX "rider_vehicles_riderId_enabled_verified_idx" ON "rider_vehicles"("riderId", "enabled", "verified");

INSERT INTO "rider_vehicles" ("id", "riderId", "vehicleType", "vehicleName", "enabled", "verified", "createdAt", "updatedAt")
SELECT
  'legacy-' || "id",
  "id",
  "vehicleType",
  "vehicleName",
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "rider_profiles"
WHERE "vehicleType" IS NOT NULL
ON CONFLICT ("riderId", "vehicleType") DO NOTHING;
