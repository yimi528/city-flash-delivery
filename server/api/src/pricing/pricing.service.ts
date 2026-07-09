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
    const distanceFee = Math.max(distanceKm - 1, 0) * rule.distanceRate
    const weightFee = Math.max(weightKg - 1, 0) * rule.weightRate
    const discountFee = 3
    const total = Math.max(rule.baseFee + distanceFee + weightFee + rule.vehicleFee - discountFee, 6.9)

    return {
      serviceType: dto.serviceType || 'DELIVERY',
      vehicleType,
      vehicleName: rule.label,
      distanceKm: Number(distanceKm.toFixed(1)),
      weightKg: Number(weightKg.toFixed(1)),
      baseFee: rule.baseFee,
      distanceFee: Number(distanceFee.toFixed(1)),
      weightFee: Number(weightFee.toFixed(1)),
      vehicleFee: rule.vehicleFee,
      discountFee,
      totalFee: Number(total.toFixed(1)),
    }
  }
}
