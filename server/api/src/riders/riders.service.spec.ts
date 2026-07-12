import { OrderStatus, PaymentStatus, QuoteStatus, RiderStatus, VehicleType } from '@prisma/client'
import { RidersService } from './riders.service'

describe('RidersService atomic claim', () => {
  it('allows only one success when 100 requests claim the same order', async () => {
    let claimed = false
    const rider = {
      id: 'rider-1',
      status: RiderStatus.APPROVED,
      enabled: true,
      online: true,
      vehicleType: VehicleType.ETRIKE,
      handlingQualified: true,
      maxActiveOrders: 1,
      latitude: 27.2,
      longitude: 120.2,
      qualifications: [],
    }
    const order = {
      id: 'order-1',
      orderNo: 'N1',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PAID,
      riderId: null,
      version: 0,
      vehicleType: VehicleType.ETRIKE,
      taskId: 'cargo_haul',
      isManualQuote: false,
      quoteStatus: QuoteStatus.NONE,
    }
    const tx = {
      riderIdempotency: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      order: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn(async () => {
          if (claimed) return { count: 0 }
          claimed = true
          return { count: 1 }
        }),
      },
      orderAssignment: { create: jest.fn().mockResolvedValue({}) },
      orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(rider) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const config = { get: jest.fn().mockReturnValue('30') }
    const service = new RidersService(prisma as never, config as never)

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) => service.claim(rider.id, order.id, `claim-${index}`)),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(99)
    expect(tx.orderAssignment.create).toHaveBeenCalledTimes(1)
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1)
  })
})
