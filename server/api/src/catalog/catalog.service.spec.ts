import { VehicleType } from '@prisma/client'
import { CatalogService } from './catalog.service'

describe('CatalogService quotes', () => {
  const quoteApi = { create: jest.fn(async ({ data }) => ({ id: 'quote-1', ...data })) }
  const prisma = {
    carpoolRoute: { findFirst: jest.fn() },
    serviceCatalog: { findFirstOrThrow: jest.fn(), findMany: jest.fn() },
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
    expect(quote.dropoff).toEqual(expect.objectContaining({ name: '福鼎' }))
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
})
