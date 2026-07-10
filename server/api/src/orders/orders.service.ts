import { Injectable, NotFoundException } from '@nestjs/common'
import { nextOrderStatus, ORDER_STATUS_FLOW, type OrderStatus } from '../common/constants/order.constants'
import { PricingService } from '../pricing/pricing.service'
import { CreateOrderDto, QuoteOrderDto, UpdateOrderStatusDto } from './orders.dto'

type MockOrder = {
  id: string
  userId: string
  serviceType: string
  serviceName: string
  status: OrderStatus
  statusIndex: number
  vehicleType: string
  vehicleName: string
  pickupName: string
  pickupDetail: string
  dropoffName: string
  dropoffDetail: string
  item: string
  distanceKm: number
  weightKg: number
  pricingMode: string
  isManualQuote: boolean
  quotedFee: number | null
  quoteStatus: 'NONE' | 'PENDING' | 'QUOTED'
  quoteNote: string
  quoteUpdatedAt: string | null
  totalFee: number
  remark: string
  createdAt: string
  updatedAt: string
}

@Injectable()
export class OrdersService {
  private readonly orders = new Map<string, MockOrder>()

  constructor(private readonly pricingService: PricingService) {}

  list(userId?: string) {
    return Array.from(this.orders.values())
      .filter((order) => !userId || order.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  findById(id: string) {
    const order = this.orders.get(id)
    if (!order) throw new NotFoundException('Order not found')
    return order
  }

  create(dto: CreateOrderDto) {
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
    const now = new Date().toISOString()
    const id = `N${Date.now()}`
    const order: MockOrder = {
      id,
      userId: dto.userId || 'demo-user',
      serviceType: dto.serviceType,
      serviceName: dto.serviceName || estimate.serviceName || dto.serviceType,
      status: 'PENDING',
      statusIndex: 0,
      vehicleType: dto.vehicleType,
      vehicleName: dto.vehicleName || estimate.vehicleName,
      pickupName: dto.pickupName,
      pickupDetail: dto.pickupDetail,
      dropoffName: dto.dropoffName,
      dropoffDetail: dto.dropoffDetail,
      item: dto.item || '同城配送物品',
      distanceKm: estimate.distanceKm,
      weightKg: estimate.weightKg,
      pricingMode: estimate.pricingMode,
      isManualQuote: estimate.isManualQuote,
      quotedFee: estimate.isManualQuote ? null : estimate.totalFee,
      quoteStatus: estimate.isManualQuote ? 'PENDING' : 'NONE',
      quoteNote: '',
      quoteUpdatedAt: null,
      totalFee: estimate.totalFee,
      remark: dto.remark || '',
      createdAt: now,
      updatedAt: now,
    }
    this.orders.set(id, order)
    return order
  }

  updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = this.findById(id)
    const status = dto.status || nextOrderStatus(order.status)
    const updated: MockOrder = {
      ...order,
      status,
      statusIndex: ORDER_STATUS_FLOW.indexOf(status),
      updatedAt: new Date().toISOString(),
    }
    this.orders.set(id, updated)
    return updated
  }

  quote(id: string, dto: QuoteOrderDto) {
    const order = this.findById(id)
    const quotedFee = Number(dto.quotedFee)
    const updated: MockOrder = {
      ...order,
      quotedFee,
      quoteStatus: 'QUOTED',
      quoteNote: dto.quoteNote || '',
      quoteUpdatedAt: new Date().toISOString(),
      totalFee: Number(quotedFee.toFixed(1)),
      updatedAt: new Date().toISOString(),
    }
    this.orders.set(id, updated)
    return updated
  }
}
