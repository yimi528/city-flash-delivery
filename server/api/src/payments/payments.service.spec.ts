/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common'
import { OrderStatus, PaymentRecordStatus, PaymentStatus, QuoteStatus } from '@prisma/client'
import { PaymentsService } from './payments.service'

const now = new Date('2026-07-12T00:00:00.000Z')

function order(overrides = {}) {
  return {
    id: 'order-1',
    orderNo: 'N202607120001',
    userId: 'user-1',
    serviceName: '急送',
    status: OrderStatus.PENDING,
    totalFee: 13,
    paymentStatus: PaymentStatus.UNPAID,
    isManualQuote: false,
    quoteStatus: QuoteStatus.NONE,
    user: { id: 'user-1', openid: 'openid-1' },
    payment: null,
    ...overrides,
  }
}

describe('PaymentsService development flow', () => {
  const paymentApi = {
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  }
  const orderApi = {
    findFirst: jest.fn(),
    update: jest.fn(),
  }
  const prisma = {
    paymentRecord: paymentApi,
    order: orderApi,
    refundRecord: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    paymentReconciliation: { upsert: jest.fn() },
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  }
  const config = {
    get: jest.fn(
      (key: string) => ({ NODE_ENV: 'development', WECHAT_PAY_MOCK_ENABLED: 'true' })[key],
    ),
  }
  const service = new PaymentsService(prisma as never, config as never)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a mock prepay record without marking the order paid', async () => {
    orderApi.findFirst.mockResolvedValue(order())
    paymentApi.upsert.mockResolvedValue({ id: 'payment-1', status: PaymentRecordStatus.PENDING })

    const result = await service.createPrepay('order-1', 'user-1')

    expect(result).toEqual(expect.objectContaining({ mode: 'mock', amountFen: 1300 }))
    expect(paymentApi.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ amountFen: 1300, status: PaymentRecordStatus.PENDING }),
      }),
    )
  })

  it('confirms a mock payment and marks the order paid', async () => {
    orderApi.findFirst.mockResolvedValue(
      order({
        payment: {
          id: 'payment-1',
          status: PaymentRecordStatus.PENDING,
          paidAt: null,
          amountFen: 1300,
        },
      }),
    )
    paymentApi.update.mockResolvedValue({
      id: 'payment-1',
      status: PaymentRecordStatus.SUCCEEDED,
      paidAt: now,
    })
    orderApi.update.mockResolvedValue({ id: 'order-1', paymentStatus: PaymentStatus.PAID })

    const result = await service.confirmMockPayment('order-1', 'user-1')

    expect(result.paymentStatus).toBe(PaymentStatus.PAID)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('allows mock payments in a production runtime only during the testing release stage', async () => {
    const testingConfig = {
      get: jest.fn((key: string) => ({
        NODE_ENV: 'production',
        APP_RELEASE_STAGE: 'testing',
        WECHAT_PAY_MODE: 'mock',
        WECHAT_PAY_MOCK_ENABLED: 'true',
      })[key]),
    }
    orderApi.findFirst.mockResolvedValue(order())
    paymentApi.upsert.mockResolvedValue({ id: 'payment-1', status: PaymentRecordStatus.PENDING })
    const testingService = new PaymentsService(prisma as never, testingConfig as never)

    await expect(testingService.createPrepay('order-1', 'user-1')).resolves.toEqual(
      expect.objectContaining({ mode: 'mock' }),
    )
  })

  it('blocks online payment when payment mode is disabled', async () => {
    const disabledConfig = {
      get: jest.fn((key: string) => ({
        NODE_ENV: 'production',
        APP_RELEASE_STAGE: 'production',
        WECHAT_PAY_MODE: 'disabled',
        WECHAT_PAY_MOCK_ENABLED: 'false',
      })[key]),
    }
    orderApi.findFirst.mockResolvedValue(order())
    const disabledService = new PaymentsService(prisma as never, disabledConfig as never)

    await expect(disabledService.createPrepay('order-1', 'user-1')).rejects.toThrow(
      '暂未开通在线支付',
    )
  })

  it('requires quote acceptance before manual service payment', async () => {
    orderApi.findFirst.mockResolvedValue(
      order({ isManualQuote: true, quoteStatus: QuoteStatus.QUOTED }),
    )

    await expect(service.createPrepay('order-1', 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(paymentApi.upsert).not.toHaveBeenCalled()
  })

  it('prevents payment after an order is cancelled', async () => {
    orderApi.findFirst.mockResolvedValue(order({ status: OrderStatus.CANCELLED }))

    await expect(service.createPrepay('order-1', 'user-1')).rejects.toThrow('已取消订单不能支付')
    expect(paymentApi.upsert).not.toHaveBeenCalled()
  })

  it('starts one real refund and leaves processing refunds idempotent', async () => {
    const realConfig = {
      get: jest.fn(
        (key: string) => ({ NODE_ENV: 'production', WECHAT_PAY_MODE: 'wechat', WECHAT_PAY_MOCK_ENABLED: 'false' })[key],
      ),
    }
    const realOrder = order({
      paymentStatus: PaymentStatus.PAID,
      payment: {
        id: 'payment-1',
        status: PaymentRecordStatus.SUCCEEDED,
        amountFen: 1300,
        transactionId: 'wx-transaction-1',
        refunds: [],
      },
    })
    orderApi.findFirst.mockResolvedValue(realOrder)
    prisma.refundRecord.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'refund-1',
      status: 'PROCESSING',
      outRefundNo: 'RF-N202607120001',
      reason: '用户取消订单',
    })
    prisma.refundRecord.upsert.mockResolvedValue({
      id: 'refund-1',
      outRefundNo: 'RF-N202607120001',
      reason: '用户取消订单',
    })
    const realService = new PaymentsService(prisma as never, realConfig as never)
    const requestRefund = jest.spyOn(realService as any, 'requestWechatRefund')
    requestRefund.mockResolvedValue({
      out_refund_no: 'RF-N202607120001',
      refund_status: 'PROCESSING',
    })
    const persistRefund = jest.spyOn(realService as any, 'persistRefundResult')
    persistRefund.mockResolvedValue(undefined)

    await expect(realService.refundForCancellation('order-1', 'user-1')).resolves.toEqual({
      paymentStatus: PaymentStatus.REFUNDING,
    })
    await expect(realService.refundForCancellation('order-1', 'user-1')).resolves.toEqual({
      paymentStatus: PaymentStatus.REFUNDING,
    })
    expect(requestRefund).toHaveBeenCalledTimes(1)

    requestRefund.mockRestore()
    persistRefund.mockRestore()
  })

  it('acknowledges duplicate successful refund callbacks without changing state again', async () => {
    const refundRecord = { id: 'refund-1', status: 'SUCCEEDED', amountFen: 1300 }
    prisma.refundRecord.findUnique.mockResolvedValue(refundRecord)
    const verifyNotification = jest.spyOn(service as any, 'verifyWechatNotification')
    verifyNotification.mockImplementation(() => undefined)
    const decryptResource = jest.spyOn(service as any, 'decryptWechatResource')
    decryptResource.mockReturnValue({
      out_refund_no: 'RF-N202607120001',
      refund_status: 'SUCCESS',
      amount: { refund: 1300 },
    })

    const result = await service.handleWechatRefundNotification('{}', {
      timestamp: '1700000000',
      nonce: 'nonce',
      signature: 'signature',
      serial: 'serial',
    })

    expect(result).toEqual({ code: 'SUCCESS', message: '成功' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    verifyNotification.mockRestore()
    decryptResource.mockRestore()
  })

  it('reconciles bill rows into explicit mismatch statuses', async () => {
    const downloadBill = jest.spyOn(service as any, 'downloadTradeBill')
    downloadBill.mockResolvedValue({
      billDate: '2026-07-13',
      records: [
        {
          商户订单号: 'CF-MATCH',
          微信订单号: 'wx-1',
          交易状态: '支付成功',
          订单金额: '13.00',
          退款金额: '0.00',
        },
        {
          商户订单号: 'CF-MISSING',
          微信订单号: 'wx-2',
          交易状态: '支付成功',
          订单金额: '8.00',
          退款金额: '0.00',
        },
      ],
    })
    paymentApi.findUnique
      .mockResolvedValueOnce({
        id: 'payment-1',
        amountFen: 1300,
        status: PaymentRecordStatus.SUCCEEDED,
      })
      .mockResolvedValueOnce(null)
    prisma.paymentReconciliation.upsert.mockResolvedValue({})

    const result = await service.reconcileTradeBill('2026-07-13')

    expect(result).toEqual({
      billDate: '2026-07-13',
      total: 2,
      counts: { MATCHED: 1, MISSING_LOCAL: 1, AMOUNT_MISMATCH: 0, REFUND_MISMATCH: 0 },
    })
    expect(prisma.paymentReconciliation.upsert).toHaveBeenCalledTimes(2)
    downloadBill.mockRestore()
  })
})
