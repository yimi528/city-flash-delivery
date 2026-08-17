-- Configuration center: versioned pricing, service coverage and platform settings.
CREATE TYPE "ConfigCategory" AS ENUM ('PRICING', 'SERVICE_AREA', 'SYSTEM');
CREATE TYPE "RoutePriceUnit" AS ENUM ('PER_PERSON', 'PER_ORDER');

ALTER TABLE "pricing_rules"
  ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'distance',
  ADD COLUMN "serviceSurchargeFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxFeeFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "weatherMultiplierBps" INTEGER NOT NULL DEFAULT 10000;

CREATE TABLE "service_routes" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "originName" TEXT NOT NULL DEFAULT '福鼎',
  "destinationName" TEXT NOT NULL,
  "priceUnit" "RoutePriceUnit" NOT NULL,
  "unitPriceFen" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_routes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "service_routes_serviceId_enabled_sortOrder_idx"
  ON "service_routes" ("serviceId", "enabled", "sortOrder");

ALTER TABLE "quotes"
  ADD COLUMN "weatherFeeFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "productFeeFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "priceBreakdown" JSONB,
  ADD COLUMN "configVersions" JSONB;

ALTER TABLE "service_areas"
  ADD COLUMN "boundaryGeoJson" JSONB,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "service_area_bindings" (
  "id" TEXT NOT NULL,
  "serviceAreaId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_area_bindings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_area_bindings_serviceAreaId_fkey"
    FOREIGN KEY ("serviceAreaId") REFERENCES "service_areas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "service_area_bindings_serviceAreaId_serviceId_key"
  ON "service_area_bindings" ("serviceAreaId", "serviceId");
CREATE INDEX "service_area_bindings_serviceId_idx"
  ON "service_area_bindings" ("serviceId");

CREATE TABLE "service_coverage_policies" (
  "serviceId" TEXT NOT NULL,
  "enforcementEnabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_coverage_policies_pkey" PRIMARY KEY ("serviceId")
);

CREATE TABLE "platform_settings" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
  "closureReason" TEXT NOT NULL DEFAULT '',
  "timeZone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "weeklyHours" JSONB NOT NULL,
  "customerServicePhone" TEXT NOT NULL DEFAULT '',
  "announcementEnabled" BOOLEAN NOT NULL DEFAULT false,
  "announcementTitle" TEXT NOT NULL DEFAULT '',
  "announcementContent" TEXT NOT NULL DEFAULT '',
  "quoteValidityMinutes" INTEGER NOT NULL DEFAULT 10,
  "riderOrderRadiusMeters" INTEGER NOT NULL DEFAULT 30000,
  "riderMaxActiveOrders" INTEGER NOT NULL DEFAULT 1,
  "allowCancelBeforeClaim" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "config_drafts" (
  "id" TEXT NOT NULL,
  "category" "ConfigCategory" NOT NULL,
  "baseVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "config_drafts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "config_drafts_category_key" ON "config_drafts" ("category");

CREATE TABLE "config_revisions" (
  "id" TEXT NOT NULL,
  "category" "ConfigCategory" NOT NULL,
  "version" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "publishedBy" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "config_revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "config_revisions_category_version_key"
  ON "config_revisions" ("category", "version");
CREATE INDEX "config_revisions_category_publishedAt_idx"
  ON "config_revisions" ("category", "publishedAt");

CREATE INDEX IF NOT EXISTS "service_areas_boundary_gist_idx"
  ON "service_areas" USING GIST ("boundary");

INSERT INTO "platform_settings" ("id", "weeklyHours", "updatedAt")
VALUES ('platform', '{"0":[{"start":"00:00","end":"24:00"}],"1":[{"start":"00:00","end":"24:00"}],"2":[{"start":"00:00","end":"24:00"}],"3":[{"start":"00:00","end":"24:00"}],"4":[{"start":"00:00","end":"24:00"}],"5":[{"start":"00:00","end":"24:00"}],"6":[{"start":"00:00","end":"24:00"}]}', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "pricing_rules" (
  "id", "serviceId", "baseFeeFen", "deliveryStartFeeFen", "includedDistanceMeters",
  "perKmFen", "minimumFeeFen", "maxDistanceMeters", "pricingMode", "serviceSurchargeFen",
  "maxFeeFen", "weatherMultiplierBps", "version", "enabled", "createdAt", "updatedAt"
) VALUES
  ('carpool-ride-v1', 'carpool_ride', 0, 0, 0, 0, 0, 50000, 'fixed_route', 0, 0, 10000, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('send-parcel-v1', 'send_parcel', 0, 0, 0, 0, 0, 50000, 'fixed_route', 0, 0, 10000, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cargo-haul-v1', 'cargo_haul', 2800, 0, 4000, 280, 3300, 50000, 'distance', 500, 13800, 10000, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('urgent-delivery-v1', 'urgent_delivery', 1000, 0, 4000, 160, 1300, 50000, 'distance_weather', 300, 6800, 11500, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pickup-v1', 'pickup', 1000, 0, 4000, 160, 1000, 50000, 'distance_weather', 0, 6800, 11500, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('buy-for-me-v1', 'buy_for_me', 1000, 0, 4000, 160, 1200, 50000, 'distance_weather', 200, 6800, 11500, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pedicab-delivery-v1', 'pedicab_delivery', 1500, 0, 4000, 200, 1500, 50000, 'distance', 0, 8800, 10000, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('moving-handling-v1', 'moving_handling', 4800, 2800, 4000, 280, 4800, 50000, 'handling_fixed', 0, 0, 10000, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("serviceId") DO UPDATE SET
  "pricingMode" = EXCLUDED."pricingMode",
  "serviceSurchargeFen" = EXCLUDED."serviceSurchargeFen",
  "maxFeeFen" = EXCLUDED."maxFeeFen",
  "weatherMultiplierBps" = EXCLUDED."weatherMultiplierBps",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "service_routes" ("id", "serviceId", "destinationName", "priceUnit", "unitPriceFen", "sortOrder", "updatedAt") VALUES
  ('cangnan', 'carpool_ride', '苍南', 'PER_PERSON', 4000, 10, CURRENT_TIMESTAMP),
  ('wenzhou', 'carpool_ride', '温州', 'PER_PERSON', 15000, 20, CURRENT_TIMESTAMP),
  ('wenzhou_parcel', 'send_parcel', '温州', 'PER_ORDER', 5800, 10, CURRENT_TIMESTAMP),
  ('cangnan_parcel', 'send_parcel', '苍南', 'PER_ORDER', 2000, 20, CURRENT_TIMESTAMP),
  ('qinyu_parcel', 'send_parcel', '秦屿', 'PER_ORDER', 3000, 30, CURRENT_TIMESTAMP),
  ('longan_parcel', 'send_parcel', '龙安', 'PER_ORDER', 3000, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "serviceId" = EXCLUDED."serviceId",
  "destinationName" = EXCLUDED."destinationName",
  "priceUnit" = EXCLUDED."priceUnit",
  "unitPriceFen" = EXCLUDED."unitPriceFen",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "service_coverage_policies" ("serviceId", "updatedAt") VALUES
  ('carpool_ride', CURRENT_TIMESTAMP), ('send_parcel', CURRENT_TIMESTAMP), ('cargo_haul', CURRENT_TIMESTAMP),
  ('urgent_delivery', CURRENT_TIMESTAMP), ('pickup', CURRENT_TIMESTAMP), ('buy_for_me', CURRENT_TIMESTAMP),
  ('pedicab_delivery', CURRENT_TIMESTAMP), ('moving_handling', CURRENT_TIMESTAMP)
ON CONFLICT ("serviceId") DO NOTHING;

INSERT INTO "config_revisions" ("id", "category", "version", "payload", "publishedBy") VALUES
  ('revision-pricing-v1', 'PRICING', 1, '{"source":"migration","version":1}', 'migration'),
  ('revision-service-area-v1', 'SERVICE_AREA', 1, '{"source":"migration","version":1,"enforcement":"disabled"}', 'migration'),
  ('revision-system-v1', 'SYSTEM', 1, '{"source":"migration","version":1}', 'migration')
ON CONFLICT ("category", "version") DO NOTHING;
