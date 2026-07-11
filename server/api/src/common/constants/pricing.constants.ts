import type { VehicleType } from './order.constants'

export const VEHICLE_PRICING: Record<VehicleType, {
  label: string
  baseFee: number
  distanceRate: number
  linePriceMultiplier: number
  maxDeliveryFee: number
  weightRate: number
  vehicleFee: number
  maxWeightKg: number
}> = {
  EBIKE: {
    label: '二轮车',
    baseFee: 10,
    distanceRate: 1.6,
    linePriceMultiplier: 0.55,
    maxDeliveryFee: 68,
    weightRate: 0,
    vehicleFee: 0,
    maxWeightKg: 10,
  },
  ETRIKE: {
    label: '货三轮车',
    baseFee: 28,
    distanceRate: 2.8,
    linePriceMultiplier: 0.85,
    maxDeliveryFee: 138,
    weightRate: 0,
    vehicleFee: 0,
    maxWeightKg: 300,
  },
  VAN: {
    label: '小车',
    baseFee: 35,
    distanceRate: 3.2,
    linePriceMultiplier: 1,
    maxDeliveryFee: 168,
    weightRate: 0,
    vehicleFee: 0,
    maxWeightKg: 30,
  },
}
