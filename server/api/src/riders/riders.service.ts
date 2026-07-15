/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrderStatus, Prisma, QuoteStatus, RiderStatus, RoleStatus, RiderWorkStatus, UserRole, VehicleType } from '@prisma/client'
import { PrismaService } from '../common/prisma/prisma.service'
import { AssignRiderDto, ReviewRiderDto, RiderApplicationDto, RiderExceptionDto, RiderHeartbeatDto, RiderLocationDto, RiderStatusDto, RiderVehicleUpdateDto } from './riders.dto'

const ACTIVE_STATUSES: OrderStatus[] = [OrderStatus.ACCEPTED, OrderStatus.PICKING_UP, OrderStatus.DELIVERING]

@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async profile(riderId: string) {
    const rider = await this.findRider(riderId)
    if (rider.online && this.heartbeatExpired(rider.lastSeenAt)) {
      return this.prisma.riderProfile.update({ where: { id: riderId }, data: { online: false }, include: { qualifications: true, vehicles: true } })
    }
    return rider
  }

  async apply(riderId: string, dto: RiderApplicationDto) {
    const rider = await this.findRider(riderId)
    if (rider.userId) return this.applyForUser(rider.userId, dto)
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
          requestedVehicleTypes: this.vehicleTypes(dto),
          requestsHandling: Boolean(dto.requestsHandling),
          documentUrls: dto.documentUrls || [],
          submittedAt: new Date().toISOString(),
        },
      },
    })
  }

  async applyForUser(userId: string, dto: RiderApplicationDto) {
    if (dto.agreementAccepted === false) throw new BadRequestException('请先确认用户协议和隐私政策')
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) throw new NotFoundException('用户不存在')
    const activeRole = await this.prisma.userRoleAssignment.findUnique({ where: { userId_role: { userId, role: UserRole.RIDER } } })
    if (activeRole?.status === RoleStatus.ACTIVE) throw new ConflictException('当前账号已经拥有有效骑手身份')
    const pending = await this.prisma.riderApplication.findFirst({ where: { userId, status: RiderStatus.PENDING } })
    if (pending) throw new ConflictException('同一时间只能存在一条待审核申请')

    return this.prisma.$transaction(async (tx) => {
      const rider = await tx.riderProfile.upsert({
        where: { userId },
        update: {
          name: dto.name,
          phone: dto.phone,
          online: false,
          workStatus: RiderWorkStatus.OFFLINE,
          status: RiderStatus.PENDING,
          roleStatus: RoleStatus.SUSPENDED,
        },
        create: {
          userId,
          name: dto.name,
          phone: dto.phone,
          status: RiderStatus.PENDING,
          roleStatus: RoleStatus.SUSPENDED,
          workStatus: RiderWorkStatus.OFFLINE,
          vehicleType: dto.vehicleType,
          vehicleName: dto.vehicleName || '',
        },
      })
      return tx.riderApplication.create({
        data: {
          userId,
          riderId: rider.id,
          status: RiderStatus.PENDING,
          realName: dto.name,
          phone: dto.phone,
          verificationStatus: dto.verificationStatus || 'UNVERIFIED',
          vehicleType: dto.vehicleType,
          vehicleName: dto.vehicleName || '',
          vehicleTypes: this.vehicleTypes(dto),
          statement: dto.statement || '',
          agreementAccepted: dto.agreementAccepted !== false,
        },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async currentApplication(userId: string) {
    const [application, rider] = await Promise.all([
      this.prisma.riderApplication.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.riderProfile.findUnique({ where: { userId }, select: { id: true, name: true, status: true, roleStatus: true, workStatus: true, online: true, vehicleName: true, vehicles: true } }),
    ])
    return { application, rider }
  }

  async withdrawApplication(userId: string, applicationId: string) {
    const application = await this.prisma.riderApplication.findFirst({ where: { id: applicationId, userId } })
    if (!application) throw new NotFoundException('申请不存在')
    if (application.status !== RiderStatus.PENDING) throw new ConflictException('当前申请不可撤回')
    return this.prisma.riderApplication.update({ where: { id: applicationId }, data: { status: RiderStatus.WITHDRAWN } })
  }

  async listApplications() {
    const applications = await this.prisma.riderApplication.findMany({
      where: { status: { in: [RiderStatus.PENDING, RiderStatus.APPROVED, RiderStatus.REJECTED, RiderStatus.WITHDRAWN] } },
      include: { rider: { include: { qualifications: true, vehicles: true } }, user: { select: { id: true, nickname: true, avatarUrl: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    return applications.map((application) => ({
      ...(application.rider || {}),
      id: application.rider?.id || application.id,
      name: application.realName,
      phone: application.phone,
      status: application.rider?.status || application.status,
      application: {
        requestedVehicleType: application.vehicleType,
        requestedVehicleName: application.vehicleName,
        requestedVehicleTypes: application.vehicleTypes,
        requestsHandling: application.rider?.handlingQualified || false,
        statement: application.statement,
        submittedAt: application.submittedAt,
        reviewedAt: application.reviewedAt,
        reviewedBy: application.reviewedBy,
        rejectionReason: application.rejectionReason,
        applicationStatus: application.status,
        applicationId: application.id,
        userId: application.userId,
      },
      user: application.user,
    }))
  }

  async review(riderId: string, dto: ReviewRiderDto, operatorId = 'operator') {
    const rider = await this.findRider(riderId)
    if (dto.status === RiderStatus.REJECTED && !dto.reason?.trim()) throw new BadRequestException('拒绝申请必须填写原因')
    return this.prisma.$transaction(async (tx) => {
      const application = rider.userId
        ? await tx.riderApplication.findFirst({ where: { riderId }, orderBy: { createdAt: 'desc' } })
        : null
      if (application && application.status !== RiderStatus.PENDING) {
        if (dto.status === RiderStatus.APPROVED && application.status === RiderStatus.APPROVED) return rider
        throw new ConflictException('该申请已完成审核')
      }
      await tx.riderQualification.deleteMany({ where: { riderId } })
      if (dto.status === RiderStatus.APPROVED && dto.serviceIds.length) {
        await tx.riderQualification.createMany({
          data: dto.serviceIds.map((serviceId) => ({ riderId, serviceId })),
          skipDuplicates: true,
        })
      }
      const approvedVehicleTypes = this.vehicleTypes(dto)
      if (dto.status === RiderStatus.APPROVED) {
        await tx.riderVehicle.deleteMany({ where: { riderId } })
        await tx.riderVehicle.createMany({
          data: approvedVehicleTypes.map((vehicleType) => ({ riderId, vehicleType, vehicleName: this.vehicleNameForType(vehicleType), enabled: true, verified: true })),
          skipDuplicates: true,
        })
      }
      const nextRoleStatus = dto.status === RiderStatus.APPROVED ? RoleStatus.ACTIVE : RoleStatus.SUSPENDED
      const updated = await tx.riderProfile.update({
        where: { id: riderId },
        data: {
          status: dto.status,
          roleStatus: nextRoleStatus,
          workStatus: RiderWorkStatus.OFFLINE,
          vehicleType: dto.vehicleType,
          vehicleName: dto.vehicleName,
          handlingQualified: dto.handlingQualified,
          serviceCity: dto.serviceCity || '宁德市',
          maxActiveOrders: dto.maxActiveOrders || 1,
          online: false,
        },
        include: { qualifications: true, vehicles: true },
      })
      if (rider.userId) {
        await tx.userRoleAssignment.upsert({
          where: { userId_role: { userId: rider.userId, role: UserRole.RIDER } },
          update: { status: nextRoleStatus },
          create: { userId: rider.userId, role: UserRole.RIDER, status: nextRoleStatus },
        })
        await tx.riderStatusLog.create({
          data: {
            riderId,
            oldStatus: rider.roleStatus || RoleStatus.SUSPENDED,
            newStatus: nextRoleStatus,
            reason: dto.reason || (dto.status === RiderStatus.APPROVED ? '骑手申请审核通过' : '骑手申请未通过'),
            operatedBy: operatorId,
          },
        })
        if (application) {
          await tx.riderApplication.update({
            where: { id: application.id },
            data: {
              status: dto.status,
              reviewedAt: new Date(),
              rejectionReason: dto.status === RiderStatus.REJECTED ? dto.reason || '' : '',
              reviewedBy: operatorId,
            },
          })
          await tx.notification.create({
            data: {
              userId: rider.userId,
              type: 'RIDER_APPLICATION',
              title: dto.status === RiderStatus.APPROVED ? '骑手申请已通过' : '骑手申请未通过',
              content: dto.status === RiderStatus.APPROVED ? '你已获得骑手身份，可以进入骑手工作台。' : dto.reason || '请根据审核意见修改资料后重新申请。',
            },
          })
        }
      }
      return updated
    })
  }

  async listRiders(roleStatus?: string, workStatus?: string) {
    const riders = await this.prisma.riderProfile.findMany({
      where: {
        status: { in: [RiderStatus.APPROVED, RiderStatus.SUSPENDED] },
        ...(roleStatus ? { roleStatus: roleStatus as RoleStatus } : {}),
        ...(workStatus ? { workStatus: workStatus as RiderWorkStatus } : {}),
      },
      include: {
        qualifications: true,
        vehicles: true,
        orders: { where: { status: { in: ACTIVE_STATUSES } }, select: { id: true, orderNo: true, status: true, serviceName: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
    return riders.map((rider) => ({
      ...rider,
      // 该接口受运营权限保护，完整号码用于后台精确检索。
      phone: rider.phone,
      currentOrders: rider.orders,
      deliveryCount: rider._count.orders,
    }))
  }

  async detail(riderId: string) {
    const rider = await this.findRider(riderId)
    const [history, logs] = await Promise.all([
      this.prisma.order.findMany({ where: { riderId }, orderBy: { updatedAt: 'desc' }, take: 100 }),
      this.prisma.riderStatusLog.findMany({ where: { riderId }, orderBy: { createdAt: 'desc' } }),
    ])
    return { ...rider, phone: this.maskPhone(rider.phone), history, logs }
  }

  async changeStatus(operatorId: string, riderId: string, action: 'suspend' | 'restore' | 'resign', reason: string) {
    if (!reason.trim()) throw new BadRequestException('状态变更必须填写原因')
    if (!['suspend', 'restore', 'resign'].includes(action)) throw new BadRequestException('无效的骑手状态操作')
    const rider = await this.findRider(riderId)
    if (rider.status !== RiderStatus.APPROVED && rider.status !== RiderStatus.SUSPENDED) throw new ConflictException('当前档案还不是可管理的骑手')
    const activeOrders = await this.prisma.order.count({ where: { riderId, status: { in: ACTIVE_STATUSES } } })
    if (activeOrders && action !== 'restore') throw new ConflictException('骑手仍有配送中的订单，请先完成或转派')
    const nextStatus = action === 'restore' ? RoleStatus.ACTIVE : action === 'suspend' ? RoleStatus.SUSPENDED : RoleStatus.RESIGNED
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.riderProfile.update({
        where: { id: riderId },
        data: {
          roleStatus: nextStatus,
          status: action === 'restore' ? RiderStatus.APPROVED : RiderStatus.SUSPENDED,
          online: false,
          workStatus: RiderWorkStatus.OFFLINE,
        },
        include: { qualifications: true, vehicles: true },
      })
      if (rider.userId) {
        await tx.userRoleAssignment.updateMany({ where: { userId: rider.userId, role: UserRole.RIDER }, data: { status: nextStatus } })
        await tx.riderStatusLog.create({
          data: {
            riderId,
            oldStatus: rider.roleStatus || RoleStatus.SUSPENDED,
            newStatus: nextStatus,
            reason: reason.trim(),
            operatedBy: operatorId,
          },
        })
        await tx.notification.create({
          data: {
            userId: rider.userId,
            type: 'RIDER_STATUS',
            title: action === 'restore' ? '骑手身份已恢复' : action === 'suspend' ? '骑手权限已暂停' : '骑手身份已标记离职',
            content: reason.trim(),
          },
        })
      }
      return updated
    })
  }

  async setOnline(riderId: string, online: boolean) {
    const rider = await this.findRider(riderId)
    const roleActive = rider.roleStatus ? rider.roleStatus === RoleStatus.ACTIVE : rider.status === RiderStatus.APPROVED
    if (online && (!roleActive || rider.status !== RiderStatus.APPROVED)) throw new ForbiddenException('骑手审核通过且身份有效后才能上线')
    return this.prisma.riderProfile.update({ where: { id: riderId }, data: { online, workStatus: online ? RiderWorkStatus.ONLINE : RiderWorkStatus.OFFLINE } })
  }

  async updateVehicles(riderId: string, dto: RiderVehicleUpdateDto) {
    const rider = await this.findRider(riderId)
    const roleActive = rider.roleStatus ? rider.roleStatus === RoleStatus.ACTIVE : rider.status === RiderStatus.APPROVED
    if (!rider.enabled || rider.status !== RiderStatus.APPROVED || !roleActive) throw new ForbiddenException('骑手身份当前不可用')
    const vehicleTypes = this.vehicleTypes(dto)
    return this.prisma.$transaction(async (tx) => {
      await tx.riderVehicle.deleteMany({ where: { riderId } })
      await tx.riderVehicle.createMany({
        data: vehicleTypes.map((vehicleType) => ({ riderId, vehicleType, vehicleName: this.vehicleNameForType(vehicleType), enabled: true, verified: true })),
      })
      return tx.riderProfile.update({
        where: { id: riderId },
        data: {
          vehicleType: vehicleTypes[0] || null,
          vehicleName: vehicleTypes[0] ? this.vehicleNameForType(vehicleTypes[0]) : '',
          online: vehicleTypes.length ? rider.online : false,
          workStatus: vehicleTypes.length ? rider.workStatus : RiderWorkStatus.OFFLINE,
        },
        include: { qualifications: true, vehicles: true },
      })
    })
  }

  async updateLocation(riderId: string, dto: RiderLocationDto) {
    const rider = await this.findRider(riderId)
    if (rider.roleStatus && rider.roleStatus !== RoleStatus.ACTIVE) throw new ForbiddenException('骑手身份当前不可用')
    if (!rider.online) throw new ConflictException('请先上线再上报位置')
    return this.prisma.riderProfile.update({
      where: { id: riderId },
      data: { latitude: dto.latitude, longitude: dto.longitude, lastLocationAt: new Date(), lastSeenAt: new Date() },
    })
  }

  async heartbeat(riderId: string, dto: RiderHeartbeatDto) {
    const rider = await this.findRider(riderId)
    if (rider.roleStatus && rider.roleStatus !== RoleStatus.ACTIVE) throw new ForbiddenException('骑手身份当前不可用')
    if (!rider.online) throw new ConflictException('骑手当前已下线')
    const hasLocation = dto.latitude !== undefined && dto.longitude !== undefined
    return this.prisma.riderProfile.update({
      where: { id: riderId },
      data: {
        lastSeenAt: new Date(),
        ...(hasLocation ? { latitude: dto.latitude, longitude: dto.longitude } : {}),
      },
    })
  }

  async availableOrders(riderId: string) {
    const rider = await this.assertAvailableRider(riderId)
    const platform = await (this.prisma as any).platformSetting?.findUnique?.({ where: { id: 'platform' }, select: { riderOrderRadiusMeters: true, riderMaxActiveOrders: true } })
    const maxActiveOrders = Math.min(rider.maxActiveOrders, Number(platform?.riderMaxActiveOrders || rider.maxActiveOrders))
    const activeCount = await this.prisma.order.count({ where: { riderId, status: { in: ACTIVE_STATUSES } } })
    if (activeCount >= maxActiveOrders) return []
    const qualifications = rider.qualifications.filter((item) => item.enabled).map((item) => item.serviceId)
    const vehicleTypes = this.riderVehicleTypes(rider)
    if (!vehicleTypes.length && !rider.handlingQualified) return []
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        paymentStatus: 'PAID',
        riderId: null,
        ...(qualifications.length ? { taskId: { in: qualifications } } : {}),
        OR: [
          ...(vehicleTypes.length ? [{ vehicleType: { in: vehicleTypes } }] : []),
          ...(rider.handlingQualified ? [{ vehicleType: VehicleType.MANUAL }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })
    const radiusKm = Number(platform?.riderOrderRadiusMeters || Number(this.config.get<string>('RIDER_ORDER_RADIUS_KM') || 30 * 1000)) / 1000
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
      const platform = await (tx as any).platformSetting?.findUnique?.({ where: { id: 'platform' }, select: { riderMaxActiveOrders: true } })
      const maxActiveOrders = Math.min(rider.maxActiveOrders, Number(platform?.riderMaxActiveOrders || rider.maxActiveOrders))
      if (activeCount >= maxActiveOrders) throw new ConflictException('当前任务已达上限')
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
    await this.assertActiveRole(riderId)
    return this.prisma.order.findMany({ where: { riderId, status: { in: ACTIVE_STATUSES } }, orderBy: { acceptedAt: 'asc' } })
  }

  async history(riderId: string) {
    await this.assertActiveRole(riderId)
    return this.prisma.order.findMany({
      where: { riderId, status: { in: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })
  }

  async income(riderId: string) {
    await this.assertActiveRole(riderId)
    const orders = await this.prisma.order.findMany({ where: { riderId, status: OrderStatus.COMPLETED }, select: { totalFeeFen: true } })
    return { completedOrders: orders.length, grossAmountFen: orders.reduce((sum, order) => sum + order.totalFeeFen, 0) }
  }

  async updateStatus(riderId: string, orderId: string, dto: RiderStatusDto) {
    await this.assertActiveRole(riderId)
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
    await this.assertActiveRole(riderId)
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
    if (rider.status !== RiderStatus.APPROVED || (rider.roleStatus && rider.roleStatus !== RoleStatus.ACTIVE)) throw new BadRequestException('只能指派给当前有效的骑手')
    if (!rider.online || (rider.workStatus && rider.workStatus !== RiderWorkStatus.ONLINE)) throw new ConflictException('只能指派给在线待接单骑手')
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
    const roleActive = rider.roleStatus ? rider.roleStatus === RoleStatus.ACTIVE : rider.status === RiderStatus.APPROVED
    if (!rider.enabled || rider.status !== RiderStatus.APPROVED || !roleActive) throw new ForbiddenException('骑手身份当前不可用')
    if (!rider.online) throw new ConflictException('请先上线')
    if (this.heartbeatExpired(rider.lastSeenAt)) {
      await this.prisma.riderProfile.update({ where: { id: riderId }, data: { online: false } })
      throw new ConflictException('在线状态已过期，请重新上线')
    }
    return rider
  }

  private async assertActiveRole(riderId: string) {
    const rider = await this.findRider(riderId)
    const roleActive = rider.roleStatus ? rider.roleStatus === RoleStatus.ACTIVE : rider.status === RiderStatus.APPROVED
    if (!rider.enabled || rider.status !== RiderStatus.APPROVED || !roleActive) throw new ForbiddenException('骑手身份当前不可用')
    return rider
  }

  private vehicleTypes(source: { vehicleType?: VehicleType; vehicleTypes?: VehicleType[] }) {
    return Array.from(new Set([...(source.vehicleTypes || []), source.vehicleType].filter(Boolean))) as VehicleType[]
  }

  private riderVehicleTypes(rider: Awaited<ReturnType<RidersService['findRider']>>) {
    const configured = (rider.vehicles || []).filter((vehicle) => vehicle.enabled && vehicle.verified).map((vehicle) => vehicle.vehicleType)
    return configured.length ? configured : (rider.vehicleType ? [rider.vehicleType] : [])
  }

  private vehicleNameForType(vehicleType: VehicleType) {
    const labels: Record<VehicleType, string> = {
      [VehicleType.EBIKE]: '二轮车',
      [VehicleType.ETRIKE]: '货三轮车',
      [VehicleType.VAN]: '小车',
      [VehicleType.MANUAL]: '人力服务',
    }
    return labels[vehicleType]
  }

  private heartbeatExpired(lastSeenAt: Date | null) {
    if (!lastSeenAt) return false
    const timeoutSeconds = Number(this.config.get<string>('RIDER_HEARTBEAT_TIMEOUT_SECONDS') || 90)
    return Date.now() - lastSeenAt.getTime() > timeoutSeconds * 1000
  }

  private async findRider(riderId: string) {
    const rider = await this.prisma.riderProfile.findUnique({ where: { id: riderId }, include: { qualifications: true, vehicles: true } })
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
    const vehicleMatches = this.riderVehicleTypes(rider).includes(order.vehicleType as VehicleType) || (order.vehicleType === VehicleType.MANUAL && rider.handlingQualified)
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

  private maskPhone(phone: string) {
    const value = String(phone || '')
    return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value
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
