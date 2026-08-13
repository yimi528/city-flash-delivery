CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'MISSING_LOCAL', 'AMOUNT_MISMATCH', 'REFUND_MISMATCH');

CREATE TABLE "payment_reconciliations" (
  "id" TEXT NOT NULL,
  "billDate" DATE NOT NULL,
  "outTradeNo" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL DEFAULT '',
  "tradeState" TEXT NOT NULL DEFAULT '',
  "amountFen" INTEGER NOT NULL DEFAULT 0,
  "refundAmountFen" INTEGER NOT NULL DEFAULT 0,
  "status" "ReconciliationStatus" NOT NULL,
  "paymentId" TEXT,
  "rawBill" JSONB,
  "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_reconciliations_billDate_outTradeNo_key"
  ON "payment_reconciliations"("billDate", "outTradeNo");
CREATE INDEX "payment_reconciliations_status_billDate_idx"
  ON "payment_reconciliations"("status", "billDate");

ALTER TABLE "payment_reconciliations"
  ADD CONSTRAINT "payment_reconciliations_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payment_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
