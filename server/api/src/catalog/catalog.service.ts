import { BadRequestException, Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { Prisma, VehicleType } from '@prisma/client'
import { PrismaService } from '../common/prisma/prisma.service'
import { TencentMapService } from '../maps/tencent-map.service'
import { CarpoolQuoteDto, HandlingQuoteDto, UpdatePricingRuleDto, UpdateServiceConfigDto } from './catalog.dto'

const DEFAULT_SERVICES = [
  { id: 'carpool_ride', name: '拼车', sortOrder: 10, vehicleType: VehicleType.VAN, vehicleName: '7座商务车', passengerCapacity: 6 },
  { id: 'cargo_haul', name: '运货', sortOrder: 20, vehicleType: VehicleType.ETRIKE, vehicleName: '货三轮车', passengerCapacity: 0 },
  { id: 'moving', name: '搬家', sortOrder: 30, vehicleType: VehicleType.VAN, vehicleName: '厢式货车', passengerCapacity: 0 },
  { id: 'moving_handling', name: '搬运装卸', sortOrder: 40, vehicleType: VehicleType.MANUAL, vehicleName: '人力服务', passengerCapacity: 0 },
  { id: 'send_parcel', name: '寄货', sortOrder: 50, vehicleType: VehicleType.VAN, vehicleName: '小车', passengerCapacity: 0 },
  { id: 'urgent_delivery', name: '急送', sortOrder: 60, vehicleType: VehicleType.EBIKE, vehicleName: '二轮车', passengerCapacity: 0 },
  { id: 'pickup', name: '帮取', sortOrder: 70, vehicleType: VehicleType.EBIKE, vehicleName: '二轮车', passengerCapacity: 0 },
  { id: 'buy_for_me', name: '帮买', sortOrder: 80, vehicleType: VehicleType.EBIKE, vehicleName: '二轮车', passengerCapacity: 0 },
  { id: 'pedicab_delivery', name: '送货/送客', sortOrder: 90, vehicleType: VehicleType.ETRIKE, vehicleName: '人力三轮车', passengerCapacity: 0 },
]

@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: TencentMapService,
  ) {}

  async onModuleInit() {
    await Promise.all(DEFAULT_SERVICES.map((service) => this.prisma.serviceCatalog.upsert({
      where: { id: service.id },
      update: {},
      create: service,
    })))
    await Promise.all([
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
      this.prisma.pricingRule.upsert({
        where: { serviceId: 'moving_handling' },
        update: {},
        create: {
          id: 'moving-handling-v1',
          serviceId: 'moving_handling',
          baseFeeFen: 4800,
          deliveryStartFeeFen: 2800,
          includedDistanceMeters: 4000,
          perKmFen: 280,
          minimumFeeFen: 4800,
          maxDistanceMeters: 50000,
        },
      }),
    ])
  }

  listServices() {
    return this.prisma.serviceCatalog.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } })
  }

  async listCarpoolRoutes() {
    const routes = await this.prisma.carpoolRoute.findMany({ where: { enabled: true }, orderBy: { unitPriceFen: 'asc' } })
    return routes.map((route) => ({
      ...route,
      origin: '福鼎',
      destination: route.city,
      unitPrice: route.unitPriceFen / 100,
      returnDestination: '福鼎',
    }))
  }

  async quoteCarpool(userId: string, dto: CarpoolQuoteDto) {
    const [route, service] = await Promise.all([
      this.prisma.carpoolRoute.findFirst({ where: { id: dto.routeId, enabled: true } }),
      this.getService('carpool_ride'),
    ])
    if (!route) throw new BadRequestException('拼车线路不存在或已停用')
    if (dto.passengerCount > service.passengerCapacity) throw new BadRequestException('乘车人数超过车型可用座位数')
    const totalFen = route.unitPriceFen * dto.passengerCount
    const outbound = dto.direction === 'OUTBOUND'
    return this.prisma.quote.create({
      data: {
        userId,
        serviceId: service.id,
        routeId: route.id,
        direction: dto.direction,
        passengerCount: dto.passengerCount,
        pickup: { name: outbound ? '福鼎' : route.city },
        dropoff: { name: outbound ? route.city : '福鼎' },
        vehicleType: service.vehicleType,
        vehicleName: service.vehicleName,
        unitPriceFen: route.unitPriceFen,
        totalFen,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    })
  }

  async quoteHandling(userId: string, dto: HandlingQuoteDto) {
    const rule = await this.prisma.pricingRule.findFirst({ where: { serviceId: 'moving_handling', enabled: true } })
    if (!rule) throw new ServiceUnavailableException('搬运装卸价格尚未配置')
    let distanceMeters = 0
    let distanceFeeFen = 0
    if (dto.requiresDelivery) {
      if ([dto.dropoffLat, dto.dropoffLng].some((value) => value === undefined)) {
        throw new BadRequestException('配送订单必须填写有效目的地')
      }
      const route = await this.maps.distance(
        dto.pickupLat,
        dto.pickupLng,
        dto.dropoffLat as number,
        dto.dropoffLng as number,
        'driving',
      )
      if (!route.configured || !route.route) throw new ServiceUnavailableException('地图距离计算失败，请稍后重试或转人工报价')
      distanceMeters = Math.round(route.route.distanceKm * 1000)
      if (distanceMeters > rule.maxDistanceMeters) throw new BadRequestException('目的地超出当前服务范围')
      const excessKm = Math.ceil(Math.max(0, distanceMeters - rule.includedDistanceMeters) / 1000)
      distanceFeeFen = rule.deliveryStartFeeFen + excessKm * rule.perKmFen
    }
    const totalFen = Math.max(rule.minimumFeeFen, rule.baseFeeFen + distanceFeeFen)
    const vehicleType = dto.requiresDelivery ? VehicleType.ETRIKE : VehicleType.MANUAL
    const vehicleName = dto.requiresDelivery ? '货三轮车' : '人力服务'
    return this.prisma.quote.create({
      data: {
        userId,
        serviceId: 'moving_handling',
        pickup: this.addressJson(dto.pickupName, dto.pickupDetail, dto.pickupLat, dto.pickupLng),
        dropoff: dto.requiresDelivery
          ? this.addressJson(dto.dropoffName || '', dto.dropoffDetail || '', dto.dropoffLat as number, dto.dropoffLng as number)
          : Prisma.JsonNull,
        distanceMeters,
        vehicleType,
        vehicleName,
        baseFeeFen: rule.baseFeeFen,
        distanceFeeFen,
        totalFen,
        pricingRuleVersion: rule.version,
        requiresDelivery: dto.requiresDelivery,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
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
}
