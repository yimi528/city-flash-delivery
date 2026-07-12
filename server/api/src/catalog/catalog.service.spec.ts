import { VehicleType } from '@prisma/client'
import { CatalogService } from './catalog.service'

describe('CatalogService quotes', () => {
  const quoteApi = { create: jest.fn(async ({ data }) => ({ id: 'quote-1', ...data })) }
  const prisma = {
    carpoolRoute: { findFirst: jest.fn() },
    serviceCatalog: { findFirstOrThrow: jest.fn() },
    quote: quoteApi,
  }
  const maps = { distance: jest.fn() }
  const service = new CatalogService(prisma as never, maps as never)

  beforeEach(() => jest.clearAllMocks())

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
    })

    expect(quote).toEqual(expect.objectContaining({ unitPriceFen: 15000, totalFen: 45000 }))
    expect(quote.pickup).toEqual({ name: '温州' })
    expect(quote.dropoff).toEqual({ name: '福鼎' })
  })
})
