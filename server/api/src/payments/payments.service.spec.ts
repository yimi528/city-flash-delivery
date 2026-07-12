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
  }
  const orderApi = {
    findFirst: jest.fn(),
    update: jest.fn(),
  }
  const prisma = {
    paymentRecord: paymentApi,
    order: orderApi,
    outboxEvent: { create: jest.fn() },
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  }
  const config = {
    get: jest.fn((key: string) => ({ NODE_ENV: 'development', WECHAT_PAY_MOCK_ENABLED: 'true' })[key]),
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
    expect(paymentApi.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ amountFen: 1300, status: PaymentRecordStatus.PENDING }),
    }))
  })

  it('confirms a mock payment and marks the order paid', async () => {
    orderApi.findFirst.mockResolvedValue(order({
      payment: { id: 'payment-1', status: PaymentRecordStatus.PENDING, paidAt: null, amountFen: 1300 },
    }))
    paymentApi.update.mockResolvedValue({ id: 'payment-1', status: PaymentRecordStatus.SUCCEEDED, paidAt: now })
    orderApi.update.mockResolvedValue({ id: 'order-1', paymentStatus: PaymentStatus.PAID })

    const result = await service.confirmMockPayment('order-1', 'user-1')

    expect(result.paymentStatus).toBe(PaymentStatus.PAID)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('requires quote acceptance before manual service payment', async () => {
    orderApi.findFirst.mockResolvedValue(order({ isManualQuote: true, quoteStatus: QuoteStatus.QUOTED }))

    await expect(service.createPrepay('order-1', 'user-1')).rejects.toBeInstanceOf(ConflictException)
    expect(paymentApi.upsert).not.toHaveBeenCalled()
  })

  it('prevents payment after an order is cancelled', async () => {
    orderApi.findFirst.mockResolvedValue(order({ status: OrderStatus.CANCELLED }))

    await expect(service.createPrepay('order-1', 'user-1'))
      .rejects.toThrow('已取消订单不能支付')
    expect(paymentApi.upsert).not.toHaveBeenCalled()
  })
})
