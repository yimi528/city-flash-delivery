ALTER TABLE "pricing_rules"
  ADD COLUMN IF NOT EXISTS "weatherSurchargeFen" INTEGER NOT NULL DEFAULT 0;

UPDATE "service_catalog"
SET "name" = '寄货/配送'
WHERE "id" = 'send_parcel';

UPDATE "service_catalog"
SET "vehicleName" = '小车'
WHERE "id" = 'carpool_ride';

UPDATE "pricing_rules"
SET "pricingMode" = 'parcel_category',
    "weatherSurchargeFen" = 0,
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "serviceId" = 'send_parcel';

UPDATE "pricing_rules"
SET "perKmFen" = 300,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "serviceId" = 'cargo_haul';

UPDATE "pricing_rules"
SET "weatherMultiplierBps" = 10000,
    "weatherSurchargeFen" = 500,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "pricingMode" = 'distance_weather';

UPDATE "service_routes"
SET "enabled" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "serviceId" = 'send_parcel';

INSERT INTO "service_routes" ("id", "serviceId", "originName", "destinationName", "priceUnit", "unitPriceFen", "sortOrder", "enabled", "version", "updatedAt")
VALUES ('fuzhou', 'carpool_ride', '福鼎', '福州', 'PER_PERSON', 0, 30, true, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "serviceId" = EXCLUDED."serviceId",
  "originName" = EXCLUDED."originName",
  "destinationName" = EXCLUDED."destinationName",
  "priceUnit" = EXCLUDED."priceUnit",
  "sortOrder" = EXCLUDED."sortOrder",
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
