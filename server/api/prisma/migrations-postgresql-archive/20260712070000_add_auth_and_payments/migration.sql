CREATE TYPE "PaymentRecordStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CLOSED');

ALTER TABLE "operators"
  ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE TABLE "payment_records" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "outTradeNo" TEXT NOT NULL,
  "status" "PaymentRecordStatus" NOT NULL DEFAULT 'CREATED',
  "amountFen" INTEGER NOT NULL,
  "prepayId" TEXT NOT NULL DEFAULT '',
  "transactionId" TEXT NOT NULL DEFAULT '',
  "payerOpenid" TEXT NOT NULL DEFAULT '',
  "rawNotify" JSONB,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_records_orderId_key" ON "payment_records"("orderId");
CREATE UNIQUE INDEX "payment_records_outTradeNo_key" ON "payment_records"("outTradeNo");
CREATE INDEX "payment_records_status_createdAt_idx" ON "payment_records"("status", "createdAt");

ALTER TABLE "payment_records"
  ADD CONSTRAINT "payment_records_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
