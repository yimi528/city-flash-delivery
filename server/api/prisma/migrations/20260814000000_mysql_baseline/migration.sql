-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NULL,
    `unionid` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `nickname` VARCHAR(191) NOT NULL,
    `avatarUrl` VARCHAR(191) NOT NULL DEFAULT '',
    `memberLevel` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `role` ENUM('CUSTOMER', 'OPERATOR', 'ADMIN', 'RIDER') NOT NULL DEFAULT 'CUSTOMER',
    `preferredRole` ENUM('CUSTOMER', 'OPERATOR', 'ADMIN', 'RIDER') NOT NULL DEFAULT 'CUSTOMER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_openid_key`(`openid`),
    UNIQUE INDEX `users_unionid_key`(`unionid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operators` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL DEFAULT '',
    `role` ENUM('CUSTOMER', 'OPERATOR', 'ADMIN', 'RIDER') NOT NULL DEFAULT 'OPERATOR',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `operators_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_role_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('CUSTOMER', 'OPERATOR', 'ADMIN', 'RIDER') NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_role_assignments_role_status_idx`(`role`, `status`),
    UNIQUE INDEX `user_role_assignments_userId_role_key`(`userId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `addresses` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `detail` VARCHAR(191) NOT NULL,
    `contact` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `tag` VARCHAR(191) NOT NULL DEFAULT '',
    `city` VARCHAR(191) NOT NULL DEFAULT '',
    `district` VARCHAR(191) NOT NULL DEFAULT '',
    `adcode` VARCHAR(191) NOT NULL DEFAULT '',
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `location` point NULL,
    `mapPoiId` VARCHAR(191) NOT NULL DEFAULT '',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `addresses_userId_idx`(`userId`),
    INDEX `addresses_userId_isDefault_idx`(`userId`, `isDefault`),
    INDEX `addresses_userId_usageCount_lastUsedAt_idx`(`userId`, `usageCount`, `lastUsedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('EBIKE', 'ETRIKE', 'VAN', 'MANUAL') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `capacity` VARCHAR(191) NOT NULL,
    `maxWeightKg` DECIMAL(8, 2) NOT NULL,
    `baseFee` DECIMAL(8, 2) NOT NULL,
    `distanceRate` DECIMAL(8, 2) NOT NULL,
    `weightRate` DECIMAL(8, 2) NOT NULL,
    `vehicleFee` DECIMAL(8, 2) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vehicle_profiles_type_key`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_catalog` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `vehicleType` ENUM('EBIKE', 'ETRIKE', 'VAN', 'MANUAL') NULL,
    `vehicleName` VARCHAR(191) NOT NULL DEFAULT '',
    `passengerCapacity` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_catalog_enabled_sortOrder_idx`(`enabled`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carpool_routes` (
    `id` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `unitPriceFen` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `carpool_routes_city_key`(`city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pricing_rules` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `baseFeeFen` INTEGER NOT NULL,
    `deliveryStartFeeFen` INTEGER NOT NULL DEFAULT 0,
    `includedDistanceMeters` INTEGER NOT NULL DEFAULT 0,
    `perKmFen` INTEGER NOT NULL DEFAULT 0,
    `minimumFeeFen` INTEGER NOT NULL DEFAULT 0,
    `maxDistanceMeters` INTEGER NOT NULL DEFAULT 100000,
    `pricingMode` VARCHAR(191) NOT NULL DEFAULT 'distance',
    `serviceSurchargeFen` INTEGER NOT NULL DEFAULT 0,
    `maxFeeFen` INTEGER NOT NULL DEFAULT 0,
    `weatherMultiplierBps` INTEGER NOT NULL DEFAULT 10000,
    `weatherSurchargeFen` INTEGER NOT NULL DEFAULT 0,
    `parcelPricing` JSON NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pricing_rules_serviceId_key`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_routes` (
    `id` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `originName` VARCHAR(191) NOT NULL DEFAULT '福鼎',
    `destinationName` VARCHAR(191) NOT NULL,
    `priceUnit` ENUM('PER_PERSON', 'PER_ORDER') NOT NULL,
    `unitPriceFen` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_routes_serviceId_enabled_sortOrder_idx`(`serviceId`, `enabled`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotes` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `routeId` VARCHAR(191) NULL,
    `direction` VARCHAR(191) NOT NULL DEFAULT '',
    `passengerCount` INTEGER NOT NULL DEFAULT 1,
    `pickup` JSON NULL,
    `dropoff` JSON NULL,
    `distanceMeters` INTEGER NOT NULL DEFAULT 0,
    `vehicleType` ENUM('EBIKE', 'ETRIKE', 'VAN', 'MANUAL') NULL,
    `vehicleName` VARCHAR(191) NOT NULL DEFAULT '',
    `unitPriceFen` INTEGER NOT NULL DEFAULT 0,
    `baseFeeFen` INTEGER NOT NULL DEFAULT 0,
    `distanceFeeFen` INTEGER NOT NULL DEFAULT 0,
    `weatherFeeFen` INTEGER NOT NULL DEFAULT 0,
    `productFeeFen` INTEGER NOT NULL DEFAULT 0,
    `priceBreakdown` JSON NULL,
    `configVersions` JSON NULL,
    `totalFen` INTEGER NOT NULL,
    `pricingRuleVersion` INTEGER NOT NULL DEFAULT 1,
    `requiresDelivery` BOOLEAN NOT NULL DEFAULT false,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `quotes_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rider_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `openid` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `status` ENUM('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED', 'WITHDRAWN', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `roleStatus` ENUM('ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISABLED') NOT NULL DEFAULT 'SUSPENDED',
    `workStatus` ENUM('OFFLINE', 'ONLINE', 'DELIVERING', 'PAUSED') NOT NULL DEFAULT 'OFFLINE',
    `vehicleType` ENUM('EBIKE', 'ETRIKE', 'VAN', 'MANUAL') NULL,
    `vehicleName` VARCHAR(191) NOT NULL DEFAULT '',
    `handlingQualified` BOOLEAN NOT NULL DEFAULT false,
    `online` BOOLEAN NOT NULL DEFAULT false,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `serviceCity` VARCHAR(191) NOT NULL DEFAULT '宁德市',
    `maxActiveOrders` INTEGER NOT NULL DEFAULT 1,
    `lastSeenAt` DATETIME(3) NULL,
    `lastLocationAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `application` JSON NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rider_profiles_userId_key`(`userId`),
    UNIQUE INDEX `rider_profiles_openid_key`(`openid`),
    INDEX `rider_profiles_status_online_idx`(`status`, `online`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rider_applications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED', 'WITHDRAWN', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `realName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `verificationStatus` VARCHAR(191) NOT NULL DEFAULT 'UNVERIFIED',
    `vehicleType` ENUM('EBIKE', 'ETRIKE', 'VAN', 'MANUAL') NOT NULL,
    `vehicleName` VARCHAR(191) NOT NULL DEFAULT '',
    `vehicleTypes` JSON NULL,
    `statement` VARCHAR(191) NOT NULL DEFAULT '',
    `agreementAccepted` BOOLEAN NOT NULL DEFAULT false,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `reviewedBy` VARCHAR(191) NOT NULL DEFAULT '',
    `rejectionReason` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `rider_applications_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `rider_applications_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rider_status_logs` (
    `id` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NOT NULL,
    `oldStatus` ENUM('ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISABLED') NOT NULL,
    `newStatus` ENUM('ACTIVE', 'SUSPENDED', 'RESIGNED', 'DISABLED') NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `operatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rider_status_logs_riderId_createdAt_idx`(`riderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rider_vehicles` (
    `id` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NOT NULL,
    `vehicleType` ENUM('EBIKE', 'ETRIKE', 'VAN', 'MANUAL') NOT NULL,
    `vehicleName` VARCHAR(191) NOT NULL DEFAULT '',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `verified` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `rider_vehicles_riderId_enabled_verified_idx`(`riderId`, `enabled`, `verified`),
    UNIQUE INDEX `rider_vehicles_riderId_vehicleType_key`(`riderId`, `vehicleType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rider_qualifications` (
    `id` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rider_qualifications_riderId_serviceId_key`(`riderId`, `serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `serviceType` ENUM('DELIVERY', 'PICKUP', 'CARGO', 'BUY_FOR_ME', 'CARPOOL', 'MOVING', 'HANDLING') NOT NULL,
    `serviceName` VARCHAR(191) NOT NULL DEFAULT '',
    `taskId` VARCHAR(191) NOT NULL DEFAULT '',
    `direction` VARCHAR(191) NOT NULL DEFAULT '',
    `routeId` VARCHAR(191) NULL,
    `passengerCount` INTEGER NOT NULL DEFAULT 1,
    `unitPriceFen` INTEGER NOT NULL DEFAULT 0,
    `totalFeeFen` INTEGER NOT NULL DEFAULT 0,
    `baseFeeFen` INTEGER NOT NULL DEFAULT 0,
    `distanceFeeFen` INTEGER NOT NULL DEFAULT 0,
    `pricingRuleVersion` INTEGER NOT NULL DEFAULT 1,
    `requiresDelivery` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PENDING', 'ACCEPTED', 'PICKING_UP', 'DELIVERING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `paymentStatus` ENUM('UNPAID', 'PAID', 'REFUNDED', 'CLOSED', 'REFUNDING') NOT NULL DEFAULT 'UNPAID',
    `pickupName` VARCHAR(191) NOT NULL,
    `pickupDetail` VARCHAR(191) NOT NULL,
    `pickupContact` VARCHAR(191) NOT NULL,
    `pickupPhone` VARCHAR(191) NOT NULL,
    `pickupLat` DECIMAL(10, 7) NULL,
    `pickupLng` DECIMAL(10, 7) NULL,
    `pickupLocation` point NULL,
    `dropoffName` VARCHAR(191) NOT NULL,
    `dropoffDetail` VARCHAR(191) NOT NULL,
    `dropoffContact` VARCHAR(191) NOT NULL,
    `dropoffPhone` VARCHAR(191) NOT NULL,
    `dropoffLat` DECIMAL(10, 7) NULL,
    `dropoffLng` DECIMAL(10, 7) NULL,
    `dropoffLocation` point NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `buyItems` VARCHAR(191) NOT NULL DEFAULT '',
    `weightKg` DECIMAL(8, 2) NOT NULL,
    `distanceKm` DECIMAL(8, 2) NOT NULL,
    `vehicleType` ENUM('EBIKE', 'ETRIKE', 'VAN', 'MANUAL') NOT NULL DEFAULT 'EBIKE',
    `vehicleName` VARCHAR(191) NOT NULL DEFAULT '',
    `vehicleId` VARCHAR(191) NULL,
    `riderId` VARCHAR(191) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `arrivedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `pricingMode` VARCHAR(191) NOT NULL DEFAULT 'distance',
    `isManualQuote` BOOLEAN NOT NULL DEFAULT false,
    `quotedFee` DECIMAL(8, 2) NULL,
    `quoteStatus` ENUM('NONE', 'PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'NONE',
    `quoteNote` VARCHAR(191) NOT NULL DEFAULT '',
    `quoteUpdatedAt` DATETIME(3) NULL,
    `quoteRespondedAt` DATETIME(3) NULL,
    `baseFee` DECIMAL(8, 2) NOT NULL,
    `distanceFee` DECIMAL(8, 2) NOT NULL,
    `weightFee` DECIMAL(8, 2) NOT NULL,
    `vehicleFee` DECIMAL(8, 2) NOT NULL,
    `discountFee` DECIMAL(8, 2) NOT NULL,
    `productFee` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `deliveryFee` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `estimatedFee` DECIMAL(8, 2) NOT NULL DEFAULT 0,
    `totalFee` DECIMAL(8, 2) NOT NULL,
    `remark` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_orderNo_key`(`orderNo`),
    INDEX `orders_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `orders_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `orders_riderId_status_idx`(`riderId`, `status`),
    INDEX `orders_taskId_status_createdAt_idx`(`taskId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NOT NULL,
    `method` ENUM('CLAIM', 'OPERATOR') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdBy` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    INDEX `order_assignments_orderId_active_idx`(`orderId`, `active`),
    INDEX `order_assignments_riderId_active_idx`(`riderId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rider_idempotency` (
    `id` VARCHAR(191) NOT NULL,
    `riderId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `result` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rider_idempotency_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `rider_idempotency_riderId_key_key`(`riderId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_events` (
    `id` VARCHAR(191) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `outbox_events_publishedAt_createdAt_idx`(`publishedAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_records` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `outTradeNo` VARCHAR(191) NOT NULL,
    `status` ENUM('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CLOSED', 'REFUNDING', 'REFUNDED') NOT NULL DEFAULT 'CREATED',
    `amountFen` INTEGER NOT NULL,
    `prepayId` VARCHAR(191) NOT NULL DEFAULT '',
    `transactionId` VARCHAR(191) NOT NULL DEFAULT '',
    `payerOpenid` VARCHAR(191) NOT NULL DEFAULT '',
    `rawNotify` JSON NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_records_orderId_key`(`orderId`),
    UNIQUE INDEX `payment_records_outTradeNo_key`(`outTradeNo`),
    INDEX `payment_records_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refund_records` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `outRefundNo` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL DEFAULT '',
    `status` ENUM('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CLOSED') NOT NULL DEFAULT 'CREATED',
    `amountFen` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL DEFAULT '',
    `rawNotify` JSON NULL,
    `successAt` DATETIME(3) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `refund_records_paymentId_key`(`paymentId`),
    UNIQUE INDEX `refund_records_orderId_key`(`orderId`),
    UNIQUE INDEX `refund_records_outRefundNo_key`(`outRefundNo`),
    INDEX `refund_records_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_reconciliations` (
    `id` VARCHAR(191) NOT NULL,
    `billDate` DATE NOT NULL,
    `outTradeNo` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL DEFAULT '',
    `tradeState` VARCHAR(191) NOT NULL DEFAULT '',
    `amountFen` INTEGER NOT NULL DEFAULT 0,
    `refundAmountFen` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('MATCHED', 'MISSING_LOCAL', 'AMOUNT_MISMATCH', 'REFUND_MISMATCH') NOT NULL,
    `paymentId` VARCHAR(191) NULL,
    `rawBill` JSON NULL,
    `reconciledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payment_reconciliations_status_billDate_idx`(`status`, `billDate`),
    UNIQUE INDEX `payment_reconciliations_billDate_outTradeNo_key`(`billDate`, `outTradeNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_status_logs` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'PICKING_UP', 'DELIVERING', 'COMPLETED', 'CANCELLED') NOT NULL,
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `createdBy` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_status_logs_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_areas` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `boundaryGeoJson` JSON NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `boundary` polygon NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_area_bindings` (
    `id` VARCHAR(191) NOT NULL,
    `serviceAreaId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_area_bindings_serviceId_idx`(`serviceId`),
    UNIQUE INDEX `service_area_bindings_serviceAreaId_serviceId_key`(`serviceAreaId`, `serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_coverage_policies` (
    `serviceId` VARCHAR(191) NOT NULL,
    `enforcementEnabled` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`serviceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'platform',
    `acceptingOrders` BOOLEAN NOT NULL DEFAULT true,
    `closureReason` VARCHAR(191) NOT NULL DEFAULT '',
    `timeZone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Shanghai',
    `weeklyHours` JSON NOT NULL,
    `customerServicePhone` VARCHAR(191) NOT NULL DEFAULT '',
    `announcementEnabled` BOOLEAN NOT NULL DEFAULT false,
    `announcementTitle` VARCHAR(191) NOT NULL DEFAULT '',
    `announcementContent` VARCHAR(191) NOT NULL DEFAULT '',
    `quoteValidityMinutes` INTEGER NOT NULL DEFAULT 10,
    `riderOrderRadiusMeters` INTEGER NOT NULL DEFAULT 30000,
    `riderMaxActiveOrders` INTEGER NOT NULL DEFAULT 1,
    `allowCancelBeforeClaim` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_drafts` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('PRICING', 'SERVICE_AREA', 'SYSTEM') NOT NULL,
    `baseVersion` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `config_drafts_category_key`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_revisions` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('PRICING', 'SERVICE_AREA', 'SYSTEM') NOT NULL,
    `version` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `publishedBy` VARCHAR(191) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `config_revisions_category_publishedAt_idx`(`category`, `publishedAt`),
    UNIQUE INDEX `config_revisions_category_version_key`(`category`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorRole` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `resourceType` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `audit_logs_action_createdAt_idx`(`action`, `createdAt`),
    INDEX `audit_logs_resourceType_resourceId_createdAt_idx`(`resourceType`, `resourceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rider_profiles` ADD CONSTRAINT `rider_profiles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rider_applications` ADD CONSTRAINT `rider_applications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rider_applications` ADD CONSTRAINT `rider_applications_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rider_status_logs` ADD CONSTRAINT `rider_status_logs_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rider_vehicles` ADD CONSTRAINT `rider_vehicles_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rider_qualifications` ADD CONSTRAINT `rider_qualifications_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicle_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_assignments` ADD CONSTRAINT `order_assignments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_assignments` ADD CONSTRAINT `order_assignments_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rider_idempotency` ADD CONSTRAINT `rider_idempotency_riderId_fkey` FOREIGN KEY (`riderId`) REFERENCES `rider_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_records` ADD CONSTRAINT `refund_records_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payment_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_records` ADD CONSTRAINT `refund_records_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_reconciliations` ADD CONSTRAINT `payment_reconciliations_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payment_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_status_logs` ADD CONSTRAINT `order_status_logs_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_area_bindings` ADD CONSTRAINT `service_area_bindings_serviceAreaId_fkey` FOREIGN KEY (`serviceAreaId`) REFERENCES `service_areas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
