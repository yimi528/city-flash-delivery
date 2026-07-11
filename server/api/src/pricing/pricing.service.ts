import { Injectable } from '@nestjs/common'
import { VEHICLE_PRICING } from '../common/constants/pricing.constants'
import { EstimatePriceDto } from './pricing.dto'

@Injectable()
export class PricingService {
  estimate(dto: EstimatePriceDto) {
    const vehicleType = dto.vehicleType || 'EBIKE'
    const rule = VEHICLE_PRICING[vehicleType]
    const distanceKm = Number(dto.distanceKm || 2.6)
    const weightKg = Number(dto.weightKg || 1)
    const pricingMode = dto.pricingMode || this.inferPricingMode(dto.serviceType, dto.serviceName)
    const baseDistanceKm = Number(dto.baseDistanceKm || 4)
    const basePrice = Number(dto.basePrice || rule.baseFee)
    const extraPerKm = Number(dto.extraPerKm || rule.distanceRate)
    const linePrice = Number(dto.linePrice || 0)
    const isBuyForMe = dto.serviceType === 'BUY_FOR_ME' || dto.serviceName === '帮买'
    const productFee = isBuyForMe ? Number(dto.productFee ?? dto.budget ?? 0) : 0
    const isFixedLine = pricingMode === 'fixed_line_parcel' || pricingMode === 'fixed_line_ride'
    const isManualQuote = pricingMode === 'manual_quote'
    let baseFee = 0
    let distanceFee = 0
    let weatherFee = 0
    let serviceFee = 0

    if (isFixedLine) {
      baseFee = linePrice || basePrice
      serviceFee = baseFee
    } else {
      baseFee = basePrice
      distanceFee = Math.max(distanceKm - baseDistanceKm, 0) * extraPerKm
      const subtotal = baseFee + distanceFee
      const multiplier = !isManualQuote && pricingMode === 'distance_weather' && dto.badWeather
        ? Number(dto.badWeatherMultiplier || 1.2)
        : 1
      weatherFee = subtotal * (multiplier - 1)
      serviceFee = subtotal + weatherFee
    }

    const weightFee = 0
    const vehicleFee = 0
    const discountFee = 0
    const deliveryFee = serviceFee
    const total = deliveryFee + productFee

    return {
      serviceType: dto.serviceType || 'DELIVERY',
      vehicleType,
      serviceName: dto.serviceName || '',
      vehicleName: dto.vehicleName || rule.label,
      pricingMode,
      distanceKm: Number(distanceKm.toFixed(1)),
      weightKg: Number(weightKg.toFixed(1)),
      baseDistanceKm,
      extraPerKm,
      baseFee: Number(baseFee.toFixed(1)),
      distanceFee: Number(distanceFee.toFixed(1)),
      weightFee: Number(weightFee.toFixed(1)),
      vehicleFee,
      weatherFee: Number(weatherFee.toFixed(1)),
      discountFee,
      productFee: Number(productFee.toFixed(1)),
      deliveryFee: Number(deliveryFee.toFixed(1)),
      serviceFee: Number(serviceFee.toFixed(1)),
      budget: Number(productFee.toFixed(1)),
      totalFee: Number(total.toFixed(1)),
      isManualQuote,
    }
  }

  private inferPricingMode(serviceType?: string, serviceName?: string) {
    if (serviceName === '寄货') return 'fixed_line_parcel'
    if (serviceName === '拼车') return 'fixed_line_ride'
    if (['搬家/搬店', '装货', '卸货'].includes(serviceName || '')) return 'manual_quote'
    if (['DELIVERY', 'PICKUP', 'BUY_FOR_ME'].includes(serviceType || '')) return 'distance_weather'
    return 'distance'
  }
}
