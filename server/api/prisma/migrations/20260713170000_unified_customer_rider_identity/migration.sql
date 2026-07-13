-- A customer account can gain rider capabilities without creating a second login.
ALTER TYPE "RiderStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
ALTER TYPE "RiderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TYPE "RoleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISABLED');
CREATE TYPE "RiderWorkStatus" AS ENUM ('OFFLINE', 'ONLINE', 'DELIVERING', 'PAUSED');

CREATE TABLE "user_role_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "status" "RoleStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "rider_profiles"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "roleStatus" "RoleStatus" NOT NULL DEFAULT 'SUSPENDED',
  ADD COLUMN "workStatus" "RiderWorkStatus" NOT NULL DEFAULT 'OFFLINE';

ALTER TABLE "users" ADD COLUMN "preferredRole" "UserRole" NOT NULL DEFAULT 'CUSTOMER';

CREATE TABLE "rider_applications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "riderId" TEXT,
  "status" "RiderStatus" NOT NULL DEFAULT 'PENDING',
  "realName" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "vehicleType" "VehicleType" NOT NULL,
  "vehicleName" TEXT NOT NULL DEFAULT '',
  "statement" TEXT NOT NULL DEFAULT '',
  "agreementAccepted" BOOLEAN NOT NULL DEFAULT false,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT NOT NULL DEFAULT '',
  "rejectionReason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rider_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rider_status_logs" (
  "id" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "oldStatus" "RoleStatus" NOT NULL,
  "newStatus" "RoleStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "operatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rider_status_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- These constraints must exist before the idempotent role backfill below.
CREATE UNIQUE INDEX "user_role_assignments_userId_role_key" ON "user_role_assignments"("userId", "role");
CREATE UNIQUE INDEX "rider_profiles_userId_key" ON "rider_profiles"("userId");

UPDATE "rider_profiles" AS rider
SET "userId" = users."id"
FROM "users" AS users
WHERE rider."userId" IS NULL AND rider."openid" IS NOT NULL AND rider."openid" = users."openid";

UPDATE "rider_profiles"
SET "roleStatus" = CASE
  WHEN "status" = 'APPROVED' THEN 'ACTIVE'::"RoleStatus"
  WHEN "status" = 'SUSPENDED' THEN 'SUSPENDED'::"RoleStatus"
  ELSE 'SUSPENDED'::"RoleStatus"
END;

INSERT INTO "user_role_assignments" ("id", "userId", "role", "status", "createdAt", "updatedAt")
SELECT 'ura_' || users."id" || '_customer', users."id", 'CUSTOMER'::"UserRole", 'ACTIVE'::"RoleStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" AS users
ON CONFLICT ("userId", "role") DO NOTHING;

INSERT INTO "user_role_assignments" ("id", "userId", "role", "status", "createdAt", "updatedAt")
SELECT 'ura_' || rider."userId" || '_rider', rider."userId", 'RIDER'::"UserRole",
  CASE WHEN rider."roleStatus" = 'ACTIVE'::"RoleStatus" THEN 'ACTIVE'::"RoleStatus" ELSE 'SUSPENDED'::"RoleStatus" END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "rider_profiles" AS rider
WHERE rider."userId" IS NOT NULL
ON CONFLICT ("userId", "role") DO UPDATE SET "status" = EXCLUDED."status", "updatedAt" = CURRENT_TIMESTAMP;

CREATE INDEX "user_role_assignments_role_status_idx" ON "user_role_assignments"("role", "status");
CREATE INDEX "rider_profiles_roleStatus_workStatus_idx" ON "rider_profiles"("roleStatus", "workStatus");
CREATE INDEX "rider_applications_userId_createdAt_idx" ON "rider_applications"("userId", "createdAt");
CREATE INDEX "rider_applications_status_createdAt_idx" ON "rider_applications"("status", "createdAt");
CREATE UNIQUE INDEX "rider_applications_one_pending_per_user_key" ON "rider_applications"("userId") WHERE "status" = 'PENDING';
CREATE INDEX "rider_status_logs_riderId_createdAt_idx" ON "rider_status_logs"("riderId", "createdAt");
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rider_profiles" ADD CONSTRAINT "rider_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rider_status_logs" ADD CONSTRAINT "rider_status_logs_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
