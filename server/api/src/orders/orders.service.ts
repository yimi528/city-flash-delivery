import { Injectable, NotFoundException } from '@nestjs/common'
import {
  OrderStatus as PrismaOrderStatus,
  Prisma,
  QuoteStatus as PrismaQuoteStatus,
  ServiceType as PrismaServiceType,
  VehicleType as PrismaVehicleType,
} from '@prisma/client'
import {
  nextOrderStatus,
  ORDER_STATUS_FLOW,
  type OrderStatus,
} from '../common/constants/order.constants'
import { VEHICLE_PRICING } from '../common/constants/pricing.constants'
import { PrismaService } from '../common/prisma/prisma.service'
import { PricingService } from '../pricing/pricing.service'
import { CreateOrderDto, QuoteOrderDto, UpdateOrderStatusDto } from './orders.dto'

type PersistedOrder = Prisma.OrderGetPayload<{ include: { vehicle: true } }>
type Decimalish = Prisma.Decimal | number | string | null | undefined

@Injectable()
export class OrdersService {
  constructor(
    private readonly pricingService: PricingService,
    private readonly prisma: PrismaService,
  ) {}

  async list(userId?: string) {
    const orders = await this.prisma.order.findMany({
      where: userId ? { userId } : undefined,
      include: { vehicle: true },
      orderBy: { createdAt: 'desc' },
    })
    return orders.map((order) => this.toApiOrder(order))
  }

  async findById(id: string) {
    return this.toApiOrder(await this.findOrderEntity(id))
  }

  async create(dto: CreateOrderDto) {
    const estimate = this.pricingService.estimate({
      serviceType: dto.serviceType,
      vehicleType: dto.vehicleType,
      distanceKm: dto.distanceKm,
      weightKg: dto.weightKg,
      serviceName: dto.serviceName,
      vehicleName: dto.vehicleName,
      pricingMode: dto.pricingMode,
      linePrice: dto.linePrice,
      baseDistanceKm: dto.baseDistanceKm,
      basePrice: dto.basePrice,
      extraPerKm: dto.extraPerKm,
      badWeatherMultiplier: dto.badWeatherMultiplier,
      badWeather: dto.badWeather,
      budget: dto.budget,
    })
    const userId = dto.userId || 'demo-user'
    const orderNo = this.generateOrderNo()
    const serviceName = dto.serviceName || estimate.serviceName || dto.serviceType
    const vehicleName = dto.vehicleName || estimate.vehicleName
    const vehicle = await this.ensureVehicle(dto.vehicleType, vehicleName)

    await this.ensureUser(userId)

    const order = await this.prisma.order.create({
      data: {
        id: orderNo,
        orderNo,
        userId,
        serviceType: dto.serviceType as PrismaServiceType,
        serviceName,
        status: PrismaOrderStatus.PENDING,
        paymentStatus: 'UNPAID',
        pickupName: dto.pickupName,
        pickupDetail: dto.pickupDetail,
        pickupContact: dto.pickupContact || '取货联系人',
        pickupPhone: dto.pickupPhone || '',
        pickupLat: this.optionalNumber(dto.pickupLat),
        pickupLng: this.optionalNumber(dto.pickupLng),
        dropoffName: dto.dropoffName,
        dropoffDetail: dto.dropoffDetail,
        dropoffContact: dto.dropoffContact || '收货联系人',
        dropoffPhone: dto.dropoffPhone || '',
        dropoffLat: this.optionalNumber(dto.dropoffLat),
        dropoffLng: this.optionalNumber(dto.dropoffLng),
        itemName: dto.item || '同城配送物品',
        buyItems: dto.buyItems || '',
        weightKg: estimate.weightKg,
        distanceKm: estimate.distanceKm,
        vehicleType: dto.vehicleType as PrismaVehicleType,
        vehicleName,
        vehicleId: vehicle.id,
        pricingMode: estimate.pricingMode,
        isManualQuote: estimate.isManualQuote,
        quotedFee: estimate.isManualQuote ? null : estimate.totalFee,
        quoteStatus: estimate.isManualQuote ? PrismaQuoteStatus.PENDING : PrismaQuoteStatus.NONE,
        quoteNote: '',
        quoteUpdatedAt: null,
        baseFee: estimate.baseFee,
        distanceFee: estimate.distanceFee,
        weightFee: estimate.weightFee,
        vehicleFee: estimate.vehicleFee,
        discountFee: estimate.discountFee,
        totalFee: estimate.totalFee,
        remark: dto.remark || '',
        statusLogs: {
          create: {
            status: PrismaOrderStatus.PENDING,
            note: '用户下单',
            createdBy: userId,
          },
        },
      },
      include: { vehicle: true },
    })

    return this.toApiOrder(order)
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOrderEntity(id)
    const status = (dto.status || this.nextPersistedStatus(order.status)) as PrismaOrderStatus
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status,
        statusLogs: {
          create: {
            status,
            note: dto.note || '',
            createdBy: 'operator-demo',
          },
        },
      },
      include: { vehicle: true },
    })
    return this.toApiOrder(updated)
  }

  async quote(id: string, dto: QuoteOrderDto) {
    const order = await this.findOrderEntity(id)
    const quotedFee = Number(Number(dto.quotedFee).toFixed(1))
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        quotedFee,
        quoteStatus: PrismaQuoteStatus.QUOTED,
        quoteNote: dto.quoteNote || '',
        quoteUpdatedAt: new Date(),
        totalFee: quotedFee,
      },
      include: { vehicle: true },
    })
    return this.toApiOrder(updated)
  }

  private async findOrderEntity(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
      include: { vehicle: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return order
  }

  private async ensureUser(userId: string) {
    return this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        nickname: '微信用户',
        memberLevel: '青铜会员',
      },
    })
  }

  private async ensureVehicle(type: string, vehicleName: string) {
    const vehicleType = type as PrismaVehicleType
    const rule = VEHICLE_PRICING[type as keyof typeof VEHICLE_PRICING] || VEHICLE_PRICING.EBIKE
    return this.prisma.vehicleProfile.upsert({
      where: { type: vehicleType },
      update: { enabled: true },
      create: {
        type: vehicleType,
        name: vehicleName || rule.label,
        capacity: this.vehicleCapacity(rule.maxWeightKg),
        maxWeightKg: rule.maxWeightKg,
        baseFee: rule.baseFee,
        distanceRate: rule.distanceRate,
        weightRate: rule.weightRate,
        vehicleFee: rule.vehicleFee,
      },
    })
  }

  private nextPersistedStatus(status: PrismaOrderStatus) {
    if (!ORDER_STATUS_FLOW.includes(status as OrderStatus)) return status
    return nextOrderStatus(status as OrderStatus)
  }

  private toApiOrder(order: PersistedOrder) {
    const totalFee = this.toNumber(order.totalFee) || 0
    const quotedFee = this.toNumber(order.quotedFee)
    const statusIndex = ORDER_STATUS_FLOW.indexOf(order.status as OrderStatus)
    const vehicleType = order.vehicleType || order.vehicle?.type || PrismaVehicleType.EBIKE
    const vehicleName =
      order.vehicleName || order.vehicle?.name || VEHICLE_PRICING[vehicleType].label
    const serviceName = order.serviceName || this.serviceLabel(order.serviceType)

    return {
      id: order.id,
      orderNo: order.orderNo,
      userId: order.userId,
      serviceType: order.serviceType,
      serviceName,
      service: serviceName,
      status: order.status,
      statusIndex: statusIndex > -1 ? statusIndex : 0,
      paymentStatus: order.paymentStatus,
      vehicleType,
      vehicleName,
      pickupName: order.pickupName,
      pickupDetail: order.pickupDetail,
      pickupContact: order.pickupContact,
      pickupPhone: order.pickupPhone,
      pickupLat: this.toNumber(order.pickupLat),
      pickupLng: this.toNumber(order.pickupLng),
      dropoffName: order.dropoffName,
      dropoffDetail: order.dropoffDetail,
      dropoffContact: order.dropoffContact,
      dropoffPhone: order.dropoffPhone,
      dropoffLat: this.toNumber(order.dropoffLat),
      dropoffLng: this.toNumber(order.dropoffLng),
      item: order.itemName,
      itemName: order.itemName,
      buyItems: order.buyItems,
      distanceKm: this.toNumber(order.distanceKm) || 0,
      weightKg: this.toNumber(order.weightKg) || 0,
      pricingMode: order.pricingMode,
      isManualQuote: order.isManualQuote,
      quotedFee,
      quoteStatus: order.quoteStatus,
      quoteNote: order.quoteNote,
      quoteUpdatedAt: order.quoteUpdatedAt ? order.quoteUpdatedAt.toISOString() : null,
      baseFee: this.toNumber(order.baseFee) || 0,
      distanceFee: this.toNumber(order.distanceFee) || 0,
      weightFee: this.toNumber(order.weightFee) || 0,
      vehicleFee: this.toNumber(order.vehicleFee) || 0,
      discountFee: this.toNumber(order.discountFee) || 0,
      totalFee,
      fee: totalFee,
      remark: order.remark,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    }
  }

  private toNumber(value: Decimalish) {
    if (value === null || value === undefined) return null
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }

  private optionalNumber(value?: number) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : undefined
  }

  private generateOrderNo() {
    const now = new Date()
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    return `N${stamp}${suffix}`
  }

  private vehicleCapacity(maxWeightKg: number) {
    if (maxWeightKg <= 10) return '小件轻货'
    if (maxWeightKg <= 30) return '30kg内小车配送'
    return '大件/多件货物'
  }

  private serviceLabel(serviceType: PrismaServiceType) {
    if (serviceType === PrismaServiceType.PICKUP) return '帮取'
    if (serviceType === PrismaServiceType.CARGO) return '送货'
    if (serviceType === PrismaServiceType.BUY_FOR_ME) return '帮买'
    return '帮送'
  }
}
