ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RIDER';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'CARPOOL';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'MOVING';
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'HANDLING';
ALTER TYPE "VehicleType" ADD VALUE IF NOT EXISTS 'MANUAL';

CREATE TYPE "RiderStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');
CREATE TYPE "AssignmentMethod" AS ENUM ('CLAIM', 'OPERATOR');

CREATE TABLE "service_catalog" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "vehicleType" "VehicleType",
  "vehicleName" TEXT NOT NULL DEFAULT '',
  "passengerCapacity" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carpool_routes" (
  "id" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "unitPriceFen" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "carpool_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pricing_rules" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "baseFeeFen" INTEGER NOT NULL,
  "deliveryStartFeeFen" INTEGER NOT NULL DEFAULT 0,
  "includedDistanceMeters" INTEGER NOT NULL DEFAULT 0,
  "perKmFen" INTEGER NOT NULL DEFAULT 0,
  "minimumFeeFen" INTEGER NOT NULL DEFAULT 0,
  "maxDistanceMeters" INTEGER NOT NULL DEFAULT 50000,
  "version" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "routeId" TEXT,
  "direction" TEXT NOT NULL DEFAULT '',
  "passengerCount" INTEGER NOT NULL DEFAULT 1,
  "pickup" JSONB,
  "dropoff" JSONB,
  "distanceMeters" INTEGER NOT NULL DEFAULT 0,
  "vehicleType" "VehicleType",
  "vehicleName" TEXT NOT NULL DEFAULT '',
  "unitPriceFen" INTEGER NOT NULL DEFAULT 0,
  "baseFeeFen" INTEGER NOT NULL DEFAULT 0,
  "distanceFeeFen" INTEGER NOT NULL DEFAULT 0,
  "totalFen" INTEGER NOT NULL,
  "pricingRuleVersion" INTEGER NOT NULL DEFAULT 1,
  "requiresDelivery" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rider_profiles" (
  "id" TEXT NOT NULL,
  "openid" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "status" "RiderStatus" NOT NULL DEFAULT 'PENDING',
  "vehicleType" "VehicleType",
  "vehicleName" TEXT NOT NULL DEFAULT '',
  "handlingQualified" BOOLEAN NOT NULL DEFAULT false,
  "online" BOOLEAN NOT NULL DEFAULT false,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "serviceCity" TEXT NOT NULL DEFAULT '宁德市',
  "maxActiveOrders" INTEGER NOT NULL DEFAULT 1,
  "lastLocationAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "application" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rider_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rider_qualifications" (
  "id" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rider_qualifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders"
  ADD COLUMN "taskId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "direction" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "routeId" TEXT,
  ADD COLUMN "passengerCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "unitPriceFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalFeeFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "baseFeeFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "distanceFeeFen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pricingRuleVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "requiresDelivery" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "riderId" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "arrivedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "orders"
SET "totalFeeFen" = ROUND("totalFee" * 100),
    "baseFeeFen" = ROUND("baseFee" * 100),
    "distanceFeeFen" = ROUND("distanceFee" * 100);

CREATE TABLE "order_assignments" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "method" "AssignmentMethod" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "order_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rider_idempotency" (
  "id" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rider_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
  "id" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "carpool_routes_city_key" ON "carpool_routes"("city");
CREATE UNIQUE INDEX "pricing_rules_serviceId_key" ON "pricing_rules"("serviceId");
CREATE UNIQUE INDEX "rider_profiles_openid_key" ON "rider_profiles"("openid");
CREATE UNIQUE INDEX "rider_qualifications_riderId_serviceId_key" ON "rider_qualifications"("riderId", "serviceId");
CREATE UNIQUE INDEX "rider_idempotency_riderId_key_key" ON "rider_idempotency"("riderId", "key");
CREATE INDEX "service_catalog_enabled_sortOrder_idx" ON "service_catalog"("enabled", "sortOrder");
CREATE INDEX "quotes_userId_expiresAt_idx" ON "quotes"("userId", "expiresAt");
CREATE INDEX "rider_profiles_status_online_idx" ON "rider_profiles"("status", "online");
CREATE INDEX "orders_riderId_status_idx" ON "orders"("riderId", "status");
CREATE INDEX "orders_taskId_status_createdAt_idx" ON "orders"("taskId", "status", "createdAt");
CREATE INDEX "order_assignments_orderId_active_idx" ON "order_assignments"("orderId", "active");
CREATE INDEX "order_assignments_riderId_active_idx" ON "order_assignments"("riderId", "active");
CREATE INDEX "rider_idempotency_createdAt_idx" ON "rider_idempotency"("createdAt");
CREATE INDEX "outbox_events_publishedAt_createdAt_idx" ON "outbox_events"("publishedAt", "createdAt");

ALTER TABLE "quotes" ADD CONSTRAINT "quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rider_qualifications" ADD CONSTRAINT "rider_qualifications_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rider_idempotency" ADD CONSTRAINT "rider_idempotency_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
