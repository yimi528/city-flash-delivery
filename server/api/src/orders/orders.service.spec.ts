import { ConflictException } from '@nestjs/common'
import { OrderStatus, QuoteStatus, ServiceType, VehicleType } from '@prisma/client'
import { PricingService } from '../pricing/pricing.service'
import { OrdersService } from './orders.service'

function manualQuoteOrder(quoteStatus: QuoteStatus = QuoteStatus.QUOTED) {
  const now = new Date('2026-07-11T09:00:00.000Z')
  return {
    id: 'N202607110001',
    orderNo: 'N202607110001',
    userId: 'demo-user',
    serviceType: ServiceType.CARGO,
    serviceName: '搬家/搬店',
    status: OrderStatus.PENDING,
    paymentStatus: 'UNPAID',
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
  const prisma = { order: orderApi }
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
})
