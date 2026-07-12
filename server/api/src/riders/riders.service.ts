import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrderStatus, Prisma, QuoteStatus, RiderStatus, VehicleType } from '@prisma/client'
import { PrismaService } from '../common/prisma/prisma.service'
import { AssignRiderDto, ReviewRiderDto, RiderApplicationDto, RiderExceptionDto, RiderLocationDto, RiderStatusDto } from './riders.dto'

const ACTIVE_STATUSES: OrderStatus[] = [OrderStatus.ACCEPTED, OrderStatus.PICKING_UP, OrderStatus.DELIVERING]

@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  profile(riderId: string) {
    return this.findRider(riderId)
  }

  async apply(riderId: string, dto: RiderApplicationDto) {
    const rider = await this.findRider(riderId)
    if (rider.status === RiderStatus.APPROVED) throw new ConflictException('已审核通过的骑手不能重复提交申请')
    return this.prisma.riderProfile.update({
      where: { id: riderId },
      data: {
        name: dto.name,
        phone: dto.phone,
        online: false,
        status: RiderStatus.PENDING,
        application: {
          requestedVehicleType: dto.vehicleType,
          requestedVehicleName: dto.vehicleName || '',
          requestsHandling: Boolean(dto.requestsHandling),
          documentUrls: dto.documentUrls || [],
          submittedAt: new Date().toISOString(),
        },
      },
    })
  }

  listApplications() {
    return this.prisma.riderProfile.findMany({
      where: { status: { in: [RiderStatus.PENDING, RiderStatus.REJECTED, RiderStatus.SUSPENDED] } },
      include: { qualifications: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async review(riderId: string, dto: ReviewRiderDto) {
    await this.findRider(riderId)
    return this.prisma.$transaction(async (tx) => {
      await tx.riderQualification.deleteMany({ where: { riderId } })
      if (dto.status === RiderStatus.APPROVED && dto.serviceIds.length) {
        await tx.riderQualification.createMany({
          data: dto.serviceIds.map((serviceId) => ({ riderId, serviceId })),
          skipDuplicates: true,
        })
      }
      return tx.riderProfile.update({
        where: { id: riderId },
        data: {
          status: dto.status,
          vehicleType: dto.vehicleType,
          vehicleName: dto.vehicleName,
          handlingQualified: dto.handlingQualified,
          serviceCity: dto.serviceCity || '宁德市',
          maxActiveOrders: dto.maxActiveOrders || 1,
          online: false,
        },
        include: { qualifications: true },
      })
    })
  }

  async setOnline(riderId: string, online: boolean) {
    const rider = await this.findRider(riderId)
    if (online && rider.status !== RiderStatus.APPROVED) throw new ForbiddenException('骑手审核通过后才能上线')
    return this.prisma.riderProfile.update({ where: { id: riderId }, data: { online } })
  }

  async updateLocation(riderId: string, dto: RiderLocationDto) {
    const rider = await this.findRider(riderId)
    if (!rider.online) throw new ConflictException('请先上线再上报位置')
    return this.prisma.riderProfile.update({
      where: { id: riderId },
      data: { latitude: dto.latitude, longitude: dto.longitude, lastLocationAt: new Date() },
    })
  }

  async availableOrders(riderId: string) {
    const rider = await this.assertAvailableRider(riderId)
    const activeCount = await this.prisma.order.count({ where: { riderId, status: { in: ACTIVE_STATUSES } } })
    if (activeCount >= rider.maxActiveOrders) return []
    const qualifications = rider.qualifications.filter((item) => item.enabled).map((item) => item.serviceId)
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        paymentStatus: 'PAID',
        riderId: null,
        ...(qualifications.length ? { taskId: { in: qualifications } } : {}),
        OR: [
          { vehicleType: rider.vehicleType || undefined },
          ...(rider.handlingQualified ? [{ vehicleType: VehicleType.MANUAL }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })
    const radiusKm = Number(this.config.get<string>('RIDER_ORDER_RADIUS_KM') || 30)
    return orders
      .map((order) => ({ order, distanceKm: this.distanceKm(rider.latitude, rider.longitude, order.pickupLat, order.pickupLng) }))
      .filter(({ distanceKm }) => distanceKm === null || distanceKm <= radiusKm)
      .map(({ order, distanceKm }) => this.toAvailableOrder(order, distanceKm))
  }

  async claim(riderId: string, orderId: string, idempotencyKey: string) {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key 不能为空')
    const rider = await this.assertAvailableRider(riderId)
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.riderIdempotency.findUnique({
        where: { riderId_key: { riderId, key: idempotencyKey } },
      })
      if (previous) return previous.result
      const activeCount = await tx.order.count({ where: { riderId, status: { in: ACTIVE_STATUSES } } })
      if (activeCount >= rider.maxActiveOrders) throw new ConflictException('当前任务已达上限')
      const order = await tx.order.findFirst({ where: { OR: [{ id: orderId }, { orderNo: orderId }] } })
      if (!order) throw new NotFoundException('订单不存在')
      await this.assertMatches(tx, rider, order)
      const updated = await tx.order.updateMany({
        where: {
          id: order.id,
          status: OrderStatus.PENDING,
          paymentStatus: 'PAID',
          riderId: null,
          version: order.version,
        },
        data: {
          riderId,
          status: OrderStatus.PICKING_UP,
          acceptedAt: new Date(),
          version: { increment: 1 },
        },
      })
      if (updated.count !== 1) throw new ConflictException('订单已被其他骑手抢走')
      await Promise.all([
        tx.orderAssignment.create({
          data: { orderId: order.id, riderId, method: 'CLAIM', createdBy: riderId },
        }),
        tx.orderStatusLog.create({
          data: { orderId: order.id, status: OrderStatus.PICKING_UP, note: '骑手抢单成功，前往履约地点', createdBy: riderId },
        }),
        tx.outboxEvent.create({
          data: {
            aggregateId: order.id,
            eventType: 'ORDER_CLAIMED',
            payload: { orderId: order.id, riderId },
          },
        }),
      ])
      const result: Prisma.InputJsonObject = { success: true, orderId: order.id, status: OrderStatus.PICKING_UP }
      await tx.riderIdempotency.create({ data: { riderId, key: idempotencyKey, orderId: order.id, result } })
      return result
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async currentTasks(riderId: string) {
    await this.findRider(riderId)
    return this.prisma.order.findMany({ where: { riderId, status: { in: ACTIVE_STATUSES } }, orderBy: { acceptedAt: 'asc' } })
  }

  async history(riderId: string) {
    await this.findRider(riderId)
    return this.prisma.order.findMany({
      where: { riderId, status: { in: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })
  }

  async income(riderId: string) {
    const orders = await this.prisma.order.findMany({ where: { riderId, status: OrderStatus.COMPLETED }, select: { totalFeeFen: true } })
    return { completedOrders: orders.length, grossAmountFen: orders.reduce((sum, order) => sum + order.totalFeeFen, 0) }
  }

  async updateStatus(riderId: string, orderId: string, dto: RiderStatusDto) {
    const order = await this.findOwnedOrder(riderId, orderId)
    if (dto.status === 'ARRIVED') {
      if (order.status !== OrderStatus.PICKING_UP) throw new ConflictException('当前订单不能确认到达')
      return this.prisma.order.update({
        where: { id: order.id },
        data: {
          arrivedAt: order.arrivedAt || new Date(),
          version: { increment: 1 },
          statusLogs: { create: { status: order.status, note: dto.note || '骑手已到达履约地点', createdBy: riderId } },
        },
      })
    }
    if (dto.status === 'DELIVERING' && !order.arrivedAt) throw new ConflictException('请先确认到达履约地点')
    const expected = order.status === OrderStatus.PICKING_UP ? OrderStatus.DELIVERING
      : order.status === OrderStatus.DELIVERING ? OrderStatus.COMPLETED
        : null
    if (!expected || dto.status !== expected) throw new ConflictException('订单状态不能跳级或倒退')
    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: expected,
        version: { increment: 1 },
        statusLogs: { create: { status: expected, note: dto.note || '', createdBy: riderId } },
      },
    })
  }

  async reportException(riderId: string, orderId: string, dto: RiderExceptionDto) {
    const order = await this.findOwnedOrder(riderId, orderId)
    await this.prisma.orderStatusLog.create({
      data: {
        orderId: order.id,
        status: order.status,
        note: `履约异常：${dto.reason}${dto.evidenceUrl ? `；凭证：${dto.evidenceUrl}` : ''}`,
        createdBy: riderId,
      },
    })
    return { success: true }
  }

  async assign(operatorId: string, orderId: string, dto: AssignRiderDto) {
    const rider = await this.findRider(dto.riderId)
    if (rider.status !== RiderStatus.APPROVED) throw new BadRequestException('只能指派给审核通过的骑手')
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { OR: [{ id: orderId }, { orderNo: orderId }] } })
      if (!order) throw new NotFoundException('订单不存在')
      await this.assertMatches(tx, rider, order)
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING, riderId: null, paymentStatus: 'PAID' },
        data: { riderId: rider.id, status: OrderStatus.PICKING_UP, acceptedAt: new Date(), version: { increment: 1 } },
      })
      if (updated.count !== 1) throw new ConflictException('订单已被接单或当前不可指派')
      await tx.orderAssignment.create({ data: { orderId: order.id, riderId: rider.id, method: 'OPERATOR', createdBy: operatorId } })
      await tx.orderStatusLog.create({ data: { orderId: order.id, status: OrderStatus.PICKING_UP, note: dto.note || '运营人工指派', createdBy: operatorId } })
      return tx.order.findUniqueOrThrow({ where: { id: order.id } })
    })
  }

  private async assertAvailableRider(riderId: string) {
    const rider = await this.findRider(riderId)
    if (!rider.enabled || rider.status !== RiderStatus.APPROVED) throw new ForbiddenException('骑手账号尚未审核通过')
    if (!rider.online) throw new ConflictException('请先上线')
    return rider
  }

  private async findRider(riderId: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { id: riderId }, include: { qualifications: true } })
    if (!rider) throw new NotFoundException('骑手不存在')
    return rider
  }

  private async findOwnedOrder(riderId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { riderId, OR: [{ id: orderId }, { orderNo: orderId }] } })
    if (!order) throw new ForbiddenException('无权操作该订单')
    return order
  }

  private async assertMatches(tx: Prisma.TransactionClient, rider: Awaited<ReturnType<RidersService['findRider']>>, order: Prisma.OrderGetPayload<object>) {
    if (order.status !== OrderStatus.PENDING || order.paymentStatus !== 'PAID' || order.riderId) throw new ConflictException('订单当前不可接')
    if (order.isManualQuote && order.quoteStatus !== QuoteStatus.ACCEPTED) throw new ConflictException('用户尚未确认报价')
    const vehicleMatches = order.vehicleType === rider.vehicleType || (order.vehicleType === VehicleType.MANUAL && rider.handlingQualified)
    if (!vehicleMatches) throw new ForbiddenException('骑手车型与订单不匹配')
    const qualifications = rider.qualifications.filter((item) => item.enabled).map((item) => item.serviceId)
    if (qualifications.length && !qualifications.includes(order.taskId)) throw new ForbiddenException('骑手不具备该业务资格')
    const activeCount = await tx.order.count({ where: { riderId: rider.id, status: { in: ACTIVE_STATUSES } } })
    if (activeCount >= rider.maxActiveOrders) throw new ConflictException('当前任务已达上限')
  }

  private toAvailableOrder(order: Prisma.OrderGetPayload<object>, pickupDistanceKm: number | null) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      taskId: order.taskId,
      serviceName: order.serviceName,
      vehicleName: order.vehicleName,
      pickupArea: this.maskAddress(order.pickupName, order.pickupDetail),
      dropoffArea: order.requiresDelivery || order.dropoffName ? this.maskAddress(order.dropoffName, order.dropoffDetail) : '',
      pickupDistanceKm,
      routeDistanceKm: Number(order.distanceKm),
      expectedIncomeFen: order.deliveryFee ? Math.round(Number(order.deliveryFee) * 100) : order.totalFeeFen,
      createdAt: order.createdAt,
    }
  }

  private maskAddress(name: string, detail: string) {
    const district = String(detail || '').split(/[路街巷号]/)[0]
    return [district, name].filter(Boolean).join(' · ')
  }

  private distanceKm(lat1: Prisma.Decimal | null, lng1: Prisma.Decimal | null, lat2: Prisma.Decimal | null, lng2: Prisma.Decimal | null) {
    if ([lat1, lng1, lat2, lng2].some((value) => value === null)) return null
    const toRad = (value: number) => value * Math.PI / 180
    const aLat = Number(lat1)
    const bLat = Number(lat2)
    const deltaLat = toRad(bLat - aLat)
    const deltaLng = toRad(Number(lng2) - Number(lng1))
    const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(deltaLng / 2) ** 2
    return Number((6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))).toFixed(1))
  }
}
