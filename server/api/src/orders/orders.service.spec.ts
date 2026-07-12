import { ConflictException } from '@nestjs/common'
import { OrderStatus, PaymentStatus, QuoteStatus, ServiceType, VehicleType } from '@prisma/client'
import { PricingService } from '../pricing/pricing.service'
import { OrdersService } from './orders.service'

function manualQuoteOrder(quoteStatus: QuoteStatus = QuoteStatus.QUOTED) {
  const now = new Date('2026-07-11T09:00:00.000Z')
  return {
    id: 'N202607110001',
    orderNo: 'N202607110001',
    userId: 'demo-user',
    serviceType: ServiceType.CARGO,
    serviceName: '搬运装卸',
    status: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PAID,
    pickupName: '取货地址',
    pickupDetail: '取货详情',
    pickupContact: '联系人',
    pickupPhone: '13800000000',
    pickupLat: null,
    pickupLng: null,
    dropoffName: '收货地址',
    dropoffDetail: '收货详情',
    dropoffContact: '联系人',
    dropoffPhone: '13800000001',
    dropoffLat: null,
    dropoffLng: null,
    itemName: '搬家/搬店',
    buyItems: '',
    weightKg: 1,
    distanceKm: 2.5,
    vehicleType: VehicleType.ETRIKE,
    vehicleName: '货三轮车',
    vehicleId: null,
    vehicle: null,
    pricingMode: 'manual_quote',
    isManualQuote: true,
    quotedFee: 72,
    quoteStatus,
    quoteNote: '根据搬运楼层报价',
    quoteUpdatedAt: now,
    quoteRespondedAt: null,
    baseFee: 58,
    distanceFee: 0,
    weightFee: 0,
    vehicleFee: 0,
    discountFee: 0,
    productFee: 0,
    deliveryFee: 58,
    estimatedFee: 58,
    totalFee: 72,
    remark: '',
    createdAt: now,
    updatedAt: now,
  }
}

describe('OrdersService quote confirmation', () => {
  const orderApi = {
    findFirst: jest.fn(),
    update: jest.fn(),
  }
  const paymentRecordApi = { findUnique: jest.fn(), updateMany: jest.fn() }
  const prisma = {
    order: orderApi,
    paymentRecord: paymentRecordApi,
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  }
  const service = new OrdersService(new PricingService(), prisma as never)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('blocks fulfillment before the user accepts the merchant quote', async () => {
    orderApi.findFirst.mockResolvedValue(manualQuoteOrder())

    await expect(service.updateStatus('N202607110001', { status: OrderStatus.ACCEPTED }))
      .rejects.toBeInstanceOf(ConflictException)
    expect(orderApi.update).not.toHaveBeenCalled()
  })

  it('records user acceptance and then allows fulfillment', async () => {
    const quoted = manualQuoteOrder()
    const accepted = { ...quoted, quoteStatus: QuoteStatus.ACCEPTED, quoteRespondedAt: new Date() }
    orderApi.findFirst.mockResolvedValueOnce(quoted).mockResolvedValueOnce(accepted)
    orderApi.update.mockResolvedValueOnce(accepted).mockResolvedValueOnce({
      ...accepted,
      status: OrderStatus.ACCEPTED,
    })

    const confirmed = await service.confirmQuote(quoted.id, {})
    expect(confirmed.quoteStatus).toBe(QuoteStatus.ACCEPTED)
    expect(orderApi.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ quoteStatus: QuoteStatus.ACCEPTED }),
    }))

    const progressed = await service.updateStatus(quoted.id, { status: OrderStatus.ACCEPTED })
    expect(progressed.status).toBe(OrderStatus.ACCEPTED)
  })

  it('blocks fulfillment until the accepted order is paid', async () => {
    const unpaid = {
      ...manualQuoteOrder(QuoteStatus.ACCEPTED),
      paymentStatus: PaymentStatus.UNPAID,
    }
    orderApi.findFirst.mockResolvedValue(unpaid)

    await expect(service.updateStatus(unpaid.id, { status: OrderStatus.ACCEPTED }))
      .rejects.toThrow('订单尚未支付')
    expect(orderApi.update).not.toHaveBeenCalled()
  })

  it('persists customer cancellation and closes unpaid payment attempts', async () => {
    const pending = {
      ...manualQuoteOrder(QuoteStatus.PENDING),
      paymentStatus: PaymentStatus.UNPAID,
    }
    const cancelled = {
      ...pending,
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.CLOSED,
    }
    orderApi.findFirst.mockResolvedValue(pending)
    orderApi.update.mockResolvedValue(cancelled)
    paymentRecordApi.updateMany.mockResolvedValue({ count: 0 })

    const result = await service.cancel(pending.id, pending.userId)

    expect(result).toEqual(expect.objectContaining({
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.CLOSED,
      businessStatusText: '已取消',
    }))
    expect(orderApi.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.CLOSED }),
    }))
  })

  it('requires paid cancellations to enter the refund process', async () => {
    orderApi.findFirst.mockResolvedValue(manualQuoteOrder(QuoteStatus.ACCEPTED))
    paymentRecordApi.findUnique.mockResolvedValue(null)

    await expect(service.cancel('N202607110001', 'demo-user'))
      .rejects.toThrow('微信退款接口')
    expect(orderApi.update).not.toHaveBeenCalled()
  })

  it('automatically refunds a mock payment before merchant acceptance', async () => {
    const paid = manualQuoteOrder(QuoteStatus.ACCEPTED)
    const cancelled = {
      ...paid,
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
    }
    orderApi.findFirst.mockResolvedValue(paid)
    paymentRecordApi.findUnique.mockResolvedValue({ transactionId: 'MOCK-123' })
    orderApi.update.mockResolvedValue(cancelled)
    paymentRecordApi.updateMany.mockResolvedValue({ count: 0 })

    const result = await service.cancel(paid.id, paid.userId)

    expect(result).toEqual(expect.objectContaining({
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      businessStatusText: '已取消',
    }))
  })

  it('returns the same business status used by customer and merchant clients', async () => {
    const unpaid = {
      ...manualQuoteOrder(QuoteStatus.ACCEPTED),
      paymentStatus: PaymentStatus.UNPAID,
    }
    orderApi.findFirst.mockResolvedValueOnce(unpaid).mockResolvedValueOnce({
      ...unpaid,
      paymentStatus: PaymentStatus.PAID,
    })

    const awaitingPayment = await service.findById(unpaid.id)
    const awaitingAcceptance = await service.findById(unpaid.id)

    expect(awaitingPayment).toEqual(expect.objectContaining({
      businessStatus: 'AWAITING_PAYMENT',
      businessStatusText: '待支付',
    }))
    expect(awaitingAcceptance).toEqual(expect.objectContaining({
      businessStatus: 'PENDING',
      businessStatusText: '待接单',
    }))
  })

  it('uses service-specific progress labels without changing persisted statuses', async () => {
    orderApi.findFirst
      .mockResolvedValueOnce({
        ...manualQuoteOrder(QuoteStatus.ACCEPTED),
        status: OrderStatus.PICKING_UP,
      })
      .mockResolvedValueOnce({
        ...manualQuoteOrder(QuoteStatus.ACCEPTED),
        serviceName: '拼车',
        status: OrderStatus.DELIVERING,
      })

    const moving = await service.findById('moving-order')
    const passenger = await service.findById('passenger-order')

    expect(moving).toEqual(expect.objectContaining({
      status: OrderStatus.PICKING_UP,
      businessStatusText: '上门途中',
    }))
    expect(passenger).toEqual(expect.objectContaining({
      status: OrderStatus.DELIVERING,
      businessStatusText: '行程中',
    }))
  })

  it('returns a rejected quote to the merchant for repricing', async () => {
    const quoted = manualQuoteOrder()
    const rejected = { ...quoted, quoteStatus: QuoteStatus.REJECTED, quoteRespondedAt: new Date() }
    orderApi.findFirst.mockResolvedValue(quoted)
    orderApi.update.mockResolvedValue(rejected)

    const result = await service.rejectQuote(quoted.id, {})

    expect(result.quoteStatus).toBe(QuoteStatus.REJECTED)
    expect(orderApi.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quoteStatus: QuoteStatus.REJECTED }),
    }))
  })

  it('prevents skipping or reversing fulfillment statuses', async () => {
    const accepted = { ...manualQuoteOrder(QuoteStatus.ACCEPTED), status: OrderStatus.PENDING }
    orderApi.findFirst.mockResolvedValue(accepted)

    await expect(service.updateStatus(accepted.id, { status: OrderStatus.DELIVERING }))
      .rejects.toThrow('订单状态必须按接单、取货、配送、完成的顺序更新')
    expect(orderApi.update).not.toHaveBeenCalled()
  })

  it('prevents updates after an order is completed', async () => {
    const completed = { ...manualQuoteOrder(QuoteStatus.ACCEPTED), status: OrderStatus.COMPLETED }
    orderApi.findFirst.mockResolvedValue(completed)

    await expect(service.updateStatus(completed.id, { status: OrderStatus.ACCEPTED }))
      .rejects.toThrow('订单已结束')
    expect(orderApi.update).not.toHaveBeenCalled()
  })

  it('advances through the complete fulfillment flow in order', async () => {
    const base = manualQuoteOrder(QuoteStatus.ACCEPTED)
    const statuses = [
      OrderStatus.PENDING,
      OrderStatus.ACCEPTED,
      OrderStatus.PICKING_UP,
      OrderStatus.DELIVERING,
      OrderStatus.COMPLETED,
    ]
    for (let index = 0; index < statuses.length - 1; index += 1) {
      orderApi.findFirst.mockResolvedValueOnce({ ...base, status: statuses[index] })
      orderApi.update.mockResolvedValueOnce({ ...base, status: statuses[index + 1] })
    }

    for (let index = 1; index < statuses.length; index += 1) {
      const result = await service.updateStatus(base.id, { status: statuses[index] })
      expect(result.status).toBe(statuses[index])
    }

    expect(orderApi.update).toHaveBeenCalledTimes(4)
  })

  it('copies a merchant quote into the final delivery fee', async () => {
    const pending = manualQuoteOrder(QuoteStatus.PENDING)
    const quoted = {
      ...pending,
      quotedFee: 66,
      quoteStatus: QuoteStatus.QUOTED,
      totalFee: 66,
      deliveryFee: 66,
    }
    orderApi.findFirst.mockResolvedValue(pending)
    orderApi.update.mockResolvedValue(quoted)

    const result = await service.quote(pending.id, { quotedFee: 66, quoteNote: '现场搬运报价' })

    expect(result.deliveryFee).toBe(66)
    expect(orderApi.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalFee: 66, deliveryFee: 66 }),
    }))
  })
})
