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
const DISTANCE_SERVICE_IDS = new Set(['cargo_haul', 'urgent_delivery', 'pickup', 'buy_for_me', 'pedicab_delivery'])
const WEATHER_SERVICE_IDS = new Set(['urgent_delivery', 'pickup', 'buy_for_me'])
const DEFAULT_WEEKLY_HOURS = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [String(day), [{ start: '00:00', end: '24:00' }]]))
const PARCEL_DEFAULT_PRICE_FEN = 1
const PARCEL_PRICE_OPTIONS = [
  { itemType: 'NORMAL', weightBand: 'UP_TO_10' },
  { itemType: 'NORMAL', weightBand: 'UP_TO_30' },
  { itemType: 'PET', weightBand: 'ANY' },
]
const PARCEL_ROUTE_DISTRICTS: Record<string, string[]> = {
  wenzhou_parcel: ['鹿城区', '瓯海区', '龙湾区'],
  fuzhou_parcel: ['鼓楼区', '仓山区', '晋安区', '台江区'],
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function numberValue(value: unknown, fallback = 0) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

function normalizeParcelPricing(value: unknown, routes: any[]) {
  const source = Array.isArray(value) ? value : []
  const sourceMap = new Map(source.map((entry: any) => [`${entry?.routeId}:${entry?.itemType}:${entry?.weightBand}`, entry]))
  return routes
    .filter((route) => route?.serviceId === 'send_parcel')
    .flatMap((route) => PARCEL_PRICE_OPTIONS.map((option) => {
      const key = `${route.id}:${option.itemType}:${option.weightBand}`
      const entry = sourceMap.get(key) || {}
      return {
        routeId: route.id,
        itemType: option.itemType,
        weightBand: option.weightBand,
        priceFen: Math.max(PARCEL_DEFAULT_PRICE_FEN, Math.round(numberValue(entry.priceFen, PARCEL_DEFAULT_PRICE_FEN))),
        enabled: entry.enabled !== false,
      }
    }))
}

function normalizePublicPricingRule(rule: any, parcelPricing?: any[]) {
  const isDistance = DISTANCE_SERVICE_IDS.has(rule.serviceId)
  const isHandling = rule.serviceId === 'moving_handling'
  return {
    serviceId: rule.serviceId,
    pricingMode: rule.pricingMode,
    baseFeeFen: numberValue(rule.baseFeeFen) + numberValue(rule.serviceSurchargeFen),
    deliveryStartFeeFen: 0,
    includedDistanceMeters: isHandling ? 0 : numberValue(rule.includedDistanceMeters),
    perKmFen: isHandling ? 0 : numberValue(rule.perKmFen),
    minimumFeeFen: 0,
    maxDistanceMeters: isDistance ? Math.max(0, numberValue(rule.maxDistanceMeters, 100000)) : numberValue(rule.maxDistanceMeters),
    serviceSurchargeFen: 0,
    maxFeeFen: 0,
    weatherMultiplierBps: 10000,
    weatherSurchargeFen: WEATHER_SERVICE_IDS.has(rule.serviceId) ? numberValue(rule.weatherSurchargeFen) : 0,
    parcelPricing,
  }
}

function normalizeCityName(value: unknown) {
  return String(value || '').trim().replace(/[市县区]$/, '')
}

function normalizeServiceCities(value: unknown, routes: any[] = []) {
  const configuredCities = Array.isArray(value) ? value : []
  const source = configuredCities.length
    ? configuredCities
    : routes
      .filter((route) => route?.serviceId === 'send_parcel' && route?.enabled !== false)
      .map((route, index) => ({
        id: route.id,
        routeId: route.id,
        name: route.destinationName,
        enabled: true,
        districts: PARCEL_ROUTE_DISTRICTS[String(route.id)] || [],
        serviceIds: ['send_parcel'],
        sortOrder: numberValue(route.sortOrder, index),
        version: numberValue(route.version, 1),
      }))
  return source.map((city: any, index) => {
    const route = routes.find((candidate) => candidate.serviceId === 'send_parcel' && (candidate.id === city.routeId || candidate.id === city.id || normalizeCityName(candidate.destinationName) === normalizeCityName(city.name)))
    return {
      id: String(city.id || `city-${index}`),
      routeId: String(city.routeId || route?.id || city.id || `city-${index}`),
      name: String(city.name || '').trim(),
      enabled: city.enabled !== false,
      districts: Array.from(new Set((Array.isArray(city.districts) ? city.districts : []).map((district: unknown) => String(district).trim()).filter(Boolean))),
      serviceIds: Array.from(new Set((Array.isArray(city.serviceIds) ? city.serviceIds : []).map((serviceId: unknown) => String(serviceId)))),
      sortOrder: Number(city.sortOrder || index),
      version: Number(city.version || 1),
    }
  }).filter((city) => city.name)
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
    const [settings, services, routes, rules, version, pricingVersion, serviceAreaRevision] = await Promise.all([
      this.prisma.platformSetting.findUnique({ where: { id: 'platform' } }),
      this.prisma.serviceCatalog.findMany({ where: { enabled: true, id: { not: 'moving' } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.serviceRoute.findMany({ where: { enabled: true }, orderBy: [{ serviceId: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.pricingRule.findMany({ where: { enabled: true } }),
      this.currentVersion('SYSTEM'),
      this.currentVersion('PRICING'),
      this.prisma.configRevision.findFirst({ where: { category: ConfigCategory.SERVICE_AREA }, orderBy: { version: 'desc' }, select: { payload: true } }),
    ])
    const current = settings || { acceptingOrders: true, closureReason: '', timeZone: 'Asia/Shanghai', weeklyHours: DEFAULT_WEEKLY_HOURS, announcementEnabled: false, announcementTitle: '', announcementContent: '', customerServicePhone: '', quoteValidityMinutes: 10, riderOrderRadiusMeters: 30000, riderMaxActiveOrders: 1, allowCancelBeforeClaim: true }
    const open = this.isWithinHours(current.weeklyHours)
    const ruleMap = new Map(rules.map((rule) => [rule.serviceId, rule]))
    const routeMap = new Map<string, any[]>()
    routes.forEach((route) => routeMap.set(route.serviceId, [...(routeMap.get(route.serviceId) || []), route]))
    const serviceAreaPayload = record(serviceAreaRevision?.payload)
    return {
      version,
      pricingVersion,
      pricing: { version: pricingVersion, rules: rules.map((rule) => normalizePublicPricingRule(rule, rule.serviceId === 'send_parcel' ? normalizeParcelPricing(rule.parcelPricing, routeMap.get(rule.serviceId) || []) : undefined)) },
      operating: { acceptingOrders: current.acceptingOrders, openNow: Boolean(current.acceptingOrders && open), reason: current.acceptingOrders && open ? '' : (current.closureReason || (open ? '平台暂时停止接单' : '当前不在营业时间')) },
      timeZone: current.timeZone,
      customerService: { phone: current.customerServicePhone },
      announcement: current.announcementEnabled ? { title: current.announcementTitle, content: current.announcementContent } : null,
      quoteValidityMinutes: current.quoteValidityMinutes,
      serviceCities: normalizeServiceCities(serviceAreaPayload.serviceCities, routes),
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
    const latestRevision = await this.prisma.configRevision.findFirst({ where: { category: ConfigCategory.SERVICE_AREA }, orderBy: { version: 'desc' }, select: { payload: true } })
    const coveragePayload = record(latestRevision?.payload)
    const hasServiceIds = Array.isArray(coveragePayload.serviceIds)
    const enabledServiceIds = hasServiceIds ? coveragePayload.serviceIds.map((item: unknown) => String(item)) : []
    if (hasServiceIds && !enabledServiceIds.includes(dto.serviceId)) return { enforced: true, available: false, pickupInside: false, dropoffInside: false, reason: '当前业务未在服务范围中启用' }
    const policy = await this.prisma.serviceCoveragePolicy.findUnique({ where: { serviceId: dto.serviceId } })
    if (!policy?.enforcementEnabled) return { enforced: false, available: true, pickupInside: true, dropoffInside: true }
    const areaCount = await this.prisma.serviceAreaBinding.count({ where: { serviceId: dto.serviceId, serviceArea: { enabled: true } } })
    if (!areaCount) return { enforced: false, available: true, pickupInside: true, dropoffInside: true }
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
    const requiresDropoff = dto.taskId !== 'moving_handling'
    const isCarpoolMode = dto.taskId === 'send_parcel' && dto.serviceMode === 'CARPOOL'
    if (dto.taskId === 'send_parcel' && !isCarpoolMode) await this.validateParcelRouteAddress(dto)
    const coverage = await this.checkServiceArea({
      serviceId: dto.taskId,
      pickup: dto.taskId === 'send_parcel' && isCarpoolMode && dto.direction !== 'RETURN' ? undefined : (pickup || undefined),
      dropoff: dto.taskId === 'send_parcel' && isCarpoolMode && dto.direction === 'RETURN' ? undefined : (requiresDropoff ? (dropoff || undefined) : undefined),
    })
    if (!coverage.available) throw new BadRequestException(coverage.reason || '地址超出当前服务范围')
    const route = dto.routeId ? await this.prisma.serviceRoute.findFirst({ where: { id: dto.routeId, serviceId: isCarpoolMode ? 'carpool_ride' : dto.taskId, enabled: true } }) : null
    if (isCarpoolMode) {
      if (!route) throw new BadRequestException('顺风车线路不存在或已停用')
      this.validateCarpoolRouteAddress(dto, route.id)
      const passengerCount = Math.max(1, Math.min(6, Number(dto.passengerCount || 1)))
      const totalFen = Number(route.unitPriceFen || 0) * passengerCount
      if (totalFen <= PARCEL_DEFAULT_PRICE_FEN) throw new BadRequestException('当前顺风车线路价格待配置')
      return this.createQuote(userId, dto, rule.version, { route, unitPriceFen: Number(route.unitPriceFen || 0), distanceMeters: 0, baseFeeFen: totalFen, distanceFeeFen: 0, weatherFeeFen: 0, productFeeFen: 0, totalFen, vehicleName: '小车' })
    }
    if (dto.taskId === 'send_parcel' || rule.pricingMode === 'parcel_category') {
      if (!route) throw new BadRequestException('线路不存在或已停用')
      const item = String(dto.item || '普通货物')
      const weightKg = Math.max(1, Number(dto.weightKg || 1))
      if (item !== '宠物' && weightKg > 30) throw new BadRequestException('普通货物重量不能超过30kg')
      const itemType = item === '宠物' ? 'PET' : 'NORMAL'
      const weightBand = itemType === 'PET' ? 'ANY' : (weightKg <= 10 ? 'UP_TO_10' : 'UP_TO_30')
      const parcelPricing = normalizeParcelPricing(rule.parcelPricing, [route])
      const entry = parcelPricing.find((candidate) => candidate.routeId === route.id && candidate.itemType === itemType && candidate.weightBand === weightBand)
      const totalFen = numberValue(entry?.priceFen, PARCEL_DEFAULT_PRICE_FEN)
      if (!entry?.enabled || totalFen <= PARCEL_DEFAULT_PRICE_FEN) throw new BadRequestException('当前线路、物品和重量的价格待配置')
      return this.createQuote(userId, dto, rule.version, { route, unitPriceFen: totalFen, distanceMeters: 0, baseFeeFen: totalFen, distanceFeeFen: 0, weatherFeeFen: 0, productFeeFen: 0, totalFen, vehicleName: '面包车' })
    }
    if (dto.taskId === 'moving_handling') {
      return this.createQuote(userId, dto, rule.version, { route: null, distanceMeters: 0, baseFeeFen: 0, distanceFeeFen: 0, weatherFeeFen: 0, productFeeFen: 0, totalFen: 0, vehicleName: '人力服务' })
    }
    const configuredRouteCount = await this.prisma.serviceRoute.count({ where: { serviceId: dto.taskId, enabled: true } })
    if (configuredRouteCount > 0 && !route) throw new BadRequestException('请选择有效线路')
    if (route) {
      const passengers = route.priceUnit === RoutePriceUnit.PER_PERSON ? Math.max(1, dto.passengerCount || 1) : 1
      const totalFen = route.unitPriceFen * passengers
      if (totalFen <= PARCEL_DEFAULT_PRICE_FEN) throw new BadRequestException('当前线路价格待配置')
      return this.createQuote(userId, dto, rule.version, { route, distanceMeters: 0, baseFeeFen: route.unitPriceFen, distanceFeeFen: 0, weatherFeeFen: 0, productFeeFen: 0, totalFen, vehicleName: this.vehicleName(dto.taskId, dto.item) })
    }
    if (rule.pricingMode === 'fixed_route') {
      throw new BadRequestException('线路不存在或已停用')
    }
    if (!pickup || (requiresDropoff && !dropoff)) throw new BadRequestException('报价需要有效的取送地址坐标')
    let distanceMeters = 0
    if (requiresDropoff) {
      const routeResult = await this.maps.distance(pickup!.latitude, pickup!.longitude, dropoff!.latitude, dropoff!.longitude, 'driving')
      if (!routeResult.configured || !routeResult.route) throw new ServiceUnavailableException('地图距离计算失败，请稍后重试或转人工报价')
      distanceMeters = Math.round(routeResult.route.distanceKm * 1000)
    }
    if (distanceMeters > rule.maxDistanceMeters) {
      throw new BadRequestException(dto.taskId === 'cargo_haul' ? '运货超出距离上限' : '目的地超出当前服务距离')
    }
    const excessKm = Math.ceil(Math.max(0, distanceMeters - rule.includedDistanceMeters) / 1000)
    const distanceFeeFen = excessKm * rule.perKmFen
    const weatherRisk = WEATHER_SERVICE_IDS.has(dto.taskId) && dropoff ? await this.weather.resolve({ latitude: dropoff.latitude, longitude: dropoff.longitude }) : { isBadWeather: false }
    const weatherFeeFen = weatherRisk.isBadWeather && WEATHER_SERVICE_IDS.has(dto.taskId) ? rule.weatherSurchargeFen : 0
    const startFeeFen = rule.baseFeeFen + rule.serviceSurchargeFen
    const deliveryFen = startFeeFen + distanceFeeFen + weatherFeeFen
    const productFeeFen = dto.taskId === 'buy_for_me'
      ? Math.max(0, Math.round(numberValue(dto.productFeeFen)))
      : 0
    return this.createQuote(userId, dto, rule.version, { route: null, distanceMeters, baseFeeFen: startFeeFen, distanceFeeFen, weatherFeeFen, productFeeFen, totalFen: deliveryFen + productFeeFen, vehicleName: this.vehicleName(dto.taskId, dto.item) })
  }

  private async validateParcelRouteAddress(dto: PricingQuoteDto) {
    const routeId = String(dto.routeId || '')
    const latestRevision = await this.prisma.configRevision.findFirst({ where: { category: ConfigCategory.SERVICE_AREA }, orderBy: { version: 'desc' }, select: { payload: true } })
    const payload = record(latestRevision?.payload)
    const configuredCity = normalizeServiceCities(payload.serviceCities).find((city: any) => city.routeId === routeId || city.id === routeId)
    if (configuredCity && (configuredCity.enabled === false || !configuredCity.serviceIds.includes('send_parcel'))) throw new BadRequestException('寄货线路不存在或已停用')
    const configuredDistricts = Array.isArray(configuredCity?.districts) ? configuredCity.districts.map((district: unknown) => String(district)) : []
    const allowed: string[] = configuredDistricts.length ? configuredDistricts : (PARCEL_ROUTE_DISTRICTS[routeId] || [])
    if (!allowed.length) throw new BadRequestException('寄货线路不存在或已停用')
    const prefixes = routeId === 'wenzhou_parcel' ? ['330302', '330304', '330303'] : routeId === 'fuzhou_parcel' ? ['350102', '350104', '350111', '350103'] : []
    const validAddress = (value: unknown) => {
      const address = record(value)
      const text = [address.name, address.detail, address.city, address.district].filter(Boolean).join('')
      const adcode = String(address.adcode || '')
      const districtValid = allowed.some((district) => String(address.district || '') === district || text.includes(district))
      const codeValid = prefixes.some((prefix) => adcode === prefix || adcode.startsWith(prefix))
      const cityValid = configuredCity ? text.includes(configuredCity.name) : false
      return districtValid || codeValid || (cityValid && !configuredCity?.districts?.length)
    }
    if (!validAddress(dto.pickup) || !validAddress(dto.dropoff)) throw new BadRequestException(`发货和收货地址必须位于${configuredCity?.name || routeId}的${allowed.join('、')}`)
  }

  private validateCarpoolRouteAddress(dto: PricingQuoteDto, routeId: string) {
    const address = dto.direction === 'RETURN' ? record(dto.pickup) : record(dto.dropoff)
    const text = [address.name, address.detail, address.city, address.district].filter(Boolean).join('')
    const adcode = String(address.adcode || '')
    const valid = routeId === 'cangnan'
      ? adcode === '330327' || /苍南县|苍南/.test(text)
      : routeId === 'wenzhou'
        ? adcode.startsWith('3303') || /温州市|温州/.test(text)
        : routeId === 'fuzhou'
          ? adcode.startsWith('3501') || /福州市|福州/.test(text)
          : false
    if (!valid) throw new BadRequestException('所选地址与顺风车线路不匹配')
  }

  private async createQuote(userId: string, dto: PricingQuoteDto, version: number, input: { route: any; unitPriceFen?: number; distanceMeters: number; baseFeeFen: number; distanceFeeFen: number; weatherFeeFen: number; productFeeFen: number; totalFen: number; vehicleName: string }) {
    const validity = await this.prisma.platformSetting.findUnique({ where: { id: 'platform' }, select: { quoteValidityMinutes: true } })
    return this.prisma.quote.create({
      data: {
        userId, serviceId: dto.taskId, routeId: dto.routeId || null, direction: dto.direction || '', passengerCount: dto.passengerCount || 1,
        pickup: (dto.pickup || Prisma.JsonNull) as Prisma.InputJsonValue, dropoff: (dto.dropoff || Prisma.JsonNull) as Prisma.InputJsonValue,
        distanceMeters: input.distanceMeters, vehicleType: this.vehicleType(dto.taskId), vehicleName: input.vehicleName, unitPriceFen: (input.unitPriceFen ?? input.route?.unitPriceFen ?? 0),
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
      return { rules: rules.map((rule) => ({ ...rule, parcelPricing: rule.serviceId === 'send_parcel' ? normalizeParcelPricing(rule.parcelPricing, routes) : undefined })), routes, services }
    }
    if (category === 'SERVICE_AREA') {
      const [areas, policies] = await Promise.all([
        this.prisma.serviceArea.findMany({ include: { bindings: true }, orderBy: { sortOrder: 'asc' } }),
        this.prisma.serviceCoveragePolicy.findMany({ orderBy: { serviceId: 'asc' } }),
      ])
      const latestRevision = await this.prisma.configRevision.findFirst({ where: { category: ConfigCategory.SERVICE_AREA }, orderBy: { version: 'desc' }, select: { payload: true } })
      const revisionPayload = record(latestRevision?.payload)
      return {
        areas,
        policies,
        serviceCities: normalizeServiceCities(revisionPayload.serviceCities, await this.prisma.serviceRoute.findMany({ where: { serviceId: 'send_parcel' }, select: { id: true, serviceId: true, destinationName: true, enabled: true, sortOrder: true, version: true } })),
        serviceIds: Array.isArray(revisionPayload.serviceIds) ? revisionPayload.serviceIds : [],
      }
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
        for (const key of ['baseFeeFen', 'deliveryStartFeeFen', 'includedDistanceMeters', 'perKmFen', 'minimumFeeFen', 'maxDistanceMeters', 'serviceSurchargeFen', 'maxFeeFen', 'weatherSurchargeFen']) {
          const fallback = key === 'weatherSurchargeFen' ? 0 : -1
          if (numberValue(rule[key], fallback) < 0 || !Number.isInteger(numberValue(rule[key], fallback))) throw new BadRequestException(`价格规则字段 ${key} 必须是非负整数`)
        }
        if (numberValue(rule.maxDistanceMeters) < numberValue(rule.includedDistanceMeters)) throw new BadRequestException('最大服务距离不能小于起步距离')
        if (rule.serviceId === 'send_parcel') {
          const parcelPricing = Array.isArray(rule.parcelPricing) ? rule.parcelPricing : []
          for (const entry of parcelPricing) {
            if (!entry.routeId || !['NORMAL', 'PET'].includes(entry.itemType) || !['UP_TO_10', 'UP_TO_30', 'ANY'].includes(entry.weightBand) || numberValue(entry.priceFen, 0) < PARCEL_DEFAULT_PRICE_FEN || !Number.isInteger(numberValue(entry.priceFen, 0))) throw new BadRequestException('寄货价格矩阵必须包含有效的线路、物品、重量档和价格')
          }
        }
      }
      for (const route of (Array.isArray(payload.routes) ? payload.routes : [])) {
        if (!route.id || !route.serviceId || !String(route.originName || '').trim() || !String(route.destinationName || '').trim() || numberValue(route.unitPriceFen, -1) < 0) throw new BadRequestException('线路必须包含业务、线路 ID、起终点和有效价格')
      }
    }
    if (category === 'SERVICE_AREA') {
      const serviceIds = Array.isArray(payload.serviceIds) ? payload.serviceIds : []
      for (const serviceId of serviceIds) if (!SERVICE_IDS.includes(String(serviceId))) throw new BadRequestException('服务范围包含未知业务')
      const cityIds = new Set<string>()
      const cityNames = new Set<string>()
      for (const city of (Array.isArray(payload.serviceCities) ? payload.serviceCities : [])) {
        const cityId = String(city?.id || '').trim()
        const cityName = String(city?.name || '').trim()
        if (!cityId || !cityName) throw new BadRequestException('服务城市必须包含城市 ID 和名称')
        if (cityIds.has(cityId) || cityNames.has(cityName)) throw new BadRequestException('服务城市 ID 和名称不能重复')
        cityIds.add(cityId)
        cityNames.add(cityName)
        for (const serviceId of (Array.isArray(city?.serviceIds) ? city.serviceIds : [])) if (!SERVICE_IDS.includes(String(serviceId))) throw new BadRequestException('服务城市包含未知业务')
        const districts = Array.isArray(city?.districts) ? city.districts.map((district: unknown) => String(district).trim()).filter(Boolean) : []
        if (city?.enabled !== false && Array.isArray(city?.serviceIds) && city.serviceIds.includes('send_parcel') && !districts.length) throw new BadRequestException(`寄货配送城市“${cityName}”至少需要一个行政区`)
        if (new Set(districts).size !== districts.length) throw new BadRequestException(`服务城市“${cityName}”的行政区不能重复`)
      }
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
    const payloadRoutes = Array.isArray(payload.routes) ? payload.routes : []
    for (const rule of payload.rules || []) {
      const serviceId = String(rule.serviceId || '')
      const isDistance = DISTANCE_SERVICE_IDS.has(serviceId)
      const isHandling = serviceId === 'moving_handling'
      const data: any = {
        baseFeeFen: numberValue(rule.baseFeeFen) + numberValue(rule.serviceSurchargeFen),
        deliveryStartFeeFen: 0,
        includedDistanceMeters: isHandling ? 0 : numberValue(rule.includedDistanceMeters),
        perKmFen: isHandling ? 0 : numberValue(rule.perKmFen),
        minimumFeeFen: 0,
        maxDistanceMeters: isDistance ? Math.max(0, numberValue(rule.maxDistanceMeters, 100000)) : numberValue(rule.maxDistanceMeters, 100000),
        pricingMode: rule.pricingMode || 'distance',
        serviceSurchargeFen: 0,
        maxFeeFen: 0,
        weatherMultiplierBps: 10000,
        weatherSurchargeFen: WEATHER_SERVICE_IDS.has(serviceId) ? numberValue(rule.weatherSurchargeFen, 500) : 0,
        enabled: rule.enabled !== false,
        version,
      }
      if (rule.serviceId === 'send_parcel') data.parcelPricing = normalizeParcelPricing(rule.parcelPricing, payloadRoutes) as Prisma.InputJsonValue
      await tx.pricingRule.update({ where: { serviceId: rule.serviceId }, data })
    }
    for (const route of payload.routes || []) {
      await tx.serviceRoute.upsert({ where: { id: route.id }, update: { serviceId: route.serviceId, originName: route.originName || '福鼎', destinationName: route.destinationName, priceUnit: route.priceUnit === 'PER_PERSON' ? RoutePriceUnit.PER_PERSON : RoutePriceUnit.PER_ORDER, unitPriceFen: route.serviceId === 'send_parcel' ? PARCEL_DEFAULT_PRICE_FEN : route.unitPriceFen, enabled: route.enabled !== false, sortOrder: route.sortOrder || 0, version }, create: { id: route.id, serviceId: route.serviceId, originName: route.originName || '福鼎', destinationName: route.destinationName, priceUnit: route.priceUnit === 'PER_PERSON' ? RoutePriceUnit.PER_PERSON : RoutePriceUnit.PER_ORDER, unitPriceFen: route.serviceId === 'send_parcel' ? PARCEL_DEFAULT_PRICE_FEN : route.unitPriceFen, enabled: route.enabled !== false, sortOrder: route.sortOrder || 0, version } })
    }
    const routeIdsByService = new Map<string, string[]>()
    for (const rule of payload.rules || []) routeIdsByService.set(rule.serviceId, [])
    for (const route of payloadRoutes) routeIdsByService.set(route.serviceId, [...(routeIdsByService.get(route.serviceId) || []), route.id])
    for (const [serviceId, routeIds] of routeIdsByService) {
      await tx.serviceRoute.updateMany({ where: { serviceId, id: { notIn: routeIds } }, data: { enabled: false, version } })
    }
  }

  private async publishAreas(tx: any, payload: JsonRecord, version: number) {
    const areas = Array.isArray(payload.areas) ? payload.areas : []
    const ids = areas.map((area: any) => area.id).filter(Boolean)
    await tx.serviceArea.deleteMany({ where: ids.length ? { id: { notIn: ids } } : undefined })
    for (const area of areas) {
      const id = area.id || `area-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const geoJson = area.geoJson || area.boundaryGeoJson
      await tx.serviceArea.upsert({ where: { id }, update: { name: area.name, enabled: area.enabled !== false, boundaryGeoJson: geoJson as Prisma.InputJsonValue, sortOrder: area.sortOrder || 0, version }, create: { id, name: area.name, enabled: area.enabled !== false, boundaryGeoJson: geoJson as Prisma.InputJsonValue, sortOrder: area.sortOrder || 0, version } })
      await tx.$executeRaw(Prisma.sql`UPDATE \`service_areas\` SET \`boundary\` = ST_GeomFromGeoJSON(${JSON.stringify(geoJson)}) WHERE \`id\` = ${id}`)
      await tx.serviceAreaBinding.deleteMany({ where: { serviceAreaId: id } })
      for (const serviceId of area.serviceIds || []) await tx.serviceAreaBinding.create({ data: { serviceAreaId: id, serviceId } })
    }
    for (const policy of payload.policies || []) await tx.serviceCoveragePolicy.upsert({ where: { serviceId: policy.serviceId }, update: { enforcementEnabled: Boolean(policy.enforcementEnabled), version }, create: { serviceId: policy.serviceId, enforcementEnabled: Boolean(policy.enforcementEnabled), version } })

    // Service-area cities are also the customer mini-program's parcel destinations.
    // Keep the pricing route rows in sync so adding/removing a city does not require
    // a second, hidden configuration step in the pricing workspace.
    const cities = Array.isArray(payload.serviceCities) ? payload.serviceCities : []
    const existingRoutes = await tx.serviceRoute.findMany({ where: { serviceId: 'send_parcel' } })
    const routeIds: string[] = []
    for (const city of cities) {
      if (!Array.isArray(city.serviceIds) || !city.serviceIds.includes('send_parcel')) continue
      const existing = existingRoutes.find((route: any) => route.id === city.routeId || route.id === city.id || normalizeCityName(route.destinationName) === normalizeCityName(city.name))
      const id = String(city.routeId || existing?.id || city.id)
      routeIds.push(id)
      await tx.serviceRoute.upsert({
        where: { id },
        update: { serviceId: 'send_parcel', originName: '福鼎', destinationName: String(city.name), priceUnit: RoutePriceUnit.PER_ORDER, unitPriceFen: existing?.unitPriceFen || PARCEL_DEFAULT_PRICE_FEN, enabled: city.enabled !== false, sortOrder: Number(city.sortOrder || 0), version },
        create: { id, serviceId: 'send_parcel', originName: '福鼎', destinationName: String(city.name), priceUnit: RoutePriceUnit.PER_ORDER, unitPriceFen: PARCEL_DEFAULT_PRICE_FEN, enabled: city.enabled !== false, sortOrder: Number(city.sortOrder || 0), version },
      })
    }
    await tx.serviceRoute.updateMany({ where: { serviceId: 'send_parcel', id: { notIn: routeIds } }, data: { enabled: false, version } })
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
    const result = await this.prisma.$queryRaw<Array<{ covered: number }>>(Prisma.sql`SELECT EXISTS (SELECT 1 FROM \`service_areas\` AS a INNER JOIN \`service_area_bindings\` AS b ON b.\`serviceAreaId\` = a.\`id\` WHERE b.\`serviceId\` = ${serviceId} AND a.\`enabled\` = true AND ST_Intersects(a.\`boundary\`, ST_GeomFromText(CONCAT('POINT(', ${longitude}, ' ', ${latitude}, ')'), 4326, 'axis-order=long-lat'))) AS covered`)
    return Boolean(result[0]?.covered)
  }

  private vehicleName(taskId: string, item?: string) {
    if (taskId === 'moving_handling' && item === '叉车') return '叉车服务'
    const labels: Record<string, string> = { carpool_ride: '小车', send_parcel: '面包车', cargo_haul: '货三轮车', urgent_delivery: '二轮车', pickup: '二轮车', buy_for_me: '二轮车', pedicab_delivery: '人力三轮车', moving_handling: '人力服务' }
    return labels[taskId] || '配送车辆'
  }

  private priceSummary(rule: any, routes: any[]) {
    if (!rule) return '按平台规则计价'
    if (rule.serviceId === 'send_parcel' || rule.pricingMode === 'parcel_category') {
      const configured = normalizeParcelPricing(rule.parcelPricing, routes).some((entry) => entry.priceFen > PARCEL_DEFAULT_PRICE_FEN)
      return configured ? '寄货价格按线路、物品和重量配置' : '寄货价格待定（按线路、物品和重量配置）'
    }
    if (rule.serviceId === 'moving_handling' || rule.pricingMode === 'manual_quote') return '先电话沟通服务内容，商家协商后填写最终价格'
    if (routes.length) return routes.map((route) => `${route.destinationName}${(Number(route.unitPriceFen || 0) / 100).toFixed(0)}元${route.priceUnit === 'PER_PERSON' ? '/人' : ''}`).join(' · ') || '线路价格待配置'
    const start = (Number(rule.baseFeeFen || 0) + Number(rule.serviceSurchargeFen || 0)) / 100
    if (rule.serviceId === 'moving_handling') return `${start.toFixed(0)}元固定人工服务费`
    const included = Number(rule.includedDistanceMeters || 0) / 1000
    const extra = Number(rule.perKmFen || 0) / 100
    const weather = WEATHER_SERVICE_IDS.has(rule.serviceId) && Number(rule.weatherSurchargeFen || 0) > 0
      ? `；恶劣天气每单加${Number(rule.weatherSurchargeFen || 0) / 100}元`
      : ''
    return `${start.toFixed(0)}元起 · ${included}公里内，超出${extra}元/公里${weather}`
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
