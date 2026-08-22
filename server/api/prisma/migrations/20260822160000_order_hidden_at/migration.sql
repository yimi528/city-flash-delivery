ALTER TABLE `orders` ADD COLUMN `hiddenAt` DATETIME(3) NULL;

CREATE INDEX `orders_userId_hiddenAt_createdAt_idx` ON `orders`(`userId`, `hiddenAt`, `createdAt`);
