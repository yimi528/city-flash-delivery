import { VehicleType } from '@prisma/client'
import { CatalogService } from './catalog.service'

describe('CatalogService quotes', () => {
  const quoteApi = { create: jest.fn(async ({ data }) => ({ id: 'quote-1', ...data })) }
  const prisma = {
    carpoolRoute: { findFirst: jest.fn() },
    serviceCatalog: { findFirstOrThrow: jest.fn(), findMany: jest.fn() },
    pricingRule: { findFirst: jest.fn() },
    quote: quoteApi,
  }
  const maps = { distance: jest.fn() }
  const service = new CatalogService(prisma as never, maps as never)

  beforeEach(() => jest.clearAllMocks())

  it('never exposes the retired standalone moving service', async () => {
    prisma.serviceCatalog.findMany.mockResolvedValue([])

    await service.listServices()

    expect(prisma.serviceCatalog.findMany).toHaveBeenCalledWith({
      where: { enabled: true, id: { not: 'moving' } },
      orderBy: { sortOrder: 'asc' },
    })
  })

  it('uses the same per-person fare for a Wenzhou return trip', async () => {
    prisma.carpoolRoute.findFirst.mockResolvedValue({ id: 'wenzhou', city: '温州', unitPriceFen: 15000 })
    prisma.serviceCatalog.findFirstOrThrow.mockResolvedValue({
      id: 'carpool_ride',
      vehicleType: VehicleType.VAN,
      vehicleName: '7座商务车',
      passengerCapacity: 6,
    })

    const quote = await service.quoteCarpool('user-1', {
      routeId: 'wenzhou',
      direction: 'RETURN',
      passengerCount: 3,
      addressName: '温州南站',
      addressDetail: '浙江省温州市瓯海区工业路',
      addressCity: '温州市',
      addressDistrict: '瓯海区',
      addressAdcode: '330304',
    })

    expect(quote).toEqual(expect.objectContaining({ unitPriceFen: 15000, totalFen: 45000 }))
    expect(quote.pickup).toEqual(expect.objectContaining({ name: '温州南站', district: '瓯海区' }))
    expect(quote.dropoff).toEqual(expect.objectContaining({
      name: '福鼎',
      city: '宁德市',
      district: '福鼎市',
      latitude: 27.3245,
      longitude: 120.216,
    }))
  })

  it('rejects addresses outside Cangnan and Wenzhou', async () => {
    prisma.carpoolRoute.findFirst.mockResolvedValue({ id: 'wenzhou', city: '温州', unitPriceFen: 15000 })
    prisma.serviceCatalog.findFirstOrThrow.mockResolvedValue({
      id: 'carpool_ride',
      vehicleType: VehicleType.VAN,
      vehicleName: '7座商务车',
      passengerCapacity: 6,
    })

    await expect(service.quoteCarpool('user-1', {
      routeId: 'wenzhou',
      direction: 'OUTBOUND',
      passengerCount: 1,
      addressName: '宁德万达广场',
      addressDetail: '福建省宁德市蕉城区天湖东路',
      addressCity: '宁德市',
      addressDistrict: '蕉城区',
    })).rejects.toThrow('拼车地址仅支持苍南或温州境内')
  })

  it('rejects a Cangnan address submitted against the Wenzhou route', async () => {
    prisma.carpoolRoute.findFirst.mockResolvedValue({ id: 'wenzhou', city: '温州', unitPriceFen: 15000 })
    prisma.serviceCatalog.findFirstOrThrow.mockResolvedValue({
      id: 'carpool_ride',
      vehicleType: VehicleType.VAN,
      vehicleName: '7座商务车',
      passengerCapacity: 6,
    })

    await expect(service.quoteCarpool('user-1', {
      routeId: 'wenzhou',
      direction: 'OUTBOUND',
      passengerCount: 1,
      addressName: '苍南站',
      addressDetail: '浙江省温州市苍南县灵溪镇站前大道',
      addressCity: '温州市',
      addressDistrict: '苍南县',
      addressAdcode: '330327',
    })).rejects.toThrow('所选地址与拼车线路不匹配')
  })

  it('requires a phone appointment for forklift service', async () => {
    await expect(service.quoteHandling('user-1', {
      item: '叉车',
      requiresDelivery: false,
      pickupName: '仓库',
      pickupDetail: '仓库入口',
      pickupLat: 27.3245,
      pickupLng: 120.216,
    })).rejects.toThrow('叉车服务请拨打 18705939528 电话预约')

    expect(prisma.quote.create).not.toHaveBeenCalled()
  })

  it('does not turn manual handling into a delivery order', async () => {
    await expect(service.quoteHandling('user-1', {
      item: '搬运装卸',
      requiresDelivery: true,
      pickupName: '仓库',
      pickupDetail: '仓库入口',
      pickupLat: 27.3245,
      pickupLng: 120.216,
    })).rejects.toThrow('搬运装卸仅提供上门服务')

    expect(prisma.quote.create).not.toHaveBeenCalled()
  })
})
