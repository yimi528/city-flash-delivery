/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ConfigCategory, Prisma, RoutePriceUnit, VehicleType } from '@prisma/client'
import { PrismaService } from '../common/prisma/prisma.service'
import { TencentMapService } from '../maps/tencent-map.service'
import { WeatherRiskService } from '../maps/weather-risk.service'
import { PricingQuoteDto, SaveConfigDraftDto, ServiceAreaCheckDto } from './config-center.dto'

type Category = 'PRICING' | 'SERVICE_AREA' | 'SYSTEM'
type JsonRecord = Record<string, any>

const SERVICE_IDS = ['carpool_ride', 'send_parcel', 'cargo_haul', 'urgent_delivery', 'pickup', 'buy_for_me', 'pedicab_delivery', 'moving_handling']
const DEFAULT_WEEKLY_HOURS = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [String(day), [{ start: '00:00', end: '24:00' }]]))

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function numberValue(value: unknown, fallback = 0) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function point(value: unknown) {
  const source = record(value)
  const latitude = numberValue(source.latitude, NaN)
  const longitude = numberValue(source.longitude, NaN)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

@Injectable()
export class ConfigCenterService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: TencentMapService,
    private readonly weather: WeatherRiskService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.prisma.platformSetting.upsert({
        where: { id: 'platform' },
        update: {},
        create: { id: 'platform', weeklyHours: DEFAULT_WEEKLY_HOURS },
      })
      await Promise.all(SERVICE_IDS.map((serviceId) => this.prisma.serviceCoveragePolicy.upsert({
        where: { serviceId },
        update: {},
        create: { serviceId },
      })))
    } catch (error) {
      if (this.config.get<string>('NODE_ENV') === 'production') throw error
      console.warn('Config bootstrap skipped; database schema/data needs reconciliation.', error)
    }
  }

  async getAppConfig() {
    const [settings, services, routes, rules, version, pricingVersion] = await Promise.all([
      this.prisma.platformSetting.findUnique({ where: { id: 'platform' } }),
      this.prisma.serviceCatalog.findMany({ where: { enabled: true, id: { not: 'moving' } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.serviceRoute.findMany({ where: { enabled: true }, orderBy: [{ serviceId: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.pricingRule.findMany({ where: { enabled: true } }),
      this.currentVersion('SYSTEM'),
      this.currentVersion('PRICING'),
    ])
    const current = settings || { acceptingOrders: true, closureReason: '', timeZone: 'Asia/Shanghai', weeklyHours: DEFAULT_WEEKLY_HOURS, announcementEnabled: false, announcementTitle: '', announcementContent: '', customerServicePhone: '', quoteValidityMinutes: 10, riderOrderRadiusMeters: 30000, riderMaxActiveOrders: 1, allowCancelBeforeClaim: true }
    const open = this.isWithinHours(current.weeklyHours)
    const ruleMap = new Map(rules.map((rule) => [rule.serviceId, rule]))
    const routeMap = new Map<string, any[]>()
    routes.forEach((route) => routeMap.set(route.serviceId, [...(routeMap.get(route.serviceId) || []), route]))
    return {
      version,
      pricingVersion,
      pricing: { version: pricingVersion, rules: rules.map((rule) => ({ serviceId: rule.serviceId, pricingMode: rule.pricingMode, baseFeeFen: rule.baseFeeFen, deliveryStartFeeFen: rule.deliveryStartFeeFen, includedDistanceMeters: rule.includedDistanceMeters, perKmFen: rule.perKmFen, minimumFeeFen: rule.minimumFeeFen, maxDistanceMeters: rule.maxDistanceMeters, serviceSurchargeFen: rule.serviceSurchargeFen, maxFeeFen: rule.maxFeeFen, weatherMultiplierBps: rule.weatherMultiplierBps })) },
      operating: { acceptingOrders: current.acceptingOrders, openNow: Boolean(current.acceptingOrders && open), reason: current.acceptingOrders && open ? '' : (current.closureReason || (open ? '平台暂时停止接单' : '当前不在营业时间')) },
      timeZone: current.timeZone,
      customerService: { phone: current.customerServicePhone },
      announcement: current.announcementEnabled ? { title: current.announcementTitle, content: current.announcementContent } : null,
      quoteValidityMinutes: current.quoteValidityMinutes,
      services: services.map((service) => ({
        ...service,
        pricingMode: ruleMap.get(service.id)?.pricingMode || '',
        routes: routeMap.get(service.id) || [],
        priceSummary: this.priceSummary(ruleMap.get(service.id), routeMap.get(service.id) || []),
      })),
    }
  }

  async getConfig(category: Category) {
    const live = await this.livePayload(category)
    const draft = await this.prisma.configDraft.findUnique({ where: { category: category as ConfigCategory } })
    return { category, version: await this.currentVersion(category), live, draft: draft ? { id: draft.id, baseVersion: draft.baseVersion, payload: draft.payload, updatedBy: draft.updatedBy, updatedAt: draft.updatedAt } : null }
  }

  async saveDraft(operatorId: string, dto: SaveConfigDraftDto) {
    const currentVersion = await this.currentVersion(dto.category)
    if (dto.baseVersion !== currentVersion) throw new ConflictException('配置已被其他运营员更新，请刷新后再编辑')
    this.validatePayload(dto.category, dto.payload)
    return this.prisma.configDraft.upsert({
      where: { category: dto.category as ConfigCategory },
      update: { baseVersion: dto.baseVersion, payload: dto.payload as Prisma.InputJsonValue, updatedBy: operatorId },
      create: { category: dto.category as ConfigCategory, baseVersion: dto.baseVersion, payload: dto.payload as Prisma.InputJsonValue, updatedBy: operatorId },
    })
  }

  async publish(operatorId: string, category: Category) {
    const draft = await this.prisma.configDraft.findUnique({ where: { category: category as ConfigCategory } })
    if (!draft) throw new BadRequestException('没有可发布的配置草稿')
    const currentVersion = await this.currentVersion(category)
    if (draft.baseVersion !== currentVersion) throw new ConflictException('配置版本已变化，请刷新后重新编辑')
    this.validatePayload(category, record(draft.payload))
    const nextVersion = currentVersion + 1
    const payload = record(draft.payload)
    await this.prisma.$transaction(async (tx) => {
      if (category === 'PRICING') await this.publishPricing(tx, payload, nextVersion)
      if (category === 'SERVICE_AREA') await this.publishAreas(tx, payload, nextVersion)
      if (category === 'SYSTEM') await this.publishSystem(tx, payload, nextVersion)
      await tx.configRevision.create({ data: { category: category as ConfigCategory, version: nextVersion, payload: draft.payload as Prisma.InputJsonValue, publishedBy: operatorId } })
      await tx.configDraft.delete({ where: { category: category as ConfigCategory } })
    })
    return { category, version: nextVersion, publishedBy: operatorId }
  }

  listRevisions(category?: Category) {
    return this.prisma.configRevision.findMany({ where: category ? { category: category as ConfigCategory } : undefined, orderBy: { publishedAt: 'desc' }, take: 50 })
  }

  async checkServiceArea(dto: ServiceAreaCheckDto) {
    const policy = await this.prisma.serviceCoveragePolicy.findUnique({ where: { serviceId: dto.serviceId } })
    if (!policy?.enforcementEnabled) return { enforced: false, available: true, pickupInside: true, dropoffInside: true }
    const areaCount = await this.prisma.serviceAreaBinding.count({ where: { serviceId: dto.serviceId, serviceArea: { enabled: true } } })
    if (!areaCount) return { enforced: true, available: false, pickupInside: false, dropoffInside: false, reason: '当前业务尚未配置服务范围' }
    const pickupInside = dto.pickup ? await this.pointInside(dto.serviceId, dto.pickup) : true
    const dropoffInside = dto.dropoff ? await this.pointInside(dto.serviceId, dto.dropoff) : true
    return { enforced: true, available: pickupInside && dropoffInside, pickupInside, dropoffInside, reason: pickupInside && dropoffInside ? '' : '地址超出当前服务范围' }
  }

  async quote(userId: string, dto: PricingQuoteDto) {
    const settings = await this.prisma.platformSetting.findUnique({ where: { id: 'platform' } })
    if (settings && (!settings.acceptingOrders || !this.isWithinHours(settings.weeklyHours))) throw new ServiceUnavailableException(settings.closureReason || '当前不在营业时间，暂不接受新订单')
    const rule = await this.prisma.pricingRule.findFirst({ where: { serviceId: dto.taskId, enabled: true } })
    if (!rule) throw new BadRequestException('该业务尚未配置价格规则')
    const pickup = point(dto.pickup)
    const dropoff = point(dto.dropoff)
    const requiresDropoff = dto.taskId !== 'moving_handling' || dto.requiresDelivery
    const coverage = await this.checkServiceArea({ serviceId: dto.taskId, pickup: pickup || undefined, dropoff: requiresDropoff ? (dropoff || undefined) : undefined })
    if (!coverage.available) throw new BadRequestException(coverage.reason || '地址超出当前服务范围')
    const route = dto.routeId ? await this.prisma.serviceRoute.findFirst({ where: { id: dto.routeId, serviceId: dto.taskId, enabled: true } }) : null
    if (rule.pricingMode === 'fixed_route') {
      if (!route) throw new BadRequestException('线路不存在或已停用')
      const passengers = route.priceUnit === RoutePriceUnit.PER_PERSON ? Math.max(1, dto.passengerCount || 1) : 1
      const totalFen = route.unitPriceFen * passengers
      return this.createQuote(userId, dto, rule.version, { route, distanceMeters: 0, baseFeeFen: route.unitPriceFen, distanceFeeFen: 0, weatherFeeFen: 0, productFeeFen: 0, totalFen, vehicleName: dto.taskId === 'carpool_ride' ? '7座商务车' : '小车' })
    }
    if (!pickup || (requiresDropoff && !dropoff)) throw new BadRequestException('报价需要有效的取送地址坐标')
    let distanceMeters = 0
    if (requiresDropoff) {
      const routeResult = await this.maps.distance(pickup!.latitude, pickup!.longitude, dropoff!.latitude, dropoff!.longitude, 'driving')
      if (!routeResult.configured || !routeResult.route) throw new ServiceUnavailableException('地图距离计算失败，请稍后重试或转人工报价')
      distanceMeters = Math.round(routeResult.route.distanceKm * 1000)
    }
    if (distanceMeters > rule.maxDistanceMeters) throw new BadRequestException('目的地超出当前服务距离')
    const excessKm = Math.ceil(Math.max(0, distanceMeters - rule.includedDistanceMeters) / 1000)
    const rawDistanceFen = rule.deliveryStartFeeFen + excessKm * rule.perKmFen
    const weatherRisk = rule.pricingMode === 'distance_weather' && dropoff ? await this.weather.resolve({ latitude: dropoff.latitude, longitude: dropoff.longitude }) : { isBadWeather: false }
    const weatherFeeFen = weatherRisk.isBadWeather ? Math.round((rule.baseFeeFen + rule.serviceSurchargeFen + rawDistanceFen) * (rule.weatherMultiplierBps / 10000 - 1)) : 0
    const distanceFeeFen = rawDistanceFen
    const deliveryFen = Math.max(rule.minimumFeeFen, rule.baseFeeFen + rule.serviceSurchargeFen + distanceFeeFen + weatherFeeFen)
    const cappedDeliveryFen = rule.maxFeeFen > 0 ? Math.min(deliveryFen, rule.maxFeeFen) : deliveryFen
    const productFeeFen = Math.max(0, Math.round(numberValue(dto.productFeeFen)))
    return this.createQuote(userId, dto, rule.version, { route: null, distanceMeters, baseFeeFen: rule.baseFeeFen + rule.serviceSurchargeFen, distanceFeeFen, weatherFeeFen, productFeeFen, totalFen: cappedDeliveryFen + productFeeFen, vehicleName: this.vehicleName(dto.taskId) })
  }

  private async createQuote(userId: string, dto: PricingQuoteDto, version: number, input: { route: any; distanceMeters: number; baseFeeFen: number; distanceFeeFen: number; weatherFeeFen: number; productFeeFen: number; totalFen: number; vehicleName: string }) {
    const validity = await this.prisma.platformSetting.findUnique({ where: { id: 'platform' }, select: { quoteValidityMinutes: true } })
    return this.prisma.quote.create({
      data: {
        userId, serviceId: dto.taskId, routeId: dto.routeId || null, direction: dto.direction || '', passengerCount: dto.passengerCount || 1,
        pickup: (dto.pickup || Prisma.JsonNull) as Prisma.InputJsonValue, dropoff: (dto.dropoff || Prisma.JsonNull) as Prisma.InputJsonValue,
        distanceMeters: input.distanceMeters, vehicleType: this.vehicleType(dto.taskId), vehicleName: input.vehicleName, unitPriceFen: input.route?.unitPriceFen || 0,
        baseFeeFen: input.baseFeeFen, distanceFeeFen: input.distanceFeeFen, weatherFeeFen: input.weatherFeeFen, productFeeFen: input.productFeeFen,
        priceBreakdown: { baseFeeFen: input.baseFeeFen, distanceFeeFen: input.distanceFeeFen, weatherFeeFen: input.weatherFeeFen, productFeeFen: input.productFeeFen, totalFen: input.totalFen } as Prisma.InputJsonValue,
        totalFen: input.totalFen, pricingRuleVersion: version, requiresDelivery: Boolean(dto.requiresDelivery),
        expiresAt: new Date(Date.now() + (validity?.quoteValidityMinutes || 10) * 60 * 1000),
      },
    })
  }

  private async livePayload(category: Category): Promise<JsonRecord> {
    if (category === 'PRICING') {
      const [rules, routes, services] = await Promise.all([
        this.prisma.pricingRule.findMany({ orderBy: { serviceId: 'asc' } }),
        this.prisma.serviceRoute.findMany({ orderBy: [{ serviceId: 'asc' }, { sortOrder: 'asc' }] }),
        this.prisma.serviceCatalog.findMany({ orderBy: { sortOrder: 'asc' } }),
      ])
      return { rules, routes, services }
    }
    if (category === 'SERVICE_AREA') {
      const [areas, policies] = await Promise.all([
        this.prisma.serviceArea.findMany({ include: { bindings: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.serviceCoveragePolicy.findMany({ orderBy: { serviceId: 'asc' } }),
      ])
      return { areas, policies }
    }
    return {
      settings: await this.prisma.platformSetting.findUnique({ where: { id: 'platform' } }),
      services: await this.prisma.serviceCatalog.findMany({ orderBy: { sortOrder: 'asc' } }),
    }
  }

  private async currentVersion(category: Category) {
    const latest = await this.prisma.configRevision.findFirst({ where: { category: category as ConfigCategory }, orderBy: { version: 'desc' }, select: { version: true } })
    return latest?.version || 1
  }

  private validatePayload(category: Category, payload: JsonRecord) {
    if (category === 'PRICING') {
      const rules = Array.isArray(payload.rules) ? payload.rules : []
      for (const rule of rules) {
        for (const key of ['baseFeeFen', 'deliveryStartFeeFen', 'includedDistanceMeters', 'perKmFen', 'minimumFeeFen', 'maxDistanceMeters', 'serviceSurchargeFen', 'maxFeeFen']) {
          if (numberValue(rule[key], -1) < 0 || !Number.isInteger(numberValue(rule[key], -1))) throw new BadRequestException(`价格规则字段 ${key} 必须是非负整数`)
        }
        if (numberValue(rule.maxDistanceMeters) < numberValue(rule.includedDistanceMeters)) throw new BadRequestException('最大服务距离不能小于起步距离')
        if (numberValue(rule.weatherMultiplierBps, 10000) < 10000 || numberValue(rule.weatherMultiplierBps, 10000) > 30000) throw new BadRequestException('天气倍率必须在 1.00 到 3.00 之间')
      }
      for (const route of (Array.isArray(payload.routes) ? payload.routes : [])) {
        if (!route.id || !route.serviceId || numberValue(route.unitPriceFen, -1) < 0) throw new BadRequestException('线路必须包含业务、线路 ID 和有效价格')
      }
    }
    if (category === 'SERVICE_AREA') {
      for (const area of (Array.isArray(payload.areas) ? payload.areas : [])) {
        const coordinates = record(area.geoJson || area.boundaryGeoJson).coordinates
        if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0]) || coordinates[0].length < 4) throw new BadRequestException('服务区域至少需要 3 个顶点')
        for (const pair of coordinates[0]) if (!Array.isArray(pair) || pair.length < 2 || Math.abs(Number(pair[0])) > 180 || Math.abs(Number(pair[1])) > 90) throw new BadRequestException('服务区域坐标无效')
      }
    }
    if (category === 'SYSTEM') {
      const settings = record(payload.settings || payload)
      if (numberValue(settings.quoteValidityMinutes, 10) < 1 || numberValue(settings.quoteValidityMinutes, 10) > 60) throw new BadRequestException('报价有效期必须在 1 到 60 分钟之间')
      if (numberValue(settings.riderOrderRadiusMeters, 30000) < 1000 || numberValue(settings.riderOrderRadiusMeters, 30000) > 100000) throw new BadRequestException('骑手抢单半径必须在 1 到 100 公里之间')
      if (numberValue(settings.riderMaxActiveOrders, 1) < 1 || numberValue(settings.riderMaxActiveOrders, 1) > 5) throw new BadRequestException('骑手并发订单数必须在 1 到 5 单之间')
    }
  }

  private async publishPricing(tx: any, payload: JsonRecord, version: number) {
    for (const rule of payload.rules || []) {
      await tx.pricingRule.update({ where: { serviceId: rule.serviceId }, data: { baseFeeFen: rule.baseFeeFen, deliveryStartFeeFen: rule.deliveryStartFeeFen, includedDistanceMeters: rule.includedDistanceMeters, perKmFen: rule.perKmFen, minimumFeeFen: rule.minimumFeeFen, maxDistanceMeters: rule.maxDistanceMeters, pricingMode: rule.pricingMode || 'distance', serviceSurchargeFen: rule.serviceSurchargeFen || 0, maxFeeFen: rule.maxFeeFen || 0, weatherMultiplierBps: rule.weatherMultiplierBps || 10000, enabled: rule.enabled !== false, version } })
    }
    for (const route of payload.routes || []) {
      await tx.serviceRoute.upsert({ where: { id: route.id }, update: { serviceId: route.serviceId, originName: route.originName || '福鼎', destinationName: route.destinationName, priceUnit: route.priceUnit === 'PER_PERSON' ? RoutePriceUnit.PER_PERSON : RoutePriceUnit.PER_ORDER, unitPriceFen: route.unitPriceFen, enabled: route.enabled !== false, sortOrder: route.sortOrder || 0, version }, create: { id: route.id, serviceId: route.serviceId, originName: route.originName || '福鼎', destinationName: route.destinationName, priceUnit: route.priceUnit === 'PER_PERSON' ? RoutePriceUnit.PER_PERSON : RoutePriceUnit.PER_ORDER, unitPriceFen: route.unitPriceFen, enabled: route.enabled !== false, sortOrder: route.sortOrder || 0, version } })
    }
    await tx.serviceRoute.updateMany({ where: { id: { notIn: (payload.routes || []).map((route: any) => route.id) } }, data: { enabled: false, version } })
  }

  private async publishAreas(tx: any, payload: JsonRecord, version: number) {
    const areas = Array.isArray(payload.areas) ? payload.areas : []
    const ids = areas.map((area: any) => area.id).filter(Boolean)
    await tx.serviceArea.deleteMany({ where: ids.length ? { id: { notIn: ids } } : undefined })
    for (const area of areas) {
      const id = area.id || `area-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const geoJson = area.geoJson || area.boundaryGeoJson
      await tx.serviceArea.upsert({ where: { id }, update: { name: area.name, enabled: area.enabled !== false, boundaryGeoJson: geoJson as Prisma.InputJsonValue, sortOrder: area.sortOrder || 0, version }, create: { id, name: area.name, enabled: area.enabled !== false, boundaryGeoJson: geoJson as Prisma.InputJsonValue, sortOrder: area.sortOrder || 0, version } })
      await tx.$executeRaw(Prisma.sql`UPDATE "service_areas" SET "boundary" = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geoJson)}), 4326)::geography WHERE "id" = ${id}`)
      await tx.serviceAreaBinding.deleteMany({ where: { serviceAreaId: id } })
      for (const serviceId of area.serviceIds || []) await tx.serviceAreaBinding.create({ data: { serviceAreaId: id, serviceId } })
    }
    for (const policy of payload.policies || []) await tx.serviceCoveragePolicy.upsert({ where: { serviceId: policy.serviceId }, update: { enforcementEnabled: Boolean(policy.enforcementEnabled), version }, create: { serviceId: policy.serviceId, enforcementEnabled: Boolean(policy.enforcementEnabled), version } })
  }

  private async publishSystem(tx: any, payload: JsonRecord, version: number) {
    const settings = record(payload.settings || payload)
    await tx.platformSetting.update({ where: { id: 'platform' }, data: { acceptingOrders: settings.acceptingOrders !== false, closureReason: String(settings.closureReason || ''), timeZone: String(settings.timeZone || 'Asia/Shanghai'), weeklyHours: (settings.weeklyHours || DEFAULT_WEEKLY_HOURS) as Prisma.InputJsonValue, customerServicePhone: String(settings.customerServicePhone || ''), announcementEnabled: Boolean(settings.announcementEnabled), announcementTitle: String(settings.announcementTitle || ''), announcementContent: String(settings.announcementContent || ''), quoteValidityMinutes: numberValue(settings.quoteValidityMinutes, 10), riderOrderRadiusMeters: numberValue(settings.riderOrderRadiusMeters, 30000), riderMaxActiveOrders: numberValue(settings.riderMaxActiveOrders, 1), allowCancelBeforeClaim: settings.allowCancelBeforeClaim !== false, version, publishedAt: new Date() } })
    for (const service of payload.services || []) {
      await tx.serviceCatalog.update({ where: { id: service.id }, data: { enabled: service.enabled !== false, sortOrder: numberValue(service.sortOrder, 0) } })
    }
  }

  private async pointInside(serviceId: string, value: { latitude?: number; longitude?: number }) {
    const latitude = numberValue(value.latitude, NaN)
    const longitude = numberValue(value.longitude, NaN)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
    const result = await this.prisma.$queryRaw<Array<{ covered: boolean }>>(Prisma.sql`SELECT EXISTS (SELECT 1 FROM "service_areas" AS a INNER JOIN "service_area_bindings" AS b ON b."serviceAreaId" = a."id" WHERE b."serviceId" = ${serviceId} AND a."enabled" = true AND ST_Covers(a."boundary"::geometry, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))) AS covered`)
    return Boolean(result[0]?.covered)
  }

  private vehicleName(taskId: string) {
    const labels: Record<string, string> = { carpool_ride: '7座商务车', send_parcel: '小车', cargo_haul: '货三轮车', urgent_delivery: '二轮车', pickup: '二轮车', buy_for_me: '二轮车', pedicab_delivery: '人力三轮车', moving_handling: '人力服务' }
    return labels[taskId] || '配送车辆'
  }

  private priceSummary(rule: any, routes: any[]) {
    if (!rule) return '按平台规则计价'
    if (rule.pricingMode === 'fixed_route') return routes.map((route) => `${route.destinationName}${(Number(route.unitPriceFen || 0) / 100).toFixed(0)}元${route.priceUnit === 'PER_PERSON' ? '/人' : ''}`).join(' · ') || '线路价格待配置'
    const start = (Number(rule.baseFeeFen || 0) + Number(rule.serviceSurchargeFen || 0)) / 100
    return `${start.toFixed(0)}元起 · ${Number(rule.includedDistanceMeters || 0) / 1000}公里内`
  }

  private vehicleType(taskId: string) {
    const types: Record<string, VehicleType> = { carpool_ride: VehicleType.VAN, send_parcel: VehicleType.VAN, cargo_haul: VehicleType.ETRIKE, urgent_delivery: VehicleType.EBIKE, pickup: VehicleType.EBIKE, buy_for_me: VehicleType.EBIKE, pedicab_delivery: VehicleType.ETRIKE, moving_handling: VehicleType.MANUAL }
    return types[taskId] || VehicleType.EBIKE
  }

  private isWithinHours(value: unknown) {
    const hours = record(value)
    const day = String(new Date().getDay())
    const minute = new Date().getHours() * 60 + new Date().getMinutes()
    const slots = Array.isArray(hours[day]) ? hours[day] : []
    return slots.some((slot: any) => {
      const parse = (input: string) => input === '24:00' ? 1440 : Number(String(input || '').split(':')[0]) * 60 + Number(String(input || '').split(':')[1] || 0)
      const start = parse(slot.start)
      const end = parse(slot.end)
      return minute >= start && minute <= end
    })
  }
}
