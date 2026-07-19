/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
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
import { TencentMapService } from '../maps/tencent-map.service'
import { WeatherRiskService } from '../maps/weather-risk.service'
import { PricingService } from '../pricing/pricing.service'
import { PaymentsService } from '../payments/payments.service'
import { EstimatePriceDto } from '../pricing/pricing.dto'
import { CreateOrderDto, QuoteDecisionDto, QuoteOrderDto, UpdateOrderStatusDto } from './orders.dto'

type PersistedOrder = Prisma.OrderGetPayload<{ include: { vehicle: true } }>
type Decimalish = Prisma.Decimal | number | string | null | undefined

const TASK_VEHICLES: Record<string, { type: PrismaVehicleType; name: string }> = {
  carpool_ride: { type: PrismaVehicleType.VAN, name: '7座商务车' },
  cargo_haul: { type: PrismaVehicleType.ETRIKE, name: '货三轮车' },
  moving_handling: { type: PrismaVehicleType.MANUAL, name: '人力服务' },
  send_parcel: { type: PrismaVehicleType.VAN, name: '小车' },
  urgent_delivery: { type: PrismaVehicleType.EBIKE, name: '二轮车' },
  pickup: { type: PrismaVehicleType.EBIKE, name: '二轮车' },
  buy_for_me: { type: PrismaVehicleType.EBIKE, name: '二轮车' },
  pedicab_delivery: { type: PrismaVehicleType.ETRIKE, name: '人力三轮车' },
}

const PARCEL_LINE_PRICES: Record<string, number> = {
  wenzhou_parcel: 58,
  cangnan_parcel: 20,
  qinyu_parcel: 30,
  longan_parcel: 30,
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly pricingService: PricingService,
    private readonly prisma: PrismaService,
    @Optional() private readonly maps?: TencentMapService,
    @Optional() private readonly weather?: WeatherRiskService,
    @Optional() private readonly payments?: PaymentsService,
  ) {}

  async list(userId?: string) {
    const orders = await this.prisma.order.findMany({
      where: userId ? { userId } : undefined,
      include: {
        vehicle: true,
        user: { select: { nickname: true, phone: true } },
        rider: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return orders.map((order) => this.toApiOrder(order))
  }

  async findById(id: string) {
    return this.toApiOrder(await this.findOrderEntity(id))
  }

  async cancel(id: string, userId: string) {
    const order = await this.findOrderEntity(id)
    if (order.userId !== userId) throw new ForbiddenException('无权取消该订单')
    if (order.status === PrismaOrderStatus.COMPLETED)
      throw new ConflictException('已完成订单不能取消')
    if (order.status === PrismaOrderStatus.CANCELLED) return this.toApiOrder(order)
    let paymentStatus: 'CLOSED' | 'REFUNDED' | 'REFUNDING' = 'CLOSED'
    if (order.paymentStatus === 'PAID') {
      if (order.status !== PrismaOrderStatus.PENDING) {
        throw new ConflictException('商家已接单，请联系客服申请取消和退款')
      }
      if (this.payments) {
        const refund = await this.payments.refundForCancellation(order.id, userId)
        paymentStatus = refund.paymentStatus
      } else {
        const payment = await this.prisma.paymentRecord.findUnique({ where: { orderId: order.id } })
        if (!payment?.transactionId?.startsWith('MOCK-')) {
          throw new ConflictException('真实支付订单需要通过微信退款接口处理')
        }
        paymentStatus = 'REFUNDED'
      }
    } else if (this.payments) {
      await this.payments.closePendingPayment(order.id)
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: PrismaOrderStatus.CANCELLED,
          paymentStatus,
          statusLogs: {
            create: {
              status: PrismaOrderStatus.CANCELLED,
              note:
                paymentStatus === 'REFUNDED'
                  ? '用户取消订单，支付已退款'
                  : paymentStatus === 'REFUNDING'
                    ? '用户取消订单，退款处理中'
                    : '用户取消订单',
              createdBy: userId,
            },
          },
        },
        include: { vehicle: true },
      }),
      this.prisma.paymentRecord.updateMany({
        where: { orderId: order.id, status: { in: ['CREATED', 'PENDING'] } },
        data: { status: 'CLOSED' },
      }),
    ])
    return this.toApiOrder(updated)
  }

  async create(dto: CreateOrderDto) {
    this.validateContacts(dto)
    if (dto.quoteId) return this.createFromQuote(dto)
    const taskId = this.normalizeTaskId(dto.taskId || this.taskIdForService(dto.serviceName || ''))
    if (taskId === 'carpool_ride' || taskId === 'moving_handling') {
      throw new BadRequestException('该业务必须先获取后端报价')
    }
    const fixedVehicle = TASK_VEHICLES[taskId] || TASK_VEHICLES.urgent_delivery
    const pricingInput = await this.serverPricingInput(dto, taskId, fixedVehicle)
    const authoritative = await this.resolveAuthoritativeInputs(dto, taskId)
    const estimate = this.pricingService.estimate({
      serviceType: pricingInput.serviceType,
      vehicleType: fixedVehicle.type,
      distanceKm: authoritative.distanceKm,
      weightKg: dto.weightKg,
      serviceName: pricingInput.serviceName,
      vehicleName: fixedVehicle.name,
      pricingMode: pricingInput.pricingMode,
      linePrice: pricingInput.linePrice,
      linePriceMultiplier: pricingInput.linePriceMultiplier,
      baseDistanceKm: pricingInput.baseDistanceKm,
      basePrice: pricingInput.basePrice,
      extraPerKm: pricingInput.extraPerKm,
      serviceSurcharge: pricingInput.serviceSurcharge,
      maxDeliveryFee: pricingInput.maxDeliveryFee,
      badWeatherMultiplier: 1.15,
      badWeather: authoritative.badWeather,
      productFee: dto.productFee,
      budget: dto.budget,
    })
    const userId = dto.userId || 'demo-user'
    const orderNo = this.generateOrderNo()
    const serviceName = pricingInput.serviceName
    const vehicleName = fixedVehicle.name
    const vehicle = await this.ensureVehicle(fixedVehicle.type, vehicleName)

    await this.ensureUser(userId)

    const order = await this.prisma.order.create({
      data: {
        id: orderNo,
        orderNo,
        userId,
        serviceType: pricingInput.serviceType as PrismaServiceType,
        serviceName,
        taskId,
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
        vehicleType: fixedVehicle.type,
        vehicleName,
        vehicleId: vehicle.id,
        pricingMode: estimate.pricingMode,
        isManualQuote: estimate.isManualQuote,
        quotedFee: estimate.isManualQuote ? null : estimate.totalFee,
        quoteStatus: estimate.isManualQuote ? PrismaQuoteStatus.PENDING : PrismaQuoteStatus.NONE,
        quoteNote: '',
        quoteUpdatedAt: null,
        quoteRespondedAt: null,
        baseFee: estimate.baseFee,
        distanceFee: estimate.distanceFee,
        weightFee: estimate.weightFee,
        vehicleFee: estimate.vehicleFee,
        discountFee: estimate.discountFee,
        productFee: estimate.productFee,
        deliveryFee: estimate.deliveryFee,
        estimatedFee: estimate.totalFee,
        totalFee: estimate.totalFee,
        totalFeeFen: Math.round(estimate.totalFee * 100),
        baseFeeFen: Math.round(estimate.baseFee * 100),
        distanceFeeFen: Math.round(estimate.distanceFee * 100),
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

    return this.findById(order.id)
  }

  private validateContacts(dto: CreateOrderDto) {
    const validMobile = (value?: string) => /^1[3-9]\d{9}$/.test(String(value || '').trim())
    const pickupValid = Boolean(String(dto.pickupContact || '').trim()) && validMobile(dto.pickupPhone)
    const dropoffValid = Boolean(String(dto.dropoffContact || '').trim()) && validMobile(dto.dropoffPhone)
    if (dto.taskId === 'carpool_ride') {
      if (!pickupValid && !dropoffValid) throw new BadRequestException('乘车地址必须填写联系人和正确的11位手机号')
      return
    }
    if (!pickupValid) {
      throw new BadRequestException('出发地址必须填写联系人和正确的11位手机号')
    }
    if ((dto.dropoffName || dto.dropoffDetail) && !dropoffValid) {
      throw new BadRequestException('目的地必须填写联系人和正确的11位手机号')
    }
  }

  private async createFromQuote(dto: CreateOrderDto) {
    const userId = dto.userId || 'demo-user'
    await this.ensureUser(userId)
    const quote = await this.prisma.quote.findFirst({ where: { id: dto.quoteId, userId } })
    if (!quote) throw new BadRequestException('报价不存在')
    if (quote.usedAt) throw new BadRequestException('报价已使用')
    if (quote.expiresAt <= new Date()) throw new BadRequestException('报价已过期，请重新报价')
    const fixedVehicle = quote.vehicleType
      ? { type: quote.vehicleType, name: quote.vehicleName }
      : TASK_VEHICLES[quote.serviceId]
    if (!fixedVehicle) throw new BadRequestException('报价缺少固定车型')
    const vehicle = await this.ensureVehicle(fixedVehicle.type, fixedVehicle.name)
    const pickup = this.quoteAddress(quote.pickup)
    const dropoff = this.quoteAddress(quote.dropoff)
    const orderNo = this.generateOrderNo()
    const serviceType = this.serviceTypeForTask(quote.serviceId)
    const serviceName = this.serviceNameForTask(quote.serviceId)
    const totalFee = quote.totalFen / 100
    const productFee = Number(quote.productFeeFen || 0) / 100
    const deliveryFee = Math.max(0, totalFee - productFee)
    const order = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.quote.updateMany({
        where: { id: quote.id, userId, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      })
      if (consumed.count !== 1) throw new ConflictException('报价已失效，请重新报价')
      return tx.order.create({
        data: {
          id: orderNo,
          orderNo,
          userId,
          serviceType,
          serviceName,
          taskId: quote.serviceId,
          direction: quote.direction,
          routeId: quote.routeId,
          passengerCount: quote.passengerCount,
          unitPriceFen: quote.unitPriceFen,
          totalFeeFen: quote.totalFen,
          baseFeeFen: quote.baseFeeFen,
          distanceFeeFen: quote.distanceFeeFen,
          pricingRuleVersion: quote.pricingRuleVersion,
          requiresDelivery: quote.requiresDelivery,
          status: PrismaOrderStatus.PENDING,
          paymentStatus: 'UNPAID',
          pickupName: pickup.name || dto.pickupName,
          pickupDetail: dto.pickupDetail || pickup.detail,
          pickupContact: dto.pickupContact || '联系人',
          pickupPhone: dto.pickupPhone || '',
          pickupLat: this.optionalNumber(pickup.latitude || dto.pickupLat),
          pickupLng: this.optionalNumber(pickup.longitude || dto.pickupLng),
          dropoffName: dropoff.name || dto.dropoffName || '',
          dropoffDetail: dto.dropoffDetail || dropoff.detail,
          dropoffContact: dto.dropoffContact || '',
          dropoffPhone: dto.dropoffPhone || '',
          dropoffLat: this.optionalNumber(dropoff.latitude || dto.dropoffLat),
          dropoffLng: this.optionalNumber(dropoff.longitude || dto.dropoffLng),
          itemName: dto.item || serviceName,
          weightKg: Number(dto.weightKg || 1),
          distanceKm: quote.distanceMeters / 1000,
          vehicleType: fixedVehicle.type,
          vehicleName: fixedVehicle.name,
          vehicleId: vehicle.id,
          pricingMode:
            quote.serviceId === 'carpool_ride' || quote.serviceId === 'send_parcel'
              ? 'fixed_line'
              : 'distance',
          isManualQuote: false,
          quoteStatus: PrismaQuoteStatus.NONE,
          baseFee: quote.baseFeeFen / 100,
          distanceFee: quote.distanceFeeFen / 100,
          weightFee: 0,
          vehicleFee: 0,
          discountFee: 0,
          productFee,
          deliveryFee,
          estimatedFee: totalFee,
          totalFee,
          remark: dto.remark || '',
          statusLogs: {
            create: {
              status: PrismaOrderStatus.PENDING,
              note: '用户按后端报价下单',
              createdBy: userId,
            },
          },
        },
        include: { vehicle: true },
      })
    })
    return this.findById(order.id)
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOrderEntity(id)
    const status = (dto.status || this.nextPersistedStatus(order.status)) as PrismaOrderStatus
    if (
      order.status === PrismaOrderStatus.COMPLETED ||
      order.status === PrismaOrderStatus.CANCELLED
    ) {
      throw new ConflictException('订单已结束，不能再次更新状态')
    }
    const expectedStatus = this.nextPersistedStatus(order.status)
    if (status !== PrismaOrderStatus.CANCELLED && status !== expectedStatus) {
      throw new ConflictException('订单状态必须按接单、取货、配送、完成的顺序更新')
    }
    if (order.status === PrismaOrderStatus.ACCEPTED && status === PrismaOrderStatus.PICKING_UP) {
      throw new ConflictException('商家已接单，请等待骑手抢单或由运营指派骑手')
    }
    const isProgressing =
      status !== PrismaOrderStatus.PENDING && status !== PrismaOrderStatus.CANCELLED
    if (order.isManualQuote && order.quoteStatus !== PrismaQuoteStatus.ACCEPTED && isProgressing) {
      throw new ConflictException('用户尚未确认商家报价，订单不能进入履约流程')
    }
    if (order.paymentStatus !== 'PAID' && isProgressing) {
      throw new ConflictException('订单尚未支付，不能进入履约流程')
    }
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
    if (!order.isManualQuote) throw new BadRequestException('该订单不需要商家报价')
    if (order.status !== PrismaOrderStatus.PENDING) {
      throw new ConflictException('订单已进入履约流程，不能重新报价')
    }
    if (order.quoteStatus === PrismaQuoteStatus.ACCEPTED) {
      throw new ConflictException('用户已确认报价，不能再修改价格')
    }
    const quotedFee = Number(Number(dto.quotedFee).toFixed(1))
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        quotedFee,
        quoteStatus: PrismaQuoteStatus.QUOTED,
        quoteNote: dto.quoteNote || '',
        quoteUpdatedAt: new Date(),
        quoteRespondedAt: null,
        totalFee: quotedFee,
        deliveryFee: quotedFee,
      },
      include: { vehicle: true },
    })
    return this.toApiOrder(updated)
  }

  async confirmQuote(id: string, dto: QuoteDecisionDto) {
    return this.respondToQuote(id, true, dto)
  }

  async rejectQuote(id: string, dto: QuoteDecisionDto) {
    return this.respondToQuote(id, false, dto)
  }

  private async respondToQuote(id: string, accepted: boolean, dto: QuoteDecisionDto) {
    const order = await this.findOrderEntity(id)
    if (!order.isManualQuote) throw new BadRequestException('该订单不需要确认报价')
    if (order.quoteStatus !== PrismaQuoteStatus.QUOTED) {
      throw new ConflictException('当前没有等待确认的商家报价')
    }
    const quoteStatus = accepted ? PrismaQuoteStatus.ACCEPTED : PrismaQuoteStatus.REJECTED
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        quoteStatus,
        quoteRespondedAt: new Date(),
        statusLogs: {
          create: {
            status: order.status,
            note: dto.note || (accepted ? '用户确认商家报价' : '用户拒绝商家报价'),
            createdBy: order.userId,
          },
        },
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
    const searchableOrder = order as PersistedOrder & {
      user?: { nickname: string; phone: string | null }
      rider?: { name: string; phone: string }
    }
    const totalFee = this.toNumber(order.totalFee) || 0
    const quotedFee = this.toNumber(order.quotedFee)
    const statusIndex = ORDER_STATUS_FLOW.indexOf(order.status as OrderStatus)
    const businessStatus = this.getBusinessStatus(order)
    const vehicleType = order.vehicleType || order.vehicle?.type || PrismaVehicleType.EBIKE
    const vehicleName =
      order.vehicleName || order.vehicle?.name || VEHICLE_PRICING[vehicleType].label
    const serviceName = order.serviceName || this.serviceLabel(order.serviceType)

    return {
      id: order.id,
      orderNo: order.orderNo,
      userId: order.userId,
      customerName: searchableOrder.user?.nickname || order.pickupContact || '',
      customerPhone: searchableOrder.user?.phone || order.pickupPhone || '',
      serviceType: order.serviceType,
      serviceName,
      service: serviceName,
      taskId: order.taskId,
      direction: order.direction,
      routeId: order.routeId,
      passengerCount: order.passengerCount,
      unitPriceFen: order.unitPriceFen,
      totalFeeFen: order.totalFeeFen,
      baseFeeFen: order.baseFeeFen,
      distanceFeeFen: order.distanceFeeFen,
      pricingRuleVersion: order.pricingRuleVersion,
      requiresDelivery: order.requiresDelivery,
      riderId: order.riderId,
      riderName: searchableOrder.rider?.name || '',
      riderPhone: searchableOrder.rider?.phone || '',
      acceptedAt: order.acceptedAt?.toISOString() || null,
      arrivedAt: order.arrivedAt?.toISOString() || null,
      status: order.status,
      statusIndex: statusIndex > -1 ? statusIndex : 0,
      businessStatus: businessStatus.code,
      businessStatusText: businessStatus.text,
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
      quoteRespondedAt: order.quoteRespondedAt ? order.quoteRespondedAt.toISOString() : null,
      baseFee: this.toNumber(order.baseFee) || 0,
      distanceFee: this.toNumber(order.distanceFee) || 0,
      weightFee: this.toNumber(order.weightFee) || 0,
      vehicleFee: this.toNumber(order.vehicleFee) || 0,
      discountFee: this.toNumber(order.discountFee) || 0,
      productFee: this.toNumber(order.productFee) || 0,
      deliveryFee: this.toNumber(order.deliveryFee) || 0,
      estimatedFee: this.toNumber(order.estimatedFee) || 0,
      budget: this.toNumber(order.productFee) || 0,
      serviceFee: this.toNumber(order.deliveryFee) || 0,
      totalFee,
      fee: totalFee,
      remark: order.remark,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    }
  }

  private getBusinessStatus(order: PersistedOrder) {
    if (order.status === PrismaOrderStatus.COMPLETED) {
      return { code: 'COMPLETED', text: '已完成' }
    }
    if (order.status === PrismaOrderStatus.CANCELLED) {
      return { code: 'CANCELLED', text: '已取消' }
    }
    if (
      order.isManualQuote &&
      (order.quoteStatus === PrismaQuoteStatus.PENDING ||
        order.quoteStatus === PrismaQuoteStatus.REJECTED)
    ) {
      return { code: 'AWAITING_QUOTE', text: '待商家报价' }
    }
    if (order.isManualQuote && order.quoteStatus === PrismaQuoteStatus.QUOTED) {
      return { code: 'AWAITING_QUOTE_CONFIRMATION', text: '待确认报价' }
    }
    if (order.paymentStatus !== 'PAID') {
      return { code: 'AWAITING_PAYMENT', text: '待支付' }
    }

    const fulfillmentStatuses: Record<PrismaOrderStatus, { code: string; text: string }> = {
      [PrismaOrderStatus.PENDING]: { code: 'AWAITING_MERCHANT_ACCEPTANCE', text: '待商家接单' },
      [PrismaOrderStatus.ACCEPTED]: { code: 'AWAITING_RIDER_ACCEPTANCE', text: '待骑手接单' },
      [PrismaOrderStatus.PICKING_UP]: {
        code: order.arrivedAt ? 'ARRIVED' : 'PICKING_UP',
        text: order.arrivedAt ? this.serviceProgressText(order.serviceName, 'arrived') : this.serviceProgressText(order.serviceName, 'pickup'),
      },
      [PrismaOrderStatus.DELIVERING]: {
        code: 'DELIVERING',
        text: this.serviceProgressText(order.serviceName, 'delivery'),
      },
      [PrismaOrderStatus.COMPLETED]: { code: 'COMPLETED', text: '已完成' },
      [PrismaOrderStatus.CANCELLED]: { code: 'CANCELLED', text: '已取消' },
    }
    return fulfillmentStatuses[order.status]
  }

  private serviceProgressText(serviceName: string, stage: 'pickup' | 'arrived' | 'delivery') {
    const name = serviceName || ''
    const isMoving = ['搬运', '装卸', '搬家', '搬店'].some((keyword) => name.includes(keyword))
    const isPassenger = ['拼车', '送客'].some((keyword) => name.includes(keyword))
    if (stage === 'arrived') return isMoving ? '已到达服务地点' : isPassenger ? '已到达上车点' : '已到达取货点'
    if (isMoving) return stage === 'pickup' ? '上门途中' : '搬运中'
    if (isPassenger) return stage === 'pickup' ? '前往上车点' : '行程中'
    return stage === 'pickup' ? '前往取货' : '配送中'
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

  private quoteAddress(value: Prisma.JsonValue | null): {
    name: string
    detail: string
    latitude?: number
    longitude?: number
  } {
    if (!value || Array.isArray(value) || typeof value !== 'object') return { name: '', detail: '' }
    const source = value as Record<string, Prisma.JsonValue>
    return {
      name: typeof source.name === 'string' ? source.name : '',
      detail: typeof source.detail === 'string' ? source.detail : '',
      latitude: typeof source.latitude === 'number' ? source.latitude : undefined,
      longitude: typeof source.longitude === 'number' ? source.longitude : undefined,
    }
  }

  private taskIdForService(serviceName: string) {
    const mapping: Record<string, string> = {
      拼车: 'carpool_ride',
      拉货: 'cargo_haul',
      运货: 'cargo_haul',
      搬家: 'moving_handling',
      '搬家/搬店': 'moving_handling',
      搬运装卸: 'moving_handling',
      装货: 'moving_handling',
      卸货: 'moving_handling',
      寄货: 'send_parcel',
      急送: 'urgent_delivery',
      帮取: 'pickup',
      帮买: 'buy_for_me',
      '送货/送客': 'pedicab_delivery',
    }
    return mapping[serviceName] || 'urgent_delivery'
  }

  private normalizeTaskId(taskId: string) {
    return taskId === 'moving' ? 'moving_handling' : taskId
  }

  private async serverPricingInput(
    dto: CreateOrderDto,
    taskId: string,
    vehicle: { type: PrismaVehicleType; name: string },
  ): Promise<EstimatePriceDto> {
    const configuredRule = await (this.prisma as any).pricingRule?.findFirst?.({
      where: { serviceId: taskId, enabled: true },
    })
    const configuredRoute = dto.routeId
      ? await (this.prisma as any).serviceRoute?.findFirst?.({
          where: { id: dto.routeId, serviceId: taskId, enabled: true },
        })
      : null
    const fallback = VEHICLE_PRICING[vehicle.type]
    const configured = configuredRule
      ? {
          baseDistanceKm: Number(configuredRule.includedDistanceMeters || 0) / 1000,
          basePrice: Number(configuredRule.baseFeeFen || 0) / 100,
          extraPerKm: Number(configuredRule.perKmFen || 0) / 100,
          serviceSurcharge: Number(configuredRule.serviceSurchargeFen || 0) / 100,
          maxDeliveryFee:
            Number(configuredRule.maxFeeFen || 0) > 0
              ? Number(configuredRule.maxFeeFen) / 100
              : fallback.maxDeliveryFee,
          pricingMode: configuredRule.pricingMode || 'distance',
        }
      : {
          baseDistanceKm: 4,
          basePrice: fallback.baseFee,
          extraPerKm: fallback.distanceRate,
          serviceSurcharge: 0,
          maxDeliveryFee: fallback.maxDeliveryFee,
          pricingMode: 'distance',
        }
    const common = {
      serviceType: dto.serviceType,
      serviceName: dto.serviceName || '同城配送',
      pricingMode: configured.pricingMode,
      linePrice: 0,
      linePriceMultiplier: 1,
      baseDistanceKm: configured.baseDistanceKm,
      basePrice: configured.basePrice,
      extraPerKm: configured.extraPerKm,
      serviceSurcharge: configured.serviceSurcharge,
      maxDeliveryFee: configured.maxDeliveryFee,
    }
    if (taskId === 'send_parcel') {
      return {
        ...common,
        serviceType: 'CARGO',
        serviceName: '寄货',
        pricingMode: 'fixed_line_parcel',
        linePrice: configuredRoute?.unitPriceFen
          ? Number(configuredRoute.unitPriceFen) / 100
          : PARCEL_LINE_PRICES[dto.routeId || ''] || 58,
      }
    }
    if (taskId === 'cargo_haul')
      return { ...common, serviceType: 'CARGO', serviceName: '运货', serviceSurcharge: 5 }
    if (taskId === 'urgent_delivery')
      return {
        ...common,
        serviceType: 'DELIVERY',
        serviceName: '急送',
        pricingMode: 'distance_weather',
        serviceSurcharge: 3,
      }
    if (taskId === 'pickup')
      return {
        ...common,
        serviceType: 'PICKUP',
        serviceName: '帮取',
        pricingMode: 'distance_weather',
      }
    if (taskId === 'buy_for_me')
      return {
        ...common,
        serviceType: 'BUY_FOR_ME',
        serviceName: '帮买',
        pricingMode: 'distance_weather',
        serviceSurcharge: 2,
      }
    if (taskId === 'pedicab_delivery') {
      return {
        ...common,
        serviceType: 'CARGO',
        serviceName: '送货/送客',
        basePrice: 15,
        extraPerKm: 2,
        maxDeliveryFee: 88,
      }
    }
    return common
  }

  private async resolveAuthoritativeInputs(dto: CreateOrderDto, taskId: string) {
    const distancePriced = [
      'cargo_haul',
      'urgent_delivery',
      'pickup',
      'buy_for_me',
      'pedicab_delivery',
    ].includes(taskId)
    if (!distancePriced) {
      return { distanceKm: dto.distanceKm, badWeather: false }
    }
    if (!this.maps || !this.weather) {
      throw new ServiceUnavailableException('服务端地图和天气计价服务尚未配置')
    }
    const from = this.orderPoint(dto.pickupLat, dto.pickupLng, '取货地址')
    const to = this.orderPoint(dto.dropoffLat, dto.dropoffLng, '收货地址')
    const route = await this.maps.distance(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude,
      'driving',
    )
    if (!route.configured || !route.route) {
      throw new ServiceUnavailableException('地图距离计算失败，请稍后重试或转人工报价')
    }
    const risk = await this.weather.resolve({
      city: dto.dropoffName || dto.pickupName,
      latitude: to.latitude,
      longitude: to.longitude,
    })
    return {
      distanceKm: route.route.distanceKm,
      badWeather: Boolean(risk.isBadWeather),
    }
  }

  private orderPoint(latitude: number | undefined, longitude: number | undefined, label: string) {
    if (
      latitude === undefined ||
      longitude === undefined ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new BadRequestException(`${label}必须包含有效坐标，无法使用普通距离计价`)
    }
    return { latitude, longitude }
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
    if (serviceType === PrismaServiceType.CARPOOL) return '拼车'
    if (serviceType === PrismaServiceType.MOVING) return '搬家'
    if (serviceType === PrismaServiceType.HANDLING) return '搬运装卸'
    return '帮送'
  }

  private serviceTypeForTask(taskId: string): PrismaServiceType {
    if (taskId === 'carpool_ride') return PrismaServiceType.CARPOOL
    if (taskId === 'moving_handling') return PrismaServiceType.HANDLING
    if (taskId === 'pickup') return PrismaServiceType.PICKUP
    if (taskId === 'buy_for_me') return PrismaServiceType.BUY_FOR_ME
    if (['send_parcel', 'cargo_haul', 'pedicab_delivery'].includes(taskId))
      return PrismaServiceType.CARGO
    return PrismaServiceType.DELIVERY
  }

  private serviceNameForTask(taskId: string) {
    const labels: Record<string, string> = {
      carpool_ride: '拼车',
      send_parcel: '寄货',
      cargo_haul: '运货',
      urgent_delivery: '急送',
      pickup: '帮取',
      buy_for_me: '帮买',
      pedicab_delivery: '送货/送客',
      moving_handling: '搬运装卸',
    }
    return labels[taskId] || '帮送'
  }
}
