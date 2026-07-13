ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDING';
ALTER TYPE "PaymentRecordStatus" ADD VALUE 'REFUNDING';
ALTER TYPE "PaymentRecordStatus" ADD VALUE 'REFUNDED';

CREATE TYPE "RefundRecordStatus" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CLOSED');

CREATE TABLE "refund_records" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "outRefundNo" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL DEFAULT '',
  "status" "RefundRecordStatus" NOT NULL DEFAULT 'CREATED',
  "amountFen" INTEGER NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "rawNotify" JSONB,
  "successAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "refund_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refund_records_paymentId_key" ON "refund_records"("paymentId");
CREATE UNIQUE INDEX "refund_records_orderId_key" ON "refund_records"("orderId");
CREATE UNIQUE INDEX "refund_records_outRefundNo_key" ON "refund_records"("outRefundNo");
CREATE INDEX "refund_records_status_createdAt_idx" ON "refund_records"("status", "createdAt");

ALTER TABLE "refund_records"
  ADD CONSTRAINT "refund_records_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refund_records"
  ADD CONSTRAINT "refund_records_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
