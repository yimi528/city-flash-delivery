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
    const baseDistanceKm = Number(dto.baseDistanceKm ?? 4)
    const basePrice = Number(dto.basePrice ?? rule.baseFee)
    const extraPerKm = Number(dto.extraPerKm ?? rule.distanceRate)
    const linePrice = Number(dto.linePrice || 0)
    const linePriceMultiplier = Number(dto.linePriceMultiplier ?? rule.linePriceMultiplier)
    const serviceSurcharge = Number(dto.serviceSurcharge || 0)
    const maxDeliveryFee = Number(dto.maxDeliveryFee ?? rule.maxDeliveryFee)
    const isBuyForMe = dto.serviceType === 'BUY_FOR_ME' || dto.serviceName === '帮买'
    const productFee = isBuyForMe ? Number(dto.productFee ?? dto.budget ?? 0) : 0
    const isFixedLine = pricingMode === 'fixed_line_parcel' || pricingMode === 'fixed_line_ride'
    const isManualQuote = pricingMode === 'manual_quote'
    let baseFee = 0
    let distanceFee = 0
    let weatherFee = 0
    let serviceFee = 0
    let discountFee = 0

    if (isFixedLine) {
      baseFee = (linePrice || basePrice) * linePriceMultiplier + serviceSurcharge
      serviceFee = Math.min(baseFee, maxDeliveryFee)
      discountFee = Math.max(baseFee - serviceFee, 0)
    } else {
      baseFee = basePrice + serviceSurcharge
      distanceFee = Math.max(distanceKm - baseDistanceKm, 0) * extraPerKm
      const subtotal = baseFee + distanceFee
      const multiplier = !isManualQuote && pricingMode === 'distance_weather' && dto.badWeather
        ? Number(dto.badWeatherMultiplier || 1.15)
        : 1
      weatherFee = subtotal * (multiplier - 1)
      const uncappedServiceFee = subtotal + weatherFee
      serviceFee = Math.min(uncappedServiceFee, maxDeliveryFee)
      discountFee = Math.max(uncappedServiceFee - serviceFee, 0)
    }

    const weightFee = 0
    const vehicleFee = 0
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
      linePriceMultiplier,
      serviceSurcharge: Number(serviceSurcharge.toFixed(1)),
      maxDeliveryFee: Number(maxDeliveryFee.toFixed(1)),
      baseFee: Number(baseFee.toFixed(1)),
      distanceFee: Number(distanceFee.toFixed(1)),
      weightFee: Number(weightFee.toFixed(1)),
      vehicleFee,
      weatherFee: Number(weatherFee.toFixed(1)),
      discountFee: Number(discountFee.toFixed(1)),
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
    if (serviceName === '拼车' || serviceName === '顺风车') return 'fixed_line_ride'
    if (['搬运装卸', '搬家', '搬家/搬店', '装货', '卸货'].includes(serviceName || '')) return 'handling_fixed'
    if (['DELIVERY', 'PICKUP', 'BUY_FOR_ME'].includes(serviceType || '')) return 'distance_weather'
    return 'distance'
  }
}
