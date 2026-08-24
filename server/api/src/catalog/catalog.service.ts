/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, Injectable, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, RoutePriceUnit, VehicleType } from '@prisma/client'
import { PrismaService } from '../common/prisma/prisma.service'
import { TencentMapService } from '../maps/tencent-map.service'
import { CarpoolQuoteDto, HandlingQuoteDto, UpdatePricingRuleDto, UpdateServiceConfigDto } from './catalog.dto'
import { ConfigCenterService } from '../config-center/config-center.service'

const DEFAULT_SERVICES = [
  { id: 'send_parcel', name: '寄货配送', sortOrder: 10, vehicleType: VehicleType.VAN, vehicleName: '小车', passengerCapacity: 0 },
  { id: 'carpool_ride', name: '顺风车', sortOrder: 15, vehicleType: VehicleType.VAN, vehicleName: '小车', passengerCapacity: 6 },
  { id: 'cargo_haul', name: '运货', sortOrder: 20, vehicleType: VehicleType.ETRIKE, vehicleName: '货三轮车', passengerCapacity: 0 },
  { id: 'moving_handling', name: '搬运装卸', sortOrder: 30, vehicleType: VehicleType.MANUAL, vehicleName: '人力服务', passengerCapacity: 0 },
  { id: 'urgent_delivery', name: '急送', sortOrder: 40, vehicleType: VehicleType.EBIKE, vehicleName: '二轮车', passengerCapacity: 0 },
  { id: 'pickup', name: '帮取', sortOrder: 50, vehicleType: VehicleType.EBIKE, vehicleName: '二轮车', passengerCapacity: 0 },
  { id: 'buy_for_me', name: '帮买', sortOrder: 60, vehicleType: VehicleType.EBIKE, vehicleName: '二轮车', passengerCapacity: 0 },
  { id: 'pedicab_delivery', name: '送货/送客', sortOrder: 70, vehicleType: VehicleType.ETRIKE, vehicleName: '人力三轮车', passengerCapacity: 0 },
]

// Keep the bootstrap values aligned with the customer mini-program's published
// service descriptions. Existing rules are never overwritten here; operators
// can still change them from the merchant config center.
const DEFAULT_PRICING_RULES = [
  { serviceId: 'send_parcel', id: 'send-parcel-v1', pricingMode: 'parcel_category', baseFeeFen: 0, includedDistanceMeters: 0, perKmFen: 0, maxDistanceMeters: 100000 },
  { serviceId: 'carpool_ride', id: 'carpool-ride-v1', pricingMode: 'fixed_route', baseFeeFen: 0, includedDistanceMeters: 0, perKmFen: 0, maxDistanceMeters: 100000 },
  { serviceId: 'cargo_haul', id: 'cargo-haul-v1', pricingMode: 'distance', baseFeeFen: 3300, includedDistanceMeters: 4000, perKmFen: 300, maxDistanceMeters: 100000 },
  { serviceId: 'urgent_delivery', id: 'urgent-delivery-v1', pricingMode: 'distance_weather', baseFeeFen: 1300, includedDistanceMeters: 4000, perKmFen: 160, maxDistanceMeters: 100000, weatherSurchargeFen: 500 },
  { serviceId: 'pickup', id: 'pickup-v1', pricingMode: 'distance_weather', baseFeeFen: 1000, includedDistanceMeters: 4000, perKmFen: 160, maxDistanceMeters: 100000, weatherSurchargeFen: 500 },
  { serviceId: 'buy_for_me', id: 'buy-for-me-v1', pricingMode: 'distance_weather', baseFeeFen: 1200, includedDistanceMeters: 4000, perKmFen: 160, maxDistanceMeters: 100000, weatherSurchargeFen: 500 },
  { serviceId: 'pedicab_delivery', id: 'pedicab-delivery-v1', pricingMode: 'distance', baseFeeFen: 1500, includedDistanceMeters: 4000, perKmFen: 200, maxDistanceMeters: 100000 },
  { serviceId: 'moving_handling', id: 'moving-handling-v1', pricingMode: 'manual_quote', baseFeeFen: 0, includedDistanceMeters: 0, perKmFen: 0, maxDistanceMeters: 100000 },
]

const DEFAULT_SERVICE_ROUTES = [
  { id: 'cangnan', serviceId: 'carpool_ride', destinationName: '苍南', priceUnit: RoutePriceUnit.PER_PERSON, unitPriceFen: 4000, sortOrder: 10 },
  { id: 'wenzhou', serviceId: 'carpool_ride', destinationName: '温州', priceUnit: RoutePriceUnit.PER_PERSON, unitPriceFen: 15000, sortOrder: 20 },
  { id: 'fuzhou', serviceId: 'carpool_ride', destinationName: '福州', priceUnit: RoutePriceUnit.PER_PERSON, unitPriceFen: 0, sortOrder: 30 },
  { id: 'wenzhou_parcel', serviceId: 'send_parcel', destinationName: '温州', priceUnit: RoutePriceUnit.PER_ORDER, unitPriceFen: 1, sortOrder: 10 },
  { id: 'fuzhou_parcel', serviceId: 'send_parcel', destinationName: '福州', priceUnit: RoutePriceUnit.PER_ORDER, unitPriceFen: 1, sortOrder: 20 },
]

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: TencentMapService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly configCenter?: ConfigCenterService,
  ) {}

  async onModuleInit() {
    try {
      await Promise.all(DEFAULT_SERVICES.map((service) => this.prisma.serviceCatalog.upsert({
        where: { id: service.id },
        update: { name: service.name, vehicleName: service.vehicleName, enabled: true },
        create: service,
      })))
      await Promise.all([
        this.prisma.serviceCatalog.updateMany({
          where: { id: 'moving' },
          data: { enabled: false },
        }),
        this.prisma.carpoolRoute.upsert({
          where: { id: 'cangnan' },
          update: {},
          create: { id: 'cangnan', city: '苍南', unitPriceFen: 4000 },
        }),
        this.prisma.carpoolRoute.upsert({
          where: { id: 'wenzhou' },
          update: {},
          create: { id: 'wenzhou', city: '温州', unitPriceFen: 15000 },
        }),
        ...DEFAULT_SERVICE_ROUTES.map((route) => this.prisma.serviceRoute.upsert({
          where: { id: route.id },
          update: { serviceId: route.serviceId, originName: '福鼎', destinationName: route.destinationName, priceUnit: route.priceUnit, enabled: true, sortOrder: route.sortOrder },
          create: { ...route, originName: '福鼎' },
        })),
        this.prisma.serviceRoute.updateMany({ where: { serviceId: 'send_parcel', id: { in: ['cangnan_parcel', 'qinyu_parcel', 'longan_parcel'] } }, data: { enabled: false } }),
        this.prisma.serviceRoute.updateMany({ where: { serviceId: 'carpool_ride' }, data: { enabled: true } }),
        this.prisma.pricingRule.updateMany({ where: { serviceId: 'moving_handling' }, data: { pricingMode: 'manual_quote', baseFeeFen: 0, serviceSurchargeFen: 0, deliveryStartFeeFen: 0, minimumFeeFen: 0 } }),
        ...DEFAULT_PRICING_RULES.map((rule) => this.prisma.pricingRule.upsert({
          where: { serviceId: rule.serviceId },
          update: {},
          create: {
            ...rule,
            deliveryStartFeeFen: 0,
            minimumFeeFen: 0,
            serviceSurchargeFen: 0,
            maxFeeFen: 0,
            weatherMultiplierBps: 10000,
            weatherSurchargeFen: rule.weatherSurchargeFen || 0,
          },
        })),
      ])
    } catch (error) {
      if (this.config?.get<string>('NODE_ENV') === 'production') throw error
      console.warn('Catalog bootstrap skipped; database schema/data needs reconciliation.', error)
    }
  }

  listServices() {
    return this.prisma.serviceCatalog.findMany({
      where: { enabled: true, id: { not: 'moving' } },
      orderBy: { sortOrder: 'asc' },
    })
  }

  async listCarpoolRoutes() {
    const modernRoutes = (this.prisma as any).serviceRoute
      ? await (this.prisma as any).serviceRoute.findMany({ where: { serviceId: 'carpool_ride', enabled: true }, orderBy: { unitPriceFen: 'asc' } })
      : []
    const routes = modernRoutes.length
      ? modernRoutes.map((route: any) => ({ ...route, city: route.destinationName }))
      : await this.prisma.carpoolRoute.findMany({ where: { enabled: true }, orderBy: { unitPriceFen: 'asc' } })
    return routes.map((route: any) => ({
      ...route,
      origin: route.originName || '福鼎',
      destination: route.destinationName || route.city,
      unitPrice: route.unitPriceFen / 100,
      returnDestination: '福鼎',
    }))
  }

  async quoteCarpool(userId: string, dto: CarpoolQuoteDto) {
    const [route, service] = await Promise.all([
      (this.prisma as any).serviceRoute
        ? (this.prisma as any).serviceRoute.findFirst({ where: { id: dto.routeId, serviceId: 'carpool_ride', enabled: true } }).then((modern: any) => modern || this.prisma.carpoolRoute.findFirst({ where: { id: dto.routeId, enabled: true } }))
        : this.prisma.carpoolRoute.findFirst({ where: { id: dto.routeId, enabled: true } }),
      this.getService('carpool_ride'),
    ])
    if (!route) throw new BadRequestException('拼车线路不存在或已停用')
    if (dto.passengerCount > service.passengerCapacity) throw new BadRequestException('乘车人数超过车型可用座位数')
    const matchedRouteId = this.carpoolRouteId(dto)
    if (!matchedRouteId) throw new BadRequestException('拼车地址仅支持苍南或温州境内')
    if (matchedRouteId !== route.id) throw new BadRequestException('所选地址与拼车线路不匹配')
    const totalFen = route.unitPriceFen * dto.passengerCount
    const outbound = dto.direction === 'OUTBOUND'
    const cityAddress = this.carpoolAddress(dto)
    const fudingStop = {
      name: '福鼎',
      detail: '固定线路集合点，具体上车点由客服确认',
      city: '宁德市',
      district: '福鼎市',
      latitude: 27.3245,
      longitude: 120.216,
    }
    return this.prisma.quote.create({
      data: {
        userId,
        serviceId: service.id,
        routeId: route.id,
        direction: dto.direction,
        passengerCount: dto.passengerCount,
        pickup: outbound ? fudingStop : cityAddress,
        dropoff: outbound ? cityAddress : fudingStop,
        vehicleType: service.vehicleType,
        vehicleName: service.vehicleName,
        unitPriceFen: route.unitPriceFen,
        totalFen,
        expiresAt: new Date(Date.now() + await this.quoteValidityMs()),
      },
    })
  }

  private carpoolRouteId(dto: CarpoolQuoteDto) {
    const adcode = String(dto.addressAdcode || '')
    const text = [dto.addressName, dto.addressDetail, dto.addressCity, dto.addressDistrict].filter(Boolean).join('')
    if (adcode) {
      if (adcode === '330327') return 'cangnan'
      if (adcode.startsWith('3303')) return 'wenzhou'
      if (adcode.startsWith('3501')) return 'fuzhou'
      return ''
    }
    if (/苍南县|苍南/.test(text)) return 'cangnan'
    if (/温州市|温州/.test(text)) return 'wenzhou'
    if (/福州市|福州/.test(text)) return 'fuzhou'
    return ''
  }

  private carpoolAddress(dto: CarpoolQuoteDto): Prisma.InputJsonObject {
    return {
      name: dto.addressName,
      detail: dto.addressDetail,
      city: dto.addressCity || '',
      district: dto.addressDistrict || '',
      adcode: dto.addressAdcode || '',
      ...(dto.addressLat ? { latitude: dto.addressLat } : {}),
      ...(dto.addressLng ? { longitude: dto.addressLng } : {}),
    }
  }

  async quoteHandling(userId: string, dto: HandlingQuoteDto) {
    if (dto.item === '叉车') throw new BadRequestException('叉车服务请拨打 18705939528 电话预约')
    if (dto.requiresDelivery) throw new BadRequestException('搬运装卸仅提供上门服务')
    const rule = await this.prisma.pricingRule.findFirst({ where: { serviceId: 'moving_handling', enabled: true } })
    if (!rule) throw new ServiceUnavailableException('搬运装卸价格尚未配置')
    const distanceMeters = 0
    const distanceFeeFen = 0
    const totalFen = 0
    const vehicleType = VehicleType.MANUAL
    const vehicleName = '人力服务'
    return this.prisma.quote.create({
      data: {
        userId,
        serviceId: 'moving_handling',
        pickup: this.addressJson(dto.pickupName, dto.pickupDetail, dto.pickupLat, dto.pickupLng),
        dropoff: Prisma.JsonNull,
        distanceMeters,
        vehicleType,
        vehicleName,
        baseFeeFen: 0,
        distanceFeeFen,
        totalFen,
        pricingRuleVersion: rule.version,
        requiresDelivery: false,
        expiresAt: new Date(Date.now() + await this.quoteValidityMs()),
      },
    })
  }

  async consumeQuote(id: string, userId: string, tx: Prisma.TransactionClient) {
    const quote = await tx.quote.findFirst({ where: { id, userId } })
    if (!quote) throw new BadRequestException('报价不存在')
    if (quote.usedAt) throw new BadRequestException('报价已使用')
    if (quote.expiresAt <= new Date()) throw new BadRequestException('报价已过期，请重新报价')
    await tx.quote.update({ where: { id }, data: { usedAt: new Date() } })
    return quote
  }

  getService(id: string) {
    return this.prisma.serviceCatalog.findFirstOrThrow({ where: { id, enabled: true } })
  }

  updateService(id: string, dto: UpdateServiceConfigDto) {
    const vehicleType = dto.vehicleType && Object.values(VehicleType).includes(dto.vehicleType as VehicleType)
      ? dto.vehicleType as VehicleType
      : undefined
    return this.prisma.serviceCatalog.update({
      where: { id },
      data: { ...dto, vehicleType },
    })
  }

  async updatePricing(serviceId: string, dto: UpdatePricingRuleDto) {
    const existing = await this.prisma.pricingRule.findUnique({ where: { serviceId } })
    if (!existing) throw new BadRequestException('计价规则不存在')
    return this.prisma.pricingRule.update({
      where: { serviceId },
      data: { ...dto, version: { increment: 1 } },
    })
  }

  private addressJson(name: string, detail: string, latitude: number, longitude: number): Prisma.InputJsonObject {
    return { name, detail, latitude, longitude }
  }

  private async quoteValidityMs() {
    const setting = await (this.prisma as any).platformSetting?.findUnique?.({ where: { id: 'platform' }, select: { quoteValidityMinutes: true } })
    return Number(setting?.quoteValidityMinutes || 10) * 60 * 1000
  }
}
