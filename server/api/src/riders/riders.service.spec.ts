import { OrderStatus, PaymentStatus, QuoteStatus, RiderStatus, RoleStatus, VehicleType } from '@prisma/client'
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
      status: OrderStatus.ACCEPTED,
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
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: OrderStatus.ACCEPTED }),
    }))
  })

  it('rejects a rider claim before the merchant accepts the order', async () => {
    const rider = {
      id: 'rider-1',
      status: RiderStatus.APPROVED,
      enabled: true,
      online: true,
      vehicleType: VehicleType.ETRIKE,
      handlingQualified: true,
      maxActiveOrders: 1,
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
      riderIdempotency: { findUnique: jest.fn().mockResolvedValue(null) },
      order: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(order), updateMany: jest.fn() },
    }
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(rider) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new RidersService(prisma as never, { get: jest.fn().mockReturnValue('30') } as never)

    await expect(service.claim(rider.id, order.id, 'claim-before-merchant'))
      .rejects.toThrow('商家先接单')
    expect(tx.order.updateMany).not.toHaveBeenCalled()
  })

  it('records a presence heartbeat separately from the last known location', async () => {
    const rider = {
      id: 'rider-1',
      online: true,
      status: RiderStatus.APPROVED,
      lastSeenAt: null,
      qualifications: [],
    }
    const update = jest.fn().mockResolvedValue({ ...rider, lastSeenAt: new Date() })
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(rider), update },
    }
    const service = new RidersService(prisma as never, { get: jest.fn() } as never)

    await service.heartbeat(rider.id, {})

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: rider.id },
      data: { lastSeenAt: expect.any(Date) },
    }))
  })

  it('keeps a rider online until the rider explicitly goes offline', async () => {
    const rider = {
      id: 'rider-1',
      online: true,
      status: RiderStatus.APPROVED,
      enabled: true,
      lastSeenAt: new Date(Date.now() - 120_000),
      qualifications: [],
    }
    const update = jest.fn()
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(rider), update },
    }
    const service = new RidersService(prisma as never, { get: jest.fn().mockReturnValue('90') } as never)

    const profile = await service.profile(rider.id)

    expect(profile.online).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an unconfirmed offline write', async () => {
    const rider = {
      id: 'rider-1',
      online: true,
      status: RiderStatus.APPROVED,
      roleStatus: RoleStatus.ACTIVE,
      qualifications: [],
    }
    const update = jest.fn()
    const prisma = { riderProfile: { findUnique: jest.fn().mockResolvedValue(rider), update } }
    const service = new RidersService(prisma as never, { get: jest.fn() } as never)

    await expect(service.setOnline(rider.id, false)).rejects.toThrow('本人确认')
    expect(update).not.toHaveBeenCalled()
  })

  it('creates a pending application under the existing customer identity', async () => {
    const application = { id: 'application-1', userId: 'user-1', status: RiderStatus.PENDING }
    const rider = { id: 'rider-1', userId: 'user-1' }
    const tx = {
      riderProfile: { upsert: jest.fn().mockResolvedValue(rider) },
      riderApplication: { create: jest.fn().mockResolvedValue(application) },
    }
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      userRoleAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      riderApplication: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new RidersService(prisma as never, { get: jest.fn() } as never)

    const result = await service.applyForUser('user-1', {
      name: '陈先生',
      phone: '13800000000',
      vehicleType: 'ETRIKE',
      agreementAccepted: true,
    })

    expect(result).toEqual(application)
    expect(tx.riderApplication.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', riderId: 'rider-1', status: RiderStatus.PENDING }),
    }))
  })

  it('rejects online access immediately after rider role suspension', async () => {
    const rider = {
      id: 'rider-1',
      status: RiderStatus.APPROVED,
      roleStatus: RoleStatus.SUSPENDED,
      online: false,
      qualifications: [],
    }
    const prisma = { riderProfile: { findUnique: jest.fn().mockResolvedValue(rider) } }
    const service = new RidersService(prisma as never, { get: jest.fn() } as never)

    await expect(service.setOnline(rider.id, true)).rejects.toThrow('有效')
  })
})
